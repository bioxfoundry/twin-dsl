import test from "node:test";
import assert from "node:assert/strict";
import { canonicalIntentRecord, intentSourceAnchor, validateT2cIntent } from "../src/dsl/intent.js";

function validRecord(): Record<string, unknown> {
  return canonicalIntentRecord({
    seed: "intent-1",
    type: "decision",
    text: "SiLA 2 commands must retain a source anchor.",
    targetUris: ["subactor://markdown/study.md"],
    sourceAnchor: {
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
  }) as unknown as Record<string, unknown>;
}

test("intent validator accepts canonical todo2code schema and exact structured provenance", () => {
  const records = validateT2cIntent([validRecord()]);
  assert.equal(intentSourceAnchor(records[0])?.blockId, "block-1");
});

test("intent validator rejects malformed provenance, unknown keys and duplicate identities", () => {
  const malformed = validRecord();
  const metadata = malformed.metadata as {bioxfoundry:{sourceAnchor:Record<string,unknown>}};
  metadata.bioxfoundry.sourceAnchor.page = 0;
  assert.throws(() => validateT2cIntent([malformed]), /INVALID_T2C_INTENT_SOURCE_ANCHOR/);

  const duplicate = validRecord();
  assert.throws(() => validateT2cIntent([duplicate, structuredClone(duplicate)]), /T2C_INTENT_ID_DUPLICATE/);

  const noActor = validRecord();
  (noActor.statement as Record<string,unknown>).actor = 7;
  assert.throws(() => validateT2cIntent([noActor]), /INVALID_T2C_INTENT_STATEMENT/);

  const unknown = validRecord();
  unknown.legacy = true;
  assert.throws(() => validateT2cIntent([unknown]), /INVALID_T2C_INTENT_KEYS/);
});
