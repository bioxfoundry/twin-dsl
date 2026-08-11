import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { indexIntentDsl } from "../src/runtime/living-project.js";
import type { ResourceRecord } from "../src/core/types.js";

test("canonical study records precede generic decisions in the bounded priority index", async () => {
  const root = await mkdtemp(join(tmpdir(), "intent-index-"));
  try {
    const sourcePath = join(root, "study.md.intent.json");
    await writeFile(sourcePath, JSON.stringify({
      schema: "t2c.intent-pack/v1",
      source: "study.md",
      sourceHash: "a".repeat(64),
      records: [
        {schema: "t2c.intent/v1", id: "generic-decision", type: "decision", text: "Generic decision", actor: "source:markdown", targetUris: ["subactor://markdown/other.md"]},
        {schema: "t2c.intent/v1", id: "canonical-plan", type: "plan", text: "Canonical equipment plan", actor: "source:markdown", targetUris: ["subactor://markdown/A. SPECIFIKACIJA/Atvirojo kodo biofoundry studija.pdf.md"]},
      ],
    }));
    const resource: ResourceRecord = {
      schema: "subactor.resource/v1", id: "intent-pack", uri: `urn:subactor:resource:sha256:${"b".repeat(64)}`,
      logicalUri: "subactor://project/dsl/study.md.intent.json", mediaType: "application/json",
      sha256: "b".repeat(64), size: 1, sourcePath, sourceRole: "project", derived: true,
      derivedFrom: [], createdAt: "2026-08-11T00:00:00.000Z",
    };
    const result = await indexIntentDsl([resource], new Map());
    assert.equal(result.index.invalid, 0);
    assert.equal(result.index.highPriority[0].id, "canonical-plan");
  } finally { await rm(root, {recursive: true, force: true}); }
});
