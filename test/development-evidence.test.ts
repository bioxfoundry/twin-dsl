import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  developmentEvidenceSemanticHash,
  parseDevelopmentEvidenceDsl,
  renderDevelopmentEvidenceDsl,
  verifyDevelopmentEvidenceDsl as fromPackage,
} from "../js/development-evidence/src/index.js";
import { verifyDevelopmentEvidenceDsl as fromRuntime } from "../src/dsl/development-evidence.js";
import { intakeDevelopmentEvidence } from "../src/runtime/development-evidence.js";

test("runtime uses the extracted development evidence verifier", () => {
  assert.equal(fromRuntime, fromPackage);
});

test("Twin intake observes accepted evidence without claiming SSOT promotion or mutation authority", async () => {
  const markdown = await readFile("examples/development-evidence/development-evidence.dsl", "utf8");
  const result = intakeDevelopmentEvidence(markdown);
  assert.equal(result.status, "accepted");
  assert.equal(result.observationEligible, true);
  assert.equal(result.findingCode, null);
  assert.equal(result.ssotPromotionVerified, false);
  assert.equal(result.mutationAuthorized, false);
});

test("Twin intake routes valid but incomplete evidence to a deterministic integrity finding", async () => {
  const source = await readFile("examples/development-evidence/development-evidence.dsl", "utf8");
  const accepted = parseDevelopmentEvidenceDsl(source);
  const incomplete = {
    ...accepted,
    assessment: "incomplete" as const,
    blockingDiagnostics: 1,
    semanticHash: "sha256:" + "0".repeat(64),
    evidenceUri: "urn:onlydsl:development-evidence:sha256:" + "0".repeat(64),
  };
  incomplete.semanticHash = developmentEvidenceSemanticHash(incomplete);
  incomplete.evidenceUri = `urn:onlydsl:development-evidence:${incomplete.semanticHash}`;
  const result = intakeDevelopmentEvidence(renderDevelopmentEvidenceDsl(incomplete));
  assert.equal(result.status, "incomplete");
  assert.equal(result.observationEligible, false);
  assert.equal(result.findingCode, "DEVELOPMENT_EVIDENCE_NOT_ACCEPTED");
  assert.equal(result.mutationAuthorized, false);
});

test("Twin intake keeps a tampered authority field out of domain observations", async () => {
  const source = await readFile("examples/development-evidence/development-evidence.dsl", "utf8");
  const result = intakeDevelopmentEvidence(source.replace("AUTHORITY_EFFECT none", "AUTHORITY_EFFECT granted"));
  assert.equal(result.status, "invalid");
  assert.equal(result.observationEligible, false);
  assert.equal(result.findingCode, "DEVELOPMENT_EVIDENCE_AUTHORITY_FORBIDDEN");
  assert.equal(result.evidence, null);
});
