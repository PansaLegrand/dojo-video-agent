import { it, expect } from "vitest";
import {
  assertNativeTranscriptCoverage,
  nativeTranscriptWholeRemovalQueries,
  nativeTranscriptSearchOverview,
  type NativeTranscriptSnapshot,
} from "./agent-transcript-search";
function fixture(instruction: string): NativeTranscriptSnapshot {
  return {
    baseHash: "sha256:" + "a".repeat(64),
    instruction,
    context: { selectedItemIds: [] },
    authoring: { speechRemovalScope: "clause-v1", scope: { kind: "project" } },
    document: {
      format: { fps: 30 },
      items: [
        {
          id: "interview",
          name: "Interview",
          node: { type: "video", assetId: "source", from: 0, duration: 120 },
        },
      ],
      assets: { source: { name: "Interview" } },
      sources: { source: { revision: "v1" } },
      evidence: {
        e: {
          id: "e",
          sourceAssetId: "source",
          sourceRevision: "v1",
          transcriptHash: "unchanged",
          words: [
            { id: "a", text: "uh", startMs: 500, endMs: 600 },
            { id: "b", text: "hello", startMs: 1000, endMs: 1200 },
            { id: "c", text: "uh", startMs: 2000, endMs: 2100 },
          ],
        },
      },
    },
  };
}
const edit = {
  outcome: "proposal",
  commands: ["a", "c"].map((id) => ({
    type: "cutSpeech",
    sourceItemId: "interview",
    evidenceId: "e",
    wordIds: [id],
    mode: "remove",
  })),
};
it("does not turn all-picture preservation into all-quoted-phrase removal in a compound speech edit", () => {
  const instruction =
    "Keep the news then interview and preserve all remaining original picture and sound. Remove the two audible “uh” fillers from the interview using genuine word timing. Add English/Spanish captions and a readable “Andrew Ng” callout. No new transcription. The news source starts at 0.96 seconds.";
  const request = fixture(instruction);
  expect(nativeTranscriptWholeRemovalQueries(instruction, "clause-v1")).toEqual(
    [],
  );
  expect(
    nativeTranscriptSearchOverview(request).every(
      (q) => !q.scopeNeedsClarification && !q.requiresCompleteRemoval,
    ),
  ).toBe(true);
  expect(() => assertNativeTranscriptCoverage(request, edit)).not.toThrow();
  expect(() =>
    assertNativeTranscriptCoverage(
      { ...request, authoring: { scope: { kind: "project" } } },
      edit,
    ),
  ).toThrow(/qualified or ambiguous/);
});
it.each([
  "Remove every “uh” except the first",
  "Remove all “uh”; keep the last",
  "Remove every “uh” before 1.5 seconds",
  "Do not remove all “uh”",
  "不要删除所有「uh」",
  "No elimines todos los “uh”",
])("retains ambiguous/negative scope protection: %s", (instruction) => {
  const request = fixture(instruction);
  expect(() => assertNativeTranscriptCoverage(request, edit)).toThrow(
    /qualified or ambiguous/,
  );
});
it("still requires all genuine occurrences when removal itself has an all quantifier", () => {
  const request = fixture("Remove all spoken “uh” from interview.");
  expect(
    nativeTranscriptWholeRemovalQueries(request.instruction!, "clause-v1"),
  ).toEqual(["uh"]);
  expect(() => assertNativeTranscriptCoverage(request, edit)).not.toThrow();
  expect(() =>
    assertNativeTranscriptCoverage(request, {
      ...edit,
      commands: edit.commands.slice(0, 1),
    }),
  ).toThrow();
});
