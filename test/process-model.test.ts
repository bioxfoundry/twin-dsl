import test from "node:test";
import assert from "node:assert/strict";
import { parseProcessDsl, renderProcessDsl, validateProcessDocument } from "../src/dsl/process.js";
import { deriveBiofoundryProcesses } from "../src/runtime/process-model.js";
import { archiveDeviceIntents, canonicalIntents, COMPONENT_IDS, deviceIntents, twin } from "./fixtures/process-fixture.js";
import { intentSourceAnchor } from "../src/dsl/intent.js";
import { intentText } from "../src/dsl/intent.js";

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

test("device intent packs produce sourced parameters, ordered device actors and complete documented workflows", () => {
  const document = deriveBiofoundryProcesses({
    projectId: "biofoundry",
    sourceSnapshotHash: "d".repeat(64),
    intents: [...canonicalIntents(), ...deviceIntents()],
    twin: twin(),
  });
  assert.deepEqual(document.coverage, {
    processes: 7, complete: 5, partial: 2, declaredOnly: 0,
    steps: 50, evidencedSteps: 50, missingEvidence: 0, missingComponents: 0,
  });
  assert.deepEqual(
    document.processes.filter((process) => process.completeness === "complete").map((process) => process.id),
    ["laboratory_manipulation", "closed_optimization", "microscopy_acquisition", "syringebot_synthesis", "plasmid_cloning"],
  );
  assert.equal(document.processes.find((process) => process.id === "cultivation_monitoring")?.cyclic, true);
  assert.match(document.processes.find((process) => process.id === "microfluidic_sample_preparation")?.gaps.join(" ") ?? "", /acceptance thresholds/);
  for (const process of document.processes) {
    for (const item of process.steps) {
      const evidenceIds = new Set(item.evidence.map((evidence) => evidence.intentId));
      assert.equal(item.evidence.length > 0, true, `${process.id}/${item.id} lacks evidence`);
      for (const parameter of item.parameters) assert.ok(evidenceIds.has(parameter.evidenceIntentId), `${process.id}/${item.id}/${parameter.name} is ungrounded`);
    }
  }
  const titration = document.processes.find((process) => process.id === "syringebot_synthesis");
  assert.equal(titration?.steps.find((item) => item.id === "configure_titration")?.parameters.find((parameter) => parameter.name === "addition_count")?.value, 20);
  const cloning = document.processes.find((process) => process.id === "plasmid_cloning");
  assert.equal(cloning?.steps.find((item) => item.id === "verify_assembly_electrophoresis")?.parameters.find((parameter) => parameter.name === "voltage")?.value, 120);
});

test("a missing device fragment downgrades only its workflow instead of inventing completeness", () => {
  const intents = [...canonicalIntents(), ...deviceIntents().filter(({ record }) => !intentText(record).includes("all units must be synchronized"))];
  const document = deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents, twin: twin() });
  const microscopy = document.processes.find((process) => process.id === "microscopy_acquisition");
  assert.equal(microscopy?.completeness, "partial");
  assert.deepEqual(microscopy?.steps.find((item) => item.id === "synchronize_file_watchers")?.evidence, []);
  assert.ok(document.findings.some((finding) => finding.code === "PROCESS_EVIDENCE_MISSING" && finding.stepId === "synchronize_file_watchers"));
  assert.equal(document.processes.find((process) => process.id === "syringebot_synthesis")?.completeness, "complete");
});

test("archive code contracts add sourced ChemOS, pipette and MOS3S process detail without inventing kinematics", () => {
  const document = deriveBiofoundryProcesses({
    projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64),
    intents: [...canonicalIntents(), ...deviceIntents(), ...archiveDeviceIntents()], twin: twin(),
  });
  assert.deepEqual(document.coverage, {
    processes: 9, complete: 5, partial: 4, declaredOnly: 0,
    steps: 65, evidencedSteps: 65, missingEvidence: 0, missingComponents: 0,
  });
  const closed = document.processes.find((process) => process.id === "closed_optimization");
  assert.deepEqual(closed?.steps.map((item) => item.id), [
    "recommend_next_experiment", "queue_chemspeed_batch", "monitor_chemspeed_operations",
    "submit_hplcms_characterization", "submit_optical_measurement", "synchronize_characterization_results",
    "optimize_next_plan",
  ]);
  const pipette = document.processes.find((process) => process.id === "oscar_pipette_control");
  assert.equal(pipette?.steps.find((item) => item.id === "aspirate_liquid")?.parameters.find((item) => item.name === "example_volume")?.value, 75000);
  assert.equal(pipette?.failureStepId, "report_pipette_fault");
  const mos3s = document.processes.find((process) => process.id === "mos3s_bioprinting");
  assert.equal(mos3s?.steps.find((item) => item.id === "position_printhead")?.parameters.find((item) => item.name === "z_travel")?.value, 200);
  assert.equal(mos3s?.ordering, "presentation-only");
  assert.ok(document.findings.some((finding) => finding.code === "PROCESS_KINEMATIC_MAPPING_MISSING" && finding.processId === "mos3s_bioprinting"));
});

test("device evidence is accepted only from its allowlisted source pack", () => {
  const impostor = structuredClone(deviceIntents()[0]);
  impostor.record.metadata.bioxfoundry!.targetUris = ["subactor://markdown/unrelated/report.pdf.md"];
  intentSourceAnchor(impostor.record)!.artifactUri = "subactor://markdown/unrelated/report.pdf.md";
  const document = deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents: [...canonicalIntents(), impostor], twin: twin() });
  const cultivation = document.processes.find((process) => process.id === "cultivation_monitoring");
  assert.equal(cultivation?.ordering, "presentation-only");
  assert.deepEqual(cultivation?.steps.map((item) => item.id), ["control_cultivation", "observe_cultivation"]);
});

test("missing sequence evidence keeps the process partial instead of fabricating a step fact", () => {
  const intents = canonicalIntents().filter(({ record }) => !intentText(record).includes("MoveIt 2 verify the trajectory"));
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

  const ungroundedParameter = structuredClone(document);
  ungroundedParameter.processes[0].steps[0].parameters.push({ name: "temperature", value: 37, unit: "°C", basis: "source", evidenceIntentId: "not-present" });
  assert.throws(() => validateProcessDocument(ungroundedParameter, COMPONENT_IDS), /PROCESS_PARAMETER_EVIDENCE_INVALID/);

  const falseComplete = structuredClone(document);
  falseComplete.processes.find((process) => process.id === "cultivation_monitoring")!.completeness = "complete";
  assert.throws(() => validateProcessDocument(falseComplete, COMPONENT_IDS), /PROCESS_COMPLETE_WITH_GAPS/);
});
