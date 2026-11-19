import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const [sourceArg, outArg, projectId, runId, expected] = process.argv.slice(2);
if (
  !sourceArg ||
  !outArg ||
  !projectId ||
  !runId ||
  !/^sha256:[a-f0-9]{64}$/.test(expected ?? "")
)
  throw Error(
    "Usage: node scripts/verify-reviewed-edit-recovery-browser.mjs SAVED_STORE NEW_DIRECTORY PROJECT_ID RUN_ID EXPECTED_HASH",
  );
const source = await realpath(sourceArg),
  out = path.resolve(outArg);
if (out === source || out.startsWith(source + path.sep))
  throw Error("Use a separate evidence directory.");
await mkdir(out);
const data = path.join(out, "store");
const savedPath = path.join(
  data,
  "projects",
  encodeURIComponent(projectId) + ".json",
);
await mkdir(path.dirname(savedPath), { recursive: true });
await copyFile(
  path.join(source, "projects", encodeURIComponent(projectId) + ".json"),
  savedPath,
);
const before = JSON.parse(await readFile(savedPath, "utf8"));
assert.ok(
  before.runs.every((run) =>
    ["applied", "cancelled", "failed", "stale"].includes(run.status),
  ),
  "Use a stopped fixture without live jobs.",
);
const original = before.runs.find((run) => run.id === runId);
assert.equal(original?.status, "failed");
let providerRequests = 0;
const guard = createServer((_request, response) => {
  providerRequests++;
  response.writeHead(503).end();
});
guard.listen(0, "127.0.0.1");
await once(guard, "listening");
const denied = "http://127.0.0.1:" + guard.address().port + "/v1";
const reserve = createServer();
reserve.listen(0, "127.0.0.1");
await once(reserve, "listening");
const port = reserve.address().port;
await new Promise((ok) => reserve.close(ok));
const base = "http://127.0.0.1:" + port;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ],
  {
    stdio: "ignore",
    env: {
      ...process.env,
      DATA_DIR: data,
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1",
      LLM_BASE_URL: denied,
      LLM_API_KEY: "offline-fixture",
      ASR_BASE_URL: denied,
      ASR_API_KEY: "offline-fixture",
    },
  },
);
let browser;
try {
  browser = await chromium.launch();
  const api = base + "/api/projects/" + encodeURIComponent(projectId);
  const get = async (suffix) => {
    const response = await fetch(api + suffix);
    assert.ok(response.ok);
    return (await response.json()).data;
  };
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw Error("Local editor exited");
    try {
      if ((await get("/document")).documentHash === before.documentHash) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, "The isolated editor did not open the saved project.");
  const page = await browser.newPage({
    viewport: { width: 1460, height: 930 },
  });
  const errors = [],
    posts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let lostAcknowledgements = 0;
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (req.method() === "POST") posts.push(url.pathname);
    if (url.pathname.endsWith("/recover-reviewed") && !lostAcknowledgements) {
      const persisted = await route.fetch();
      assert.equal(persisted.status(), 200);
      lostAcknowledgements++;
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  const address =
    base + "/en/applications/editor/" + encodeURIComponent(projectId);
  await page.goto(address);
  await page.getByTestId("dojo-video-engine-editor").waitFor();
  const showChat = async () => {
    const toggle = page.getByRole("button", {
      name: "Toggle chat",
      exact: true,
    });
    if ((await toggle.getAttribute("aria-expanded")) === "false")
      await toggle.click();
  };
  await showChat();
  await page
    .getByRole("button", { name: "Recover reviewed edit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .waitFor();
  assert.equal((await get("/document")).documentHash, before.documentHash);
  await page
    .getByRole("alert")
    .filter({ hasText: /recover|network|fetch/i })
    .waitFor({ state: "hidden" });
  await page.reload();
  await showChat();
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Review this edit" });
  await dialog.waitFor();
  assert.equal((await get("/document")).documentHash, before.documentHash);
  await page.screenshot({ path: path.join(out, "review.png") });
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  const final = await get("/document");
  assert.equal(final.documentHash, expected);
  assert.equal(final.revision, before.revision + 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByTestId("dojo-video-engine-editor").waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  const state = JSON.parse(await readFile(savedPath, "utf8"));
  const retained = state.runs.find((run) => run.id === runId);
  assert.deepEqual(retained.error, original.error);
  assert.deepEqual(retained.loopCheckpoint, original.loopCheckpoint);
  assert.equal(
    state.runs.filter((run) => run.recoveredFromRunId === runId).length,
    1,
  );
  assert.equal(posts.filter((url) => url.endsWith("/apply")).length, 1);
  assert.equal(lostAcknowledgements, 1);
  assert.equal(providerRequests, 0);
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    lostAcknowledgements,
    providerRequests,
    finalHash: final.documentHash,
    revisionDelta: final.revision - before.revision,
    explicitApply: true,
    reload: true,
    narrow: true,
  };
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(result);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  guard.close();
}
