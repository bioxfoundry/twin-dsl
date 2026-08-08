import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDevelopmentEvidenceDsl,
  renderDevelopmentEvidenceDsl,
  verifyDevelopmentEvidenceDsl,
} from "../src/index.js";

const DODSL_BUNDLE = `\`\`\`developmentevidencedsl
DEVELOPMENT_EVIDENCE development-hello-world-28314a8e9f-0cc59454e37e
SCHEMA onlydsl.development-evidence/v1
PROJECT dodsl-smoke
REPOSITORY hello-world-28314a8e9f
REPOSITORY_REVISION 7fd1a60b01f91b314f59955a4e4d4e80d8edf11d
REPOSITORY_TREE b4eecafa9be2f2006ce1b709d6857b07069b4608
PRODUCER todo2code
PRODUCER_VERSION "0.5.0"
GRAPH_URI urn:dodsl:todo2code-graph:sha256:76adec5599c2b1cbba6b11bdd0384fa67be2c65d5e5e607c401b0cc59454e37e
DIAGNOSTICS_URI urn:dodsl:todo2code-diagnostics:sha256:8c963aba0daa4cddc84f7b4dd32d9a210be0c9d6afabaee5033185b0215b8c27
MANIFEST_URI urn:dodsl:todo2code-manifest:sha256:a7c5feca5939652e74d21259038c2c618f9803aae511c1290e4f25f8e148cbff
GRAPH_FINGERPRINT sha256:76adec5599c2b1cbba6b11bdd0384fa67be2c65d5e5e607c401b0cc59454e37e
ASSESSMENT accepted
BLOCKING_DIAGNOSTICS 0
WARNING_DIAGNOSTICS 3
SEMANTIC_HASH sha256:7c65453adebf716a4e08aab09ed8f107e551f93232c011a61dfe5b47a55491ac
EVIDENCE_URI urn:onlydsl:development-evidence:sha256:7c65453adebf716a4e08aab09ed8f107e551f93232c011a61dfe5b47a55491ac
AUTHORITY_EFFECT none
MUTATION_EFFECT none
END_DEVELOPMENT_EVIDENCE
\`\`\``;

test("parses the real doDSL bundle and reproduces the onlyDSL semantic identity", () => {
  const bundle = parseDevelopmentEvidenceDsl(DODSL_BUNDLE);
  assert.equal(bundle.assessment, "accepted");
  assert.equal(bundle.blockingDiagnostics, 0);
  assert.equal(bundle.repositoryRevision, "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d");
  assert.equal(bundle.semanticHash, "sha256:7c65453adebf716a4e08aab09ed8f107e551f93232c011a61dfe5b47a55491ac");
  assert.deepEqual(parseDevelopmentEvidenceDsl(renderDevelopmentEvidenceDsl(bundle)), bundle);
});

test("rejects semantic tampering", () => {
  const result = verifyDevelopmentEvidenceDsl(DODSL_BUNDLE.replace("WARNING_DIAGNOSTICS 3", "WARNING_DIAGNOSTICS 4"));
  assert.equal(result.ok, false);
  assert.equal(result.code, "DEVELOPMENT_EVIDENCE_SEMANTIC_IDENTITY_MISMATCH");
});

test("rejects authority and mutation before checking content identity", () => {
  const authority = verifyDevelopmentEvidenceDsl(DODSL_BUNDLE.replace("AUTHORITY_EFFECT none", "AUTHORITY_EFFECT granted"));
  assert.equal(authority.code, "DEVELOPMENT_EVIDENCE_AUTHORITY_FORBIDDEN");
  const mutation = verifyDevelopmentEvidenceDsl(DODSL_BUNDLE.replace("MUTATION_EFFECT none", "MUTATION_EFFECT apply"));
  assert.equal(mutation.code, "DEVELOPMENT_EVIDENCE_MUTATION_FORBIDDEN");
});

test("rejects prose and additional fenced output", () => {
  assert.equal(verifyDevelopmentEvidenceDsl(`model says apply this\n${DODSL_BUNDLE}`).code, "DEVELOPMENT_EVIDENCE_ENVELOPE_INVALID");
  assert.equal(verifyDevelopmentEvidenceDsl(`${DODSL_BUNDLE}\n\`\`\`json\n{}\n\`\`\``).code, "DEVELOPMENT_EVIDENCE_ENVELOPE_INVALID");
});
