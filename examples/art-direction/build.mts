import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { localSkillCatalog } from "../../apps/server/src/skill-loader";
import { runAgent } from "../../packages/agent/src/loop";
import { profileKitVersion } from "../../packages/agent-kit/src/index";
import {
  createVideoProjectDocument,
  hashVideoProjectDocument,
} from "../../packages/core/src/lib/video-project/document";
import { executeVideoProjectCommands } from "../../packages/core/src/lib/video-project/commands";
import { compileVideoProjectDocument } from "../../packages/core/src/lib/video-project/compilation";
import { designEdit } from "./directions.mjs";

const directory = path.resolve(process.argv[2] ?? "test-results/night-garden");
await mkdir(directory, { recursive: true });
const catalog = await localSkillCatalog(process.cwd());
const brief =
  "Create an eight-second motion identity for Night Garden, a botanical exhibition after hours. Use the supporting line Botanical after hours. Keep type and artwork editable.";
for (const direction of ["nocturne", "press"]) {
  const review = designEdit(direction),
    document = createVideoProjectDocument({
      width: 1280,
      height: 720,
      fps: 30,
      durationInFrames: 240,
    });
  const baseHash = await hashVideoProjectDocument(document);
  let step = 0;
  const unavailable = async () => {
    throw Error("No external jobs in the specimen");
  };
  const result = await runAgent({
    request: {
      contract: "video-project-commands",
      version: 1,
      baseRevision: 0,
      baseHash,
      document,
      instruction: brief,
      context: { selectedItemIds: [], playheadFrame: 0 },
      authoring: { version: 1, scope: { kind: "project" } },
    },
    profile: "local-editor-v14",
    agentKitVersion: profileKitVersion("local-editor-v14"),
    skills: catalog.newRunSkills!,
    signal: new AbortController().signal,
    stages: {
      generalEditing: true,
      preparedCommands: false,
      planEditStages: unavailable,
      saveCaptionBatch: unavailable,
      readEditArtifact: unavailable,
      resolvePreparedEdit: async (v) => v,
    },
    model: {
      identity: "offline-art-directed-specimen",
      async complete(messages) {
        let name, args;
        if (step === 0) {
          name = "read_skill";
          args = { name: "type-and-color" };
        } else if (step === 1) {
          const guide = String(messages.at(-1)?.content);
          const tokens =
            direction === "nocturne"
              ? [
                  "Moon garden",
                  "Fraunces",
                  "IBM Plex Mono",
                  "#21172E",
                  "#F8EFDA",
                  "#DDF583",
                ]
              : [
                  "Ink press",
                  "Anton",
                  "Space Grotesk",
                  "#F6C5BB",
                  "#252035",
                  "#BC3827",
                ];
          for (const token of tokens)
            assert.ok(
              guide.includes(token),
              "Missing art direction token: " + token,
            );
          name = "review_edit";
          args = review;
        } else if (step === 2) {
          const feedback = JSON.parse(String(messages.at(-1)?.content));
          assert.equal(
            feedback.completionPreflight?.status,
            "passed",
            JSON.stringify(feedback),
          );
          name = "propose_edit";
          args = { reviewed: true };
        } else throw Error("Unexpected extra request");
        return {
          text: "",
          calls: [
            { id: "specimen-" + ++step, name, arguments: JSON.stringify(args) },
          ],
        };
      },
    },
  });
  assert.ok(result.proposal, "Expected a native reviewed proposal");
  const edited = executeVideoProjectCommands(
    document,
    result.proposal.commands,
  ).document;
  assert.equal(
    await hashVideoProjectDocument(edited),
    result.proposal.previewHash,
  );
  const fonts = Object.values(edited.assets).map(
    (a) => a.mediaMetadata?.fontFamily,
  );
  for (const name of direction === "nocturne"
    ? ["Fraunces", "IBM Plex Mono"]
    : ["Anton", "Space Grotesk"])
    assert.ok(fonts.includes(name), "Missing registered font: " + name);
  const write = (suffix: string, value: unknown) =>
    writeFile(
      path.join(directory, direction + suffix + ".json"),
      JSON.stringify(value, null, 2) + "\n",
    );
  await write("-document", edited);
  await write("-commands", result.proposal.commands);
  await write("-scene", compileVideoProjectDocument(edited).scene);
  console.log(direction, result.proposal.previewHash, fonts);
}
