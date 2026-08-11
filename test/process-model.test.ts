import test from "node:test";
import assert from "node:assert/strict";
import { parseProcessDsl, renderProcessDsl, validateProcessDocument } from "../src/dsl/process.js";
import { deriveBiofoundryProcesses } from "../src/runtime/process-model.js";
import { canonicalIntents, COMPONENT_IDS, twin } from "./fixtures/process-fixture.js";

test("canonical intent evidence derives complete control loops and honest partial device processes", () => {
  const document = deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents: canonicalIntents(), twin: twin() });
  assert.equal(document.coverage.processes, 7);
  assert.equal(document.coverage.complete, 2);
  assert.equal(document.coverage.partial, 4);
  assert.equal(document.coverage.declaredOnly, 1);
  assert.equal(document.coverage.missingComponents, 0);
  const manipulation = document.processes.find((process) => process.id === "laboratory_manipulation");
  assert.equal(manipulation?.completeness, "complete");
  assert.deepEqual(manipulation?.steps.map((step) => step.id), [
    "check_documented_state", "dispatch_oscar_command", "validate_ros_parameters", "verify_and_execute_motion",
    "publish_progress", "update_equipment_state", "safe_recovery",
  ]);
  assert.equal(manipulation?.steps.every((step) => step.evidence[0]?.page === 24 || step.evidence[0]?.page === 25), true);
  assert.equal(manipulation?.steps.find((step) => step.id === "verify_and_execute_motion")?.transitions.failure, "safe_recovery");
  const cultivation = document.processes.find((process) => process.id === "cultivation_monitoring");
  assert.equal(cultivation?.ordering, "presentation-only");
  assert.match(cultivation?.gaps.join(" ") ?? "", /timing/);
  const cloning = document.processes.find((process) => process.id === "plasmid_cloning");
  assert.equal(cloning?.completeness, "declared-only");
  assert.equal(cloning?.steps.length, 0);
  assert.ok(document.findings.some((finding) => finding.code === "PROCESS_DETAIL_DECLARED_ONLY"));
  assert.ok(!JSON.stringify(document).includes("durationMs"), "domain ProcessDSL must not fabricate timing");
});

test("ProcessDSL round-trips deterministically with evidence and coverage intact", () => {
  const document = deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents: canonicalIntents(), twin: twin() });
  const dsl = renderProcessDsl(document);
  const parsed = parseProcessDsl(dsl, COMPONENT_IDS);
  assert.deepEqual(parsed, document);
  assert.equal(renderProcessDsl(parsed), dsl);
});

test("missing sequence evidence keeps the process partial instead of fabricating a step fact", () => {
  const intents = canonicalIntents().filter(({ record }) => record.id !== "seq4");
  const document = deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents, twin: twin() });
  const manipulation = document.processes.find((process) => process.id === "laboratory_manipulation");
  assert.equal(manipulation?.completeness, "partial");
  const motion = manipulation?.steps.find((step) => step.id === "verify_and_execute_motion");
  assert.deepEqual(motion?.evidence, []);
  assert.ok(motion?.gaps.length);
  assert.ok(document.findings.some((finding) => finding.code === "PROCESS_EVIDENCE_MISSING" && finding.stepId === motion?.id));
});

test("unknown Twin components fail closed with a stable ProcessDSL error", () => {
  assert.throws(
    () => deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents: canonicalIntents(), twin: twin(COMPONENT_IDS.filter((id) => id !== "syringebot_01")) }),
    /PROCESS_COMPONENT_MISSING:.*syringebot_01/,
  );
  const document = deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents: canonicalIntents(), twin: twin() });
  const invalid = structuredClone(document);
  invalid.processes[0].steps[0].transitions.success = "not_a_step";
  assert.throws(() => validateProcessDocument(invalid, COMPONENT_IDS), /PROCESS_TRANSITION_INVALID/);
});
