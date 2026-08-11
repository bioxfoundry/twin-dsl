import test from "node:test";
import assert from "node:assert/strict";
import { validateT2cIntent } from "../src/dsl/intent.js";

function validRecord(): Record<string, unknown> {
  return {
    schema: "t2c.intent/v1",
    id: "intent-1",
    type: "decision",
    text: "SiLA 2 commands must retain a source anchor.",
    actor: "source:markdown",
    targetUris: ["subactor://markdown/study.md"],
    source: {
      artifactUri: "subactor://markdown/study.md",
      revisionHash: "aa".repeat(32),
      fragment: "study.md#block-1",
      page: 2,
      lines: [8, 9],
      bbox: [10, 20, 30, 40],
      blockId: "block-1",
      artifactId: "artifact-paragraph-1",
      artifactUrn: `urn:subactor:artifact:sha256:${"bb".repeat(32)}`,
      evidenceArtifactIds: ["artifact-heading-1", "artifact-paragraph-1"],
      evidenceArtifactUrns: [`urn:subactor:artifact:sha256:${"cc".repeat(32)}`],
      converter: "pymupdf-layout",
      converterVersion: "1.26.3",
    },
  };
}

test("intent validator accepts exact structured provenance", () => {
  const records = validateT2cIntent([validRecord()]);
  assert.equal(records[0].source?.blockId, "block-1");
});

test("intent validator rejects malformed provenance and duplicate identities", () => {
  const malformed = validRecord();
  malformed.source = {...malformed.source as object, page: 0};
  assert.throws(() => validateT2cIntent([malformed]), /INVALID_T2C_INTENT_SOURCE/);

  const duplicate = validRecord();
  assert.throws(() => validateT2cIntent([duplicate, structuredClone(duplicate)]), /T2C_INTENT_ID_DUPLICATE/);

  const noActor = validRecord();
  noActor.actor = " ";
  assert.throws(() => validateT2cIntent([noActor]), /INVALID_T2C_INTENT/);
});
