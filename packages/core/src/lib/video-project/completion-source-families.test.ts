import { it, expect } from "vitest";
import { createVideoProjectDocument } from "./document";
import {
  executeVideoProjectCommands,
  type VideoProjectCommand,
} from "./commands";
import {
  captionSourceCommands,
  speechBindingCommand,
  speechCutCommands,
} from "./semantic";
import { sourceWindow } from "./source-clock";
import { checkNativeCompletionRequirements } from "./completion-preflight";
import { completionSourceFamilies } from "./completion-source-families";
function fixture() {
  let before = createVideoProjectDocument({
    width: 640,
    height: 360,
    fps: 30,
    durationInFrames: 120,
  });
  before.assets.a = { id: "a", name: "Speech", type: "video", source: "local" };
  before.sources.a = { assetId: "a", revision: "original" };
  const words = [
    ["Hello", 100, 400],
    ["uh", 820, 900],
    ["Andrew", 1200, 1500],
    ["Ng", 1500, 1800],
    ["world", 2000, 2200],
  ].map(([text, startMs, endMs], i) => ({
    id: String(i),
    text: String(text),
    startMs: Number(startMs),
    endMs: Number(endMs),
  }));
  before.evidence.e = {
    id: "e",
    sourceAssetId: "a",
    sourceRevision: "original",
    transcriptHash: "retained",
    text: words.map((w) => w.text).join(" "),
    words,
  };
  before.items = [
    {
      id: "source",
      name: "Speech",
      trackId: "visual",
      node: {
        id: "source",
        type: "video",
        assetId: "a",
        from: 0,
        duration: 120,
        style: { width: 640, height: 360 },
      },
    },
    {
      id: "callout",
      name: "Name",
      trackId: "visual",
      node: {
        id: "callout",
        type: "text",
        text: "Andrew Ng",
        from: 0,
        duration: 30,
        style: { width: 400, height: 60, fontSize: 30 },
      },
    },
  ];
  before = executeVideoProjectCommands(
    before,
    captionSourceCommands(before, {
      sourceItemId: "source",
      evidenceId: "e",
      itemId: "en",
      trackId: "visual",
      phraseSafe: true,
    }),
  ).document;
  const en = before.items.find((i) => i.id === "en")!;
  en.caption = {
    ...en.caption!,
    role: "original",
    language: "en",
    pairedItemId: "es",
  };
  en.node.style = {
    ...en.node.style,
    fontSize: 20,
    top: 230,
    height: 50,
    color: "#ffffff",
  };
  const es = structuredClone(en);
  es.id = "es";
  es.node.id = "es";
  es.node.style = { ...es.node.style, top: 295, color: "#00ff00" };
  es.caption = {
    ...es.caption!,
    role: "translation",
    language: "es",
    pairedItemId: "en",
  };
  before.items.push(es);
  before = executeVideoProjectCommands(before, [
    speechBindingCommand(before, {
      id: "name",
      itemId: "callout",
      sourceItemId: "source",
      evidenceId: "e",
      wordIds: ["2", "3"],
      holdMs: 900,
    }),
  ]).document;
  const commands = speechCutCommands(before, {
      sourceItemId: "source",
      evidenceId: "e",
      wordIds: ["1"],
      mode: "remove",
    }),
    after = executeVideoProjectCommands(before, commands).document;
  const requirements = [
    {
      id: "pair",
      kind: "caption_pair",
      sourceItemId: "source",
      evidenceId: "e",
      originalItemId: "en",
      translatedItemId: "es",
      originalLanguage: "en",
      translatedLanguage: "es",
      originalColor: "#ffffff",
      translatedColor: "#00ff00",
    },
    {
      id: "name",
      kind: "speech_callout",
      bindingId: "name",
      itemId: "callout",
      sourceItemId: "source",
      evidenceId: "e",
      wordIds: ["2", "3"],
      exactText: "Andrew Ng",
      minReadableMs: 900,
    },
  ];
  return { before, after, commands, requirements };
}
function repair(f: ReturnType<typeof fixture>) {
  const commands: VideoProjectCommand[] = [...f.commands];
  for (const source of f.after.items.filter((i) => i.node.type === "video")) {
    const original = f.after.items.find(
        (i) =>
          i.caption?.sourceItemId === source.id &&
          i.caption.role === "original",
      )!,
      translated = f.after.items.find(
        (i) => i.id === original.caption!.pairedItemId,
      )!;
    const expected = captionSourceCommands(f.after, {
      sourceItemId: source.id,
      evidenceId: "e",
      itemId: "expected",
      trackId: "visual",
      phraseSafe: true,
      sourceCoverage: sourceWindow(f.before.items[0]!, 30),
    }).find((c) => c.type === "addItem");
    if (expected?.type !== "addItem") throw Error("No cues");
    for (const [item, translation] of [
      [original, false],
      [translated, true],
    ] as const)
      commands.push({
        type: "set",
        target: { kind: "caption", itemId: item.id },
        path: ["cues"],
        value: expected.item.caption!.cues.map((c) => ({
          ...c,
          ...(translation ? { text: "Traducción " + c.text } : {}),
        })),
      });
  }
  return {
    ...f,
    commands,
    after: executeVideoProjectCommands(f.before, commands).document,
  };
}
const grade = (f: ReturnType<typeof fixture>, current = true) =>
  checkNativeCompletionRequirements(
    f.before,
    f.after,
    f.requirements,
    current
      ? { speechCompletion: "source-fragments-v1", commands: f.commands }
      : {},
  );
it("retains a frozen word anchor across trusted cuts but rejects stale split captions", () => {
  const f = fixture(),
    checks = grade(f);
  expect(checks.find((c) => c.id === "name")?.passed).toBe(true);
  expect(checks.find((c) => c.id === "pair")).toMatchObject({
    passed: false,
    message: expect.stringContaining("Edited speech cues"),
  });
  expect(grade(f, false).find((c) => c.id === "name")?.passed).toBe(false);
});
it("checks complete original and translated cues on every proven surviving fragment", () => {
  const f = repair(fixture()),
    checks = grade(f);
  expect(
    checks.every((c) => c.passed),
    JSON.stringify(checks),
  ).toBe(true);
  expect(
    f.after.items
      .filter((i) => i.caption?.role === "original")
      .flatMap((i) => i.caption!.cues)
      .some((c) => /\buh\b/.test(c.text)),
  ).toBe(false);
  expect(f.after.evidence).toEqual(f.before.evidence);
});
it("rejects a missing fragment pair or fabricated translated timing", () => {
  for (const mode of ["missing", "timing"]) {
    const f = repair(fixture()),
      second = f.after.items.find(
        (i) =>
          i.caption?.role === "translation" &&
          i.caption.sourceItemId !== "source",
      )!;
    const command: VideoProjectCommand =
      mode === "missing"
        ? { type: "removeItem", id: second.id }
        : {
            type: "set",
            target: {
              kind: "cue",
              itemId: second.id,
              cueId: second.caption!.cues[0]!.id,
            },
            path: ["endMs"],
            value: second.caption!.cues[0]!.endMs + 10,
          };
    if (mode === "missing")
      f.commands.push({
        type: "removeItem",
        id: second.caption!.pairedItemId!,
      });
    f.commands.push(command);
    f.after = executeVideoProjectCommands(f.before, f.commands).document;
    expect(grade(f).find((c) => c.id === "pair")?.passed).toBe(false);
  }
});
it("binds lineage to the exact replay and does not trust a source-like duplicate ID", () => {
  const f = repair(fixture());
  expect(() =>
    completionSourceFamilies(f.before, f.after, [
      {
        type: "set",
        target: { kind: "format" },
        path: ["backgroundColor"],
        value: "#fefefe",
      },
    ]),
  ).toThrow(/reproduce/);
  const duplicate: VideoProjectCommand = {
    type: "duplicateItem",
    id: "source",
    newId: "source:cut:999",
  };
  const after = executeVideoProjectCommands(f.before, [duplicate]).document;
  const families = completionSourceFamilies(f.before, after, [duplicate]);
  expect(families.splitRoots.size).toBe(0);
  expect(families.bySource.get("source")?.map((i) => i.id)).toEqual(["source"]);
});
it("native caption authoring uses the host split trace and retains legacy cue generation without the flag", async () => {
  const { compileNativeAgentResult } = await import("./agent-runtime");
  const { hashVideoProjectDocument } = await import("./document");
  const f = fixture();
  const base = {
    contract: "video-project-commands" as const,
    version: 1 as const,
    baseRevision: 0,
    baseHash: await hashVideoProjectDocument(f.before),
    document: f.before,
    instruction: "Remove the filler word and regenerate its source captions.",
    context: { selectedItemIds: [], playheadFrame: 0 },
  };
  const edit = {
    outcome: "proposal",
    summary: "Cut the genuine filler and regenerate source captions",
    commands: [
      {
        type: "cutSpeech",
        sourceItemId: "source",
        evidenceId: "e",
        wordIds: ["1"],
        mode: "remove",
      },
      {
        type: "captionSource",
        sourceItemId: "source",
        evidenceId: "e",
        itemId: "fresh",
        trackId: "visual",
      },
    ],
  };
  for (const current of [false, true]) {
    const r = await compileNativeAgentResult(
      {
        ...base,
        authoring: {
          version: 1,
          ...(current
            ? { speechCompletion: "source-fragments-v1" as const }
            : {}),
        },
      },
      edit,
    );
    const d = executeVideoProjectCommands(
      f.before,
      r.proposal!.commands,
    ).document;
    expect(
      d.items
        .find((i) => i.id === "fresh")!
        .caption!.cues.some((c) => /\buh\b/.test(c.text)),
    ).toBe(!current);
  }
});
it('preserves missing-timing coverage after cuts instead of approving incomplete ASR evidence',()=>{const f=repair(fixture());f.before.evidence.e!.transcriptHash='sha256:'+'a'.repeat(64);const ids=new Map(f.before.evidence.e!.words.map((w,i)=>[w.id,'w:aaaaaaaaaaaaaaaa:'+(i===4?5:i)]));for(const w of f.before.evidence.e!.words)w.id=ids.get(w.id)!;for(const b of Object.values(f.before.bindings))if(b.wordIds)b.wordIds=b.wordIds.map(id=>ids.get(id)!);for(const r of f.requirements)if('wordIds'in r&&r.wordIds)r.wordIds=r.wordIds.map(id=>ids.get(id)!);f.before.evidence.e!.timingOmissions=[{tokenIndex:4,text:'missing',startMs:1900,endMs:1900,reason:'nonpositive-duration'}];f.after=executeVideoProjectCommands(f.before,f.commands).document;expect(grade(f).find(c=>c.id==='pair')).toMatchObject({passed:false,message:expect.stringContaining('without genuine positive-duration timing')})});

it('reports the exact proven surviving source when an anchor is authored after cuts against the old source ID',()=>{const f=fixture();f.commands.push({type:'bindSource',binding:{...f.after.bindings.name!,sourceItemId:'source'}});f.after=executeVideoProjectCommands(f.before,f.commands).document;expect(grade(f).find(c=>c.id==='name')).toMatchObject({passed:false,message:expect.stringMatching(/Reapply anchorSpeech.*sourceItemId source:cut:/)})});
