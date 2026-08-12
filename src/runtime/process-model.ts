import type { ProcessDefinition, ProcessDocument, ProcessEvidence, ProcessFinding, ProcessInteraction, ProcessParameter, ProcessStep, TwinDocument } from "../core/types.js";
import { intentSourceAnchor, intentTargetUris, intentText, intentUri } from "../dsl/intent.js";
import { processCoverage, validateProcessDocument } from "../dsl/process.js";
import type { GroundedIntentEvidence } from "./biofoundry-concept.js";

type EvidenceNeed = { label: string; includes: string[]; page?: number; artifactIncludes?: string[] };

const DEVICE_ARTIFACTS = {
  biospec: ["i. bioreactor", "1-s2.0-s2468067225000483-main.pdf.md"],
  microscopy: ["ii. microscopy", "1-s2.0-s246806722300007x-main.pdf.md"],
  microfluidic: ["iii. microfluidic assembly", "1-s2.0-s2468067223000329-main.pdf.md"],
  syringebot: ["iv. 3d microfluidic bioprinting", "piis2468067222000554.pdf.md"],
  oscarProtocol: ["0. oscar robot", "sb5c00733_si_002.pdf.md"],
  pipetteSoftware: ["archive-derived", "0. oscar robot", "pipette-tool-sw-main"],
  chemosAtlas: ["archive-derived", "chemos2.0-master", "atlas.proto.md"],
  chemosBatch: ["archive-derived", "chemos2.0-master", "chemspeedoperator.proto.md"],
  chemosHplc: ["archive-derived", "chemos2.0-master", "hplcms.proto.md"],
  chemosOptics: ["archive-derived", "chemos2.0-master", "opticstable.proto.md"],
  mos3sSyringeFirmware: ["archive-derived", "iv. 3d microfluidic bioprinting", "mos3s", "syringe pumps", "configuration.h.md"],
  mos3sPrintheadFirmware: ["archive-derived", "iv. 3d microfluidic bioprinting", "mos3s", "printhead", "configuration.h.md"],
} as const;

function normalized(value: string): string {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function canonicalEvidence(intents: GroundedIntentEvidence[]): GroundedIntentEvidence[] {
  return intents.filter(({ record }) => [intentSourceAnchor(record)?.artifactUri, ...intentTargetUris(record)]
    .filter((value): value is string => typeof value === "string")
    .some((value) => normalized(value).includes("atvirojo kodo biofoundry studija")));
}

function findEvidence(intents: GroundedIntentEvidence[], need: EvidenceNeed): ProcessEvidence | undefined {
  const found = intents.find(({ record }) => {
    const text = normalized(intentText(record));
    const source = intentSourceAnchor(record);
    const artifactValues = [source?.artifactUri, ...intentTargetUris(record)].filter((value): value is string => typeof value === "string").map(normalized);
    const allowedArtifact = !need.artifactIncludes?.length || artifactValues.some((value) => need.artifactIncludes!.every((part) => value.includes(normalized(part))));
    return allowedArtifact && need.includes.every((part) => text.includes(normalized(part))) && (need.page === undefined || source?.page === need.page);
  });
  const source = found ? intentSourceAnchor(found.record) : undefined;
  if (!found || !source) return undefined;
  return {
    intentId: found.record.id,
    intentUri: intentUri(found.record),
    sourceUri: found.sourceUri,
    artifactUri: source.artifactUri,
    revisionHash: source.revisionHash,
    ...(source.fragment ? { fragment: source.fragment } : {}),
    ...(source.page ? { page: source.page } : {}),
    ...(source.artifactUrn ? { artifactUrn: source.artifactUrn } : {}),
    excerpt: intentText(found.record).slice(0, 800),
  };
}

function uniqueEvidence(values: Array<ProcessEvidence | undefined>): ProcessEvidence[] {
  return [...new Map(values.filter((value): value is ProcessEvidence => Boolean(value)).map((value) => [value.intentId, value])).values()]
    .sort((left, right) => (left.page ?? 0) - (right.page ?? 0) || left.intentId.localeCompare(right.intentId));
}

function interaction(kind: ProcessInteraction["kind"], componentIds: string[], options: Partial<ProcessInteraction> = {}): ProcessInteraction {
  return { kind, componentIds: [...new Set(componentIds)], ...options };
}

function parameter(evidence: ProcessEvidence | undefined, name: string, value: ProcessParameter["value"], unit?: string): ProcessParameter | undefined {
  return evidence ? { name, value, ...(unit ? { unit } : {}), basis: "source", evidenceIntentId: evidence.intentId } : undefined;
}

function parameters(values: Array<ProcessParameter | undefined>): ProcessParameter[] {
  return values.filter((value): value is ProcessParameter => Boolean(value));
}

function step(input: Omit<ProcessStep, "evidence" | "gaps" | "parameters"> & { evidence?: ProcessEvidence | ProcessEvidence[]; gaps?: string[]; parameters?: ProcessParameter[] }): ProcessStep {
  const evidence = input.evidence ? Array.isArray(input.evidence) ? input.evidence : [input.evidence] : [];
  return { ...input, evidence, parameters: input.parameters ?? [], gaps: input.gaps ?? (evidence.length ? [] : ["source evidence for this step is missing"]) };
}

function definition(input: Omit<ProcessDefinition, "componentIds" | "evidence">): ProcessDefinition {
  const componentIds = [...new Set(input.steps.flatMap((item) => item.componentIds))].sort();
  return { ...input, componentIds, evidence: uniqueEvidence(input.steps.flatMap((item) => item.evidence)) };
}

function processFinding(code: string, severity: ProcessFinding["severity"], message: string, resolution: string, processId?: string, stepId?: string): ProcessFinding {
  return { code, severity, ...(processId ? { processId } : {}), ...(stepId ? { stepId } : {}), message, resolution };
}

function flattenComponents(items: TwinDocument["components"]): TwinDocument["components"] {
  return items.flatMap((component) => [component, ...flattenComponents(component.children)]);
}

export function deriveBiofoundryProcesses(input: {
  projectId: string;
  sourceSnapshotHash: string;
  intents: GroundedIntentEvidence[];
  twin: TwinDocument;
}): ProcessDocument {
  const intents = canonicalEvidence(input.intents);
  const findings: ProcessFinding[] = [];
  const processes: ProcessDefinition[] = [];
  const evidence = (label: string, includes: string[], page?: number): ProcessEvidence | undefined => findEvidence(intents, { label, includes, page });
  const deviceEvidence = (artifactIncludes: readonly string[], label: string, includes: string[]): ProcessEvidence | undefined =>
    findEvidence(input.intents, { label, includes, artifactIncludes: [...artifactIncludes] });

  const manipulationEvidence = {
    check: evidence("documented state preflight", ["conduct sequence", "status of the equipment", "sample and work area"], 24),
    command: evidence("high-level OSCAR command", ["conduct sequence", "calls high level OSCAR command"], 24),
    validate: evidence("SiLA-ROS parameter validation", ["conduct sequence", "validates the parameters"], 24),
    motion: evidence("MoveIt trajectory verification", ["conduct sequence", "verify the trajectory", "perform movement"], 24),
    progress: evidence("sensor progress stream", ["conduct sequence", "sensor nodes publish progress"], 24),
    update: evidence("success state update and recovery", ["conduct sequence", "status of the sample and equipment is updated", "safe suspension"], 24),
    secure: evidence("communication loss secure state", ["loss of communication", "secure state"], 25),
  };
  if (Object.values(manipulationEvidence).some(Boolean)) {
    const steps = [
      step({ id: "check_documented_state", label: "Check equipment, sample and work-area state", phase: "validate", componentIds: ["opentwins_state_01", "oscar_robot_01", "cleanroom_base_01"], interactions: [interaction("validation", ["opentwins_state_01", "oscar_robot_01", "cleanroom_base_01"])], transitions: { success: "dispatch_oscar_command" }, evidence: manipulationEvidence.check }),
      step({ id: "dispatch_oscar_command", label: "Send high-level OSCAR command and parameters", phase: "command", componentIds: ["sila_orchestrator_01", "oscar_robot_01"], interactions: [interaction("command", ["sila_orchestrator_01", "oscar_robot_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "oscar_robot_01" })], transitions: { success: "validate_ros_parameters" }, evidence: manipulationEvidence.command }),
      step({ id: "validate_ros_parameters", label: "Validate parameters and initiate ROS 2 action", phase: "validate", componentIds: ["sila_orchestrator_01", "ros2_robotics_01"], interactions: [interaction("command", ["sila_orchestrator_01", "ros2_robotics_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "ros2_robotics_01" })], transitions: { success: "verify_and_execute_motion" }, evidence: manipulationEvidence.validate }),
      step({ id: "verify_and_execute_motion", label: "Verify trajectory in the digital work area and execute motion", phase: "operate", componentIds: ["ros2_robotics_01", "oscar_robot_01"], interactions: [interaction("command", ["ros2_robotics_01", "oscar_robot_01"], { fromComponentId: "ros2_robotics_01", toComponentId: "oscar_robot_01" }), interaction("operation", ["oscar_robot_01"])], transitions: { success: "publish_progress", failure: "safe_recovery" }, evidence: manipulationEvidence.motion }),
      step({ id: "publish_progress", label: "Publish sensor progress through SiLA 2 to OpenTwins", phase: "observe", componentIds: ["oscar_robot_01", "sila_orchestrator_01", "opentwins_state_01"], interactions: [interaction("observation", ["oscar_robot_01", "sila_orchestrator_01"], { fromComponentId: "oscar_robot_01", toComponentId: "sila_orchestrator_01" }), interaction("observation", ["sila_orchestrator_01", "opentwins_state_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "opentwins_state_01" })], transitions: { success: "update_equipment_state" }, evidence: manipulationEvidence.progress }),
      step({ id: "update_equipment_state", label: "Update sample and equipment state after success", phase: "update", componentIds: ["opentwins_state_01", "oscar_robot_01"], interactions: [interaction("state-update", ["opentwins_state_01", "oscar_robot_01"], { state: "completed" })], transitions: {}, evidence: manipulationEvidence.update }),
      step({ id: "safe_recovery", label: "Suspend safely and enter recovery or secure state", phase: "recover", componentIds: ["oscar_robot_01", "ros2_robotics_01", "opentwins_state_01"], interactions: [interaction("safety", ["oscar_robot_01", "ros2_robotics_01", "opentwins_state_01"], { state: "recovering" })], transitions: {}, evidence: manipulationEvidence.secure ?? manipulationEvidence.update }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    for (const stepId of missing) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", `Laboratory manipulation step ${stepId} has no canonical intent evidence.`, "Restore the corresponding page-24 or page-25 intent record before treating the sequence as complete.", "laboratory_manipulation", stepId));
    processes.push(definition({ id: "laboratory_manipulation", label: "OSCAR laboratory manipulation", kind: "manipulation", completeness: missing.length ? "partial" : "complete", ordering: "source", cyclic: false, entryStepId: "check_documented_state", successStepId: "update_equipment_state", failureStepId: "safe_recovery", steps, gaps: missing.map((id) => `missing evidence for ${id}`) }));
  }

  const closedCycle = evidence("closed-loop phase order", ["closed cycle", "planning", "execution", "data collection", "optimisation"], 13);
  const liveStatus = evidence("real-time planner status", ["real-time status source for ai planner"], 28);
  const fullCycle = evidence("full closed cycle", ["full closed cycle", "planning", "execution", "monitoring", "optimization"], 29);
  if (closedCycle || liveStatus || fullCycle) {
    const atlas = deviceEvidence(DEVICE_ARTIFACTS.chemosAtlas, "Atlas recommendation service", ["recommend_intermediate", "recommend_result", "campaign"]);
    const batch = deviceEvidence(DEVICE_ARTIFACTS.chemosBatch, "ChemSpeed batch service", ["addbatch", "addbatch_intermediate", "addbatch_result"]);
    const hplc = deviceEvidence(DEVICE_ARTIFACTS.chemosHplc, "HPLCMS job service", ["submitjobautosampler", "submitjobautosampler_intermediate", "submitjobautosampler_result"]);
    const optics = deviceEvidence(DEVICE_ARTIFACTS.chemosOptics, "optics-table job service", ["submitjob", "submitjob_intermediate", "submitjob_result"]);
    const detailed = [atlas, batch, hplc, optics].every(Boolean);
    const steps = detailed ? [
      step({ id: "recommend_next_experiment", label: "Request the next campaign recommendation from Atlas", phase: "plan", componentIds: ["chemos_planner_01", "sila_orchestrator_01"], interactions: [interaction("command", ["chemos_planner_01", "sila_orchestrator_01"], { fromComponentId: "chemos_planner_01", toComponentId: "sila_orchestrator_01" })], transitions: { success: "queue_chemspeed_batch" }, evidence: atlas, parameters: parameters([parameter(atlas, "request_fields", "Campaign; Config")]) }),
      step({ id: "queue_chemspeed_batch", label: "Queue the recommended batch on ChemSpeed", phase: "command", componentIds: ["chemos_planner_01", "sila_orchestrator_01"], interactions: [interaction("command", ["chemos_planner_01", "sila_orchestrator_01"], { fromComponentId: "chemos_planner_01", toComponentId: "sila_orchestrator_01" })], transitions: { success: "monitor_chemspeed_operations" }, evidence: batch, parameters: parameters([parameter(batch, "request_fields", "BatchName; Batchfile")]) }),
      step({ id: "monitor_chemspeed_operations", label: "Stream ChemSpeed batch status and executed operations", phase: "observe", componentIds: ["sila_orchestrator_01", "opentwins_state_01"], interactions: [interaction("observation", ["sila_orchestrator_01", "opentwins_state_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "opentwins_state_01" })], transitions: { success: "submit_hplcms_characterization" }, evidence: batch }),
      step({ id: "submit_hplcms_characterization", label: "Submit the autosampler characterization job to HPLCMS", phase: "command", componentIds: ["chemos_planner_01", "sila_orchestrator_01"], interactions: [interaction("command", ["chemos_planner_01", "sila_orchestrator_01"], { fromComponentId: "chemos_planner_01", toComponentId: "sila_orchestrator_01" })], transitions: { success: "submit_optical_measurement" }, evidence: hplc }),
      step({ id: "submit_optical_measurement", label: "Submit the optical-table measurement job", phase: "command", componentIds: ["chemos_planner_01", "sila_orchestrator_01"], interactions: [interaction("command", ["chemos_planner_01", "sila_orchestrator_01"], { fromComponentId: "chemos_planner_01", toComponentId: "sila_orchestrator_01" })], transitions: { success: "synchronize_characterization_results" }, evidence: optics }),
      step({ id: "synchronize_characterization_results", label: "Stream intermediate payloads and final characterization results", phase: "observe", componentIds: ["sila_orchestrator_01", "opentwins_state_01"], interactions: [interaction("observation", ["sila_orchestrator_01", "opentwins_state_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "opentwins_state_01" }), interaction("state-update", ["opentwins_state_01"], { state: "completed" })], transitions: { success: "optimize_next_plan" }, evidence: [hplc, optics, liveStatus ?? fullCycle].filter((item): item is ProcessEvidence => Boolean(item)) }),
      step({ id: "optimize_next_plan", label: "Return results to Atlas and optimize the next recommendation", phase: "optimize", componentIds: ["opentwins_state_01", "chemos_planner_01"], interactions: [interaction("observation", ["opentwins_state_01", "chemos_planner_01"], { fromComponentId: "opentwins_state_01", toComponentId: "chemos_planner_01" })], transitions: { success: "recommend_next_experiment" }, evidence: [atlas, fullCycle ?? closedCycle].filter((item): item is ProcessEvidence => Boolean(item)) }),
    ] : [
      step({ id: "plan_experiment", label: "Plan the next experiment", phase: "plan", componentIds: ["chemos_planner_01"], interactions: [interaction("operation", ["chemos_planner_01"])], transitions: { success: "execute_plan" }, evidence: closedCycle }),
      step({ id: "execute_plan", label: "Execute plan through SiLA 2 and connected equipment", phase: "command", componentIds: ["chemos_planner_01", "sila_orchestrator_01", "oscar_robot_01", "biospec_bioreactor_01", "microscope_module_01", "microfluidic_assembly_01", "syringebot_01"], interactions: [interaction("command", ["chemos_planner_01", "sila_orchestrator_01"], { fromComponentId: "chemos_planner_01", toComponentId: "sila_orchestrator_01" }), interaction("operation", ["oscar_robot_01", "biospec_bioreactor_01", "microscope_module_01", "microfluidic_assembly_01", "syringebot_01"])], transitions: { success: "monitor_process" }, evidence: closedCycle }),
      step({ id: "monitor_process", label: "Synchronize telemetry and process status in OpenTwins", phase: "observe", componentIds: ["sila_orchestrator_01", "opentwins_state_01"], interactions: [interaction("observation", ["sila_orchestrator_01", "opentwins_state_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "opentwins_state_01" })], transitions: { success: "optimize_next_plan" }, evidence: liveStatus ?? fullCycle }),
      step({ id: "optimize_next_plan", label: "Return results to ChemOS for optimization", phase: "optimize", componentIds: ["opentwins_state_01", "chemos_planner_01"], interactions: [interaction("state-update", ["opentwins_state_01", "chemos_planner_01"], { state: "completed" }), interaction("observation", ["opentwins_state_01", "chemos_planner_01"], { fromComponentId: "opentwins_state_01", toComponentId: "chemos_planner_01" })], transitions: { success: "plan_experiment" }, evidence: fullCycle ?? closedCycle }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    for (const stepId of missing) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", `Closed-loop step ${stepId} has no canonical intent evidence.`, "Restore canonical closed-cycle intent records before enabling complete-loop status.", "closed_optimization", stepId));
    if (detailed) findings.push(processFinding("PROCESS_COMPONENT_UNMODELLED", "info", "ChemSpeed, HPLCMS and optical-table SiLA endpoints are represented by their orchestrator flow, but do not yet have separate physical scene components.", "Add source-backed geometry and scene components for these instruments before expecting device-specific 3D animation.", "closed_optimization"));
    processes.push(definition({ id: "closed_optimization", label: "ChemOS–OpenTwins closed optimization cycle", kind: "optimization", completeness: missing.length ? "partial" : "complete", ordering: "source", cyclic: true, entryStepId: detailed ? "recommend_next_experiment" : "plan_experiment", successStepId: "optimize_next_plan", steps, gaps: missing.map((id) => `missing evidence for ${id}`) }));
  }

  const processTwinDeclaration = evidence("declared process twins", ["process twins", "cloning", "cultivation", "synthesis"], 25);
  const cultivationControl = evidence("BIO-SPEC controls", ["bio-spec", "controls ph, do, temperature, pumps"], 21);
  const cultivationModes = evidence("BIO-SPEC operating modes", ["bio-spec", "chemostat"], 13);
  if (cultivationControl || cultivationModes || processTwinDeclaration) {
    const setup = deviceEvidence(DEVICE_ARTIFACTS.biospec, "BIO-SPEC software setup", ["correct gpio pins", "up to six reactors", "define the desired timing"]);
    const phase = deviceEvidence(DEVICE_ARTIFACTS.biospec, "BIO-SPEC phase schedule", ["command_dict", "initial", "growth", "phase transitions"]);
    const hardware = deviceEvidence(DEVICE_ARTIFACTS.biospec, "BIO-SPEC control cabinet", ["real-time feedback", "solenoid valves", "stirrers and pumps"]);
    const gasSafety = deviceEvidence(DEVICE_ARTIFACTS.biospec, "BIO-SPEC gas safety", ["normally closed", "at least 1 vvm", "300 mbarg"]);
    const endurance = deviceEvidence(DEVICE_ARTIFACTS.biospec, "BIO-SPEC validated operation", ["at least 35 days", "real-time monitoring", "power interruption"]);
    const detailed = [setup, phase, hardware, gasSafety, endurance].some(Boolean);
    const steps = detailed ? [
      step({ id: "configure_and_dry_run", label: "Map probes and GPIO, then dry-run the phase schedule", phase: "validate", componentIds: ["biospec_controller_01", "biospec_bioreactor_01"], interactions: [interaction("validation", ["biospec_controller_01", "biospec_bioreactor_01"])], transitions: { success: "preflight_gas_supply" }, evidence: setup, parameters: parameters([parameter(setup, "maximum_reactors", 6), parameter(setup, "schedule_fields", "interval; START_TIME")]) }),
      step({ id: "preflight_gas_supply", label: "Set individual gas flow and fail-closed pressure protection", phase: "validate", componentIds: ["biospec_gas_valve_01", "biospec_bioreactor_01"], interactions: [interaction("validation", ["biospec_gas_valve_01", "biospec_bioreactor_01"]), interaction("safety", ["biospec_gas_valve_01"])], transitions: { success: "run_growth_phase", failure: "secure_power_loss" }, evidence: gasSafety, parameters: parameters([parameter(gasSafety, "minimum_gas_flow", 1, "vvm"), parameter(gasSafety, "individual_regulator_pressure", 300, "mbarg"), parameter(gasSafety, "solenoid_default", "normally-closed")]) }),
      step({ id: "run_growth_phase", label: "Run the initial aerobic growth phase", phase: "operate", componentIds: ["biospec_controller_01", "biospec_stirrer_01", "biospec_gas_valve_01", "biospec_bioreactor_01"], interactions: [interaction("command", ["biospec_controller_01", "biospec_stirrer_01", "biospec_gas_valve_01"], { fromComponentId: "biospec_controller_01", toComponentId: "biospec_stirrer_01" }), interaction("operation", ["biospec_stirrer_01", "biospec_gas_valve_01", "biospec_bioreactor_01"])], transitions: { success: "apply_scheduled_phase", failure: "secure_power_loss" }, evidence: phase }),
      step({ id: "apply_scheduled_phase", label: "Apply the scheduled gas, feed, outflow and stirring states", phase: "command", componentIds: ["biospec_controller_01", "biospec_gas_valve_01", "biospec_feed_pump_01", "biospec_stirrer_01"], interactions: [interaction("command", ["biospec_controller_01", "biospec_gas_valve_01"], { fromComponentId: "biospec_controller_01", toComponentId: "biospec_gas_valve_01" }), interaction("command", ["biospec_controller_01", "biospec_feed_pump_01"], { fromComponentId: "biospec_controller_01", toComponentId: "biospec_feed_pump_01" }), interaction("command", ["biospec_controller_01", "biospec_stirrer_01"], { fromComponentId: "biospec_controller_01", toComponentId: "biospec_stirrer_01" })], transitions: { success: "control_cultivation", failure: "secure_power_loss" }, evidence: [phase, hardware].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(phase, "phase_actuators", "AIR; N2; FEED; FEED2; OUT; STIR")]) }),
      step({ id: "control_cultivation", label: "Control temperature, gas, feed and stirring", phase: "operate", componentIds: ["biospec_bioreactor_01", "biospec_condenser_01", "biospec_gas_valve_01", "biospec_feed_pump_01", "biospec_stirrer_01"], interactions: [interaction("operation", ["biospec_bioreactor_01", "biospec_condenser_01", "biospec_gas_valve_01", "biospec_feed_pump_01", "biospec_stirrer_01"])], transitions: { success: "observe_cultivation", failure: "secure_power_loss" }, evidence: [cultivationControl, hardware].filter((item): item is ProcessEvidence => Boolean(item)) }),
      step({ id: "observe_cultivation", label: "Monitor temperatures and active phase in the GUI and twin", phase: "observe", componentIds: ["biospec_controller_01", "biospec_bioreactor_01", "opentwins_state_01"], interactions: [interaction("observation", ["biospec_bioreactor_01", "biospec_controller_01"], { fromComponentId: "biospec_bioreactor_01", toComponentId: "biospec_controller_01" }), interaction("observation", ["biospec_controller_01", "opentwins_state_01"], { fromComponentId: "biospec_controller_01", toComponentId: "opentwins_state_01" })], transitions: { success: "apply_scheduled_phase", failure: "secure_power_loss" }, evidence: [hardware, endurance].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(endurance, "validated_continuous_operation", 35, "days")]) }),
      step({ id: "secure_power_loss", label: "Fail closed and leave the cultivation hardware safe", phase: "recover", componentIds: ["biospec_gas_valve_01", "biospec_feed_pump_01", "biospec_stirrer_01", "biospec_bioreactor_01"], interactions: [interaction("safety", ["biospec_gas_valve_01", "biospec_feed_pump_01", "biospec_stirrer_01", "biospec_bioreactor_01"], { state: "recovering" })], transitions: {}, evidence: [gasSafety, endurance].filter((item): item is ProcessEvidence => Boolean(item)) }),
    ] : [
      step({ id: "control_cultivation", label: "Control pH, DO, temperature and pumps", phase: "operate", componentIds: ["sila_orchestrator_01", "biospec_bioreactor_01"], interactions: [interaction("command", ["sila_orchestrator_01", "biospec_bioreactor_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "biospec_bioreactor_01" }), interaction("operation", ["biospec_bioreactor_01"])], transitions: { success: "observe_cultivation" }, evidence: cultivationControl }),
      step({ id: "observe_cultivation", label: "Observe cultivation state in the digital twin", phase: "observe", componentIds: ["biospec_bioreactor_01", "opentwins_state_01"], interactions: [interaction("observation", ["biospec_bioreactor_01", "opentwins_state_01"], { fromComponentId: "biospec_bioreactor_01", toComponentId: "opentwins_state_01" })], transitions: {}, evidence: cultivationControl }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    if (detailed) for (const stepId of missing) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", `BIO-SPEC step ${stepId} lacks its device-source fragment.`, "Restore the corresponding BIO-SPEC intent before using that operation.", "cultivation_monitoring", stepId));
    const gaps = detailed
      ? [...missing.map((id) => `missing evidence for ${id}`), "phase intervals, cultivation-specific setpoints and biological termination criteria remain experiment-defined"]
      : ["device-specific cultivation ordering, setpoints, timing and termination criteria are unavailable"];
    if (detailed) findings.push(processFinding("PROCESS_PROTOCOL_INCOMPLETE", "info", "BIO-SPEC hardware sequencing and safety are sourced, but the study deliberately leaves experimental timing and biological setpoints configurable.", "Bind a reviewed experiment protocol to phase intervals, setpoints and termination criteria before device execution.", "cultivation_monitoring"));
    else findings.push(processFinding("PROCESS_ORDERING_UNEVIDENCED", "info", "BIO-SPEC capabilities are evidenced but their complete operational sequence is unavailable.", "Ingest the BIO-SPEC control-software and operation intents before using a source-ordered sequence.", "cultivation_monitoring"));
    processes.push(definition({ id: "cultivation_monitoring", label: "BIO-SPEC cultivation monitoring", kind: "cultivation", completeness: "partial", ordering: detailed ? "source" : "presentation-only", cyclic: detailed, entryStepId: steps[0]?.id, successStepId: "observe_cultivation", ...(detailed ? { failureStepId: "secure_power_loss" } : {}), steps, gaps }));
  }

  const imaging = evidence("microscopy acquisition and analysis", ["microscopy system", "image collection", "reconstruction", "analysis"], 14);
  const imageFlow = evidence("microscopy result stream", ["microscopy system", "flow of images", "results of reconstruction"], 21);
  if (imaging || imageFlow) {
    const cycle = deviceEvidence(DEVICE_ARTIFACTS.microscopy, "microscopy tile cycle", ["one cycle consists", "imaging a fov", "reconstructing", "visualizing"]);
    const unitFlow = deviceEvidence(DEVICE_ARTIFACTS.microscopy, "microscopy unit flow", ["number of tiles and laser powers", "raw data", "reconstruction unit"]);
    const postprocess = deviceEvidence(DEVICE_ARTIFACTS.microscopy, "napari post-processing", ["napari layers", "post-process"]);
    const watchers = deviceEvidence(DEVICE_ARTIFACTS.microscopy, "file watcher execution", ["adds the incoming files to a queue", "processed sequentially"]);
    const metadata = deviceEvidence(DEVICE_ARTIFACTS.microscopy, "microscopy metadata and outputs", ["metadata", "tiff and zarr", "logger file"]);
    const preflight = deviceEvidence(DEVICE_ARTIFACTS.microscopy, "microscopy synchronization", ["all units must be synchronized", "file watchers"]);
    const tiling = deviceEvidence(DEVICE_ARTIFACTS.microscopy, "cyclic timelapse tiling", ["cyclic time-lapse", "sequentially repeating"]);
    const detailed = [cycle, unitFlow, postprocess, watchers, metadata, preflight, tiling].some(Boolean);
    const steps = detailed ? [
      step({ id: "synchronize_file_watchers", label: "Select shared folders and synchronize all file watchers", phase: "validate", componentIds: ["microscopy_orchestrator_01", "microscopy_acquisition_unit_01", "microscopy_reconstruction_unit_01"], interactions: [interaction("validation", ["microscopy_orchestrator_01", "microscopy_acquisition_unit_01", "microscopy_reconstruction_unit_01"])], transitions: { success: "queue_acquisition_script" }, evidence: preflight }),
      step({ id: "queue_acquisition_script", label: "Create and queue the acquisition script with user imaging parameters", phase: "command", componentIds: ["microscopy_orchestrator_01", "microscopy_acquisition_unit_01"], interactions: [interaction("command", ["microscopy_orchestrator_01", "microscopy_acquisition_unit_01"], { fromComponentId: "microscopy_orchestrator_01", toComponentId: "microscopy_acquisition_unit_01" })], transitions: { success: "acquire_raw_tile" }, evidence: [unitFlow, watchers].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(unitFlow, "user_parameters", "number of tiles; laser powers")]) }),
      step({ id: "acquire_raw_tile", label: "Image one field of view and persist raw data", phase: "operate", componentIds: ["microscope_module_01", "microscopy_acquisition_unit_01"], interactions: [interaction("operation", ["microscope_module_01", "microscopy_acquisition_unit_01"])], transitions: { success: "reconstruct_tile" }, evidence: [cycle, unitFlow].filter((item): item is ProcessEvidence => Boolean(item)) }),
      step({ id: "reconstruct_tile", label: "Consume queued raw data and reconstruct the image tile", phase: "operate", componentIds: ["microscopy_acquisition_unit_01", "microscopy_reconstruction_unit_01"], interactions: [interaction("observation", ["microscopy_acquisition_unit_01", "microscopy_reconstruction_unit_01"], { fromComponentId: "microscopy_acquisition_unit_01", toComponentId: "microscopy_reconstruction_unit_01" }), interaction("operation", ["microscopy_reconstruction_unit_01"])], transitions: { success: "visualize_and_postprocess" }, evidence: [cycle, watchers].filter((item): item is ProcessEvidence => Boolean(item)) }),
      step({ id: "visualize_and_postprocess", label: "Display the reconstructed tile in napari and post-process it", phase: "observe", componentIds: ["microscopy_reconstruction_unit_01", "microscopy_orchestrator_01"], interactions: [interaction("observation", ["microscopy_reconstruction_unit_01", "microscopy_orchestrator_01"], { fromComponentId: "microscopy_reconstruction_unit_01", toComponentId: "microscopy_orchestrator_01" })], transitions: { success: "repeat_and_stitch_tiles" }, evidence: [cycle, postprocess].filter((item): item is ProcessEvidence => Boolean(item)) }),
      step({ id: "repeat_and_stitch_tiles", label: "Repeat the tile cycle concurrently and stitch the expanded field of view", phase: "operate", componentIds: ["microscope_module_01", "microscopy_acquisition_unit_01", "microscopy_reconstruction_unit_01", "microscopy_orchestrator_01"], interactions: [interaction("operation", ["microscope_module_01", "microscopy_acquisition_unit_01", "microscopy_reconstruction_unit_01", "microscopy_orchestrator_01"])], transitions: { success: "publish_image_results" }, evidence: [cycle, tiling].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(tiling, "acquisition_mode", "cyclic time-lapse tiling")]) }),
      step({ id: "publish_image_results", label: "Publish TIFF/Zarr results, metadata and completion log", phase: "update", componentIds: ["microscopy_orchestrator_01", "sila_orchestrator_01", "opentwins_state_01"], interactions: [interaction("observation", ["microscopy_orchestrator_01", "sila_orchestrator_01"], { fromComponentId: "microscopy_orchestrator_01", toComponentId: "sila_orchestrator_01" }), interaction("state-update", ["sila_orchestrator_01", "opentwins_state_01"], { state: "completed" })], transitions: {}, evidence: [metadata, imageFlow].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(metadata, "output_formats", "TIFF; Zarr")]) }),
    ] : [
      step({ id: "acquire_and_analyze_images", label: "Acquire, reconstruct and analyze images", phase: "operate", componentIds: ["microscope_module_01"], interactions: [interaction("operation", ["microscope_module_01"])], transitions: { success: "publish_image_results" }, evidence: imaging }),
      step({ id: "publish_image_results", label: "Publish image and reconstruction results", phase: "observe", componentIds: ["microscope_module_01", "sila_orchestrator_01", "opentwins_state_01"], interactions: [interaction("observation", ["microscope_module_01", "sila_orchestrator_01"], { fromComponentId: "microscope_module_01", toComponentId: "sila_orchestrator_01" }), interaction("observation", ["sila_orchestrator_01", "opentwins_state_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "opentwins_state_01" })], transitions: {}, evidence: imageFlow }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    if (detailed) for (const stepId of missing) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", `Microscopy step ${stepId} lacks its device-source fragment.`, "Restore the corresponding microscopy synchronization intent before declaring the cycle complete.", "microscopy_acquisition", stepId));
    processes.push(definition({ id: "microscopy_acquisition", label: "Microscopy acquisition and analysis", kind: "imaging", completeness: detailed && !missing.length ? "complete" : "partial", ordering: "source", cyclic: detailed, entryStepId: steps[0]?.id, successStepId: "publish_image_results", steps, gaps: detailed ? missing.map((id) => `missing evidence for ${id}`) : ["device-specific acquisition, reconstruction and visualization sequence is unavailable"] }));
  }

  const microfluidicPreparation = evidence("pressure-controlled sample preparation", ["microfluidics line", "pressure-controlled", "preparing single-compound samples"], 15);
  const microfluidicOperations = evidence("microfluidic operations", ["microfluidics line", "immobilisation", "change of buffers"], 15);
  if (microfluidicPreparation || microfluidicOperations) {
    const hardware = deviceEvidence(DEVICE_ARTIFACTS.microfluidic, "microfluidic hardware", ["up to nine buffer reservoirs", "flow sensor", "bubble trap", "valve system"]);
    const feedback = deviceEvidence(DEVICE_ARTIFACTS.microfluidic, "flow feedback", ["feedback from the flow sensor", "regulate the pressure"]);
    const control = deviceEvidence(DEVICE_ARTIFACTS.microfluidic, "microfluidic controller", ["mux distribution valve", "sequential channel selection", "real-time monitoring"]);
    const preparation = deviceEvidence(DEVICE_ARTIFACTS.microfluidic, "sample preparation order", ["deionized water", "isopropanol", "surface passivation", "sample immobilization", "imaging buffer"]);
    const sequence = deviceEvidence(DEVICE_ARTIFACTS.microfluidic, "preprocessing sequence", ["set to a constant value of 200 mbar", "387", "at least 5 s per channel"]);
    const flow = deviceEvidence(DEVICE_ARTIFACTS.microfluidic, "stable sample flow", ["stable flow rate", "500", "31:19 s"]);
    const detailed = [hardware, feedback, control, preparation, sequence, flow].some(Boolean);
    const steps = detailed ? [
      step({ id: "preflight_air_and_devices", label: "Verify compressed air and all ESI devices online", phase: "validate", componentIds: ["microfluidic_pressure_controller_01", "microfluidic_mux_valve_01", "microfluidic_flow_sensor_01"], interactions: [interaction("validation", ["microfluidic_pressure_controller_01", "microfluidic_mux_valve_01", "microfluidic_flow_sensor_01"])], transitions: { success: "flush_and_dry_system" }, evidence: [preparation, hardware].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(hardware, "maximum_buffer_reservoirs", 9)]) }),
      step({ id: "flush_and_dry_system", label: "Flush with DI water, then isopropanol, then dry air", phase: "operate", componentIds: ["microfluidic_pressure_controller_01", "microfluidic_mux_valve_01", "microfluidic_assembly_01"], interactions: [interaction("operation", ["microfluidic_pressure_controller_01", "microfluidic_mux_valve_01", "microfluidic_assembly_01"])], transitions: { success: "remove_air_from_channels" }, evidence: preparation, parameters: parameters([parameter(preparation, "flush_order", "deionized water; isopropanol; dry air")]) }),
      step({ id: "remove_air_from_channels", label: "Preprocess each reservoir channel until liquid reaches the flow sensor", phase: "operate", componentIds: ["microfluidic_pressure_controller_01", "microfluidic_mux_valve_01", "microfluidic_flow_sensor_01"], interactions: [interaction("command", ["microfluidic_pressure_controller_01", "microfluidic_mux_valve_01"], { fromComponentId: "microfluidic_pressure_controller_01", toComponentId: "microfluidic_mux_valve_01" }), interaction("observation", ["microfluidic_flow_sensor_01", "microfluidic_mux_valve_01"], { fromComponentId: "microfluidic_flow_sensor_01", toComponentId: "microfluidic_mux_valve_01" })], transitions: { success: "stabilize_feedback_flow" }, evidence: [sequence, control].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(sequence, "preprocessing_pressure", 200, "mbar"), parameter(sequence, "preprocessing_volume_per_channel", 387, "µL"), parameter(sequence, "minimum_purge_time_per_channel", 5, "s")]) }),
      step({ id: "stabilize_feedback_flow", label: "Regulate pressure from flow-sensor feedback", phase: "observe", componentIds: ["microfluidic_flow_sensor_01", "microfluidic_pressure_controller_01"], interactions: [interaction("observation", ["microfluidic_flow_sensor_01", "microfluidic_pressure_controller_01"], { fromComponentId: "microfluidic_flow_sensor_01", toComponentId: "microfluidic_pressure_controller_01" }), interaction("command", ["microfluidic_pressure_controller_01", "microfluidic_flow_sensor_01"], { fromComponentId: "microfluidic_pressure_controller_01", toComponentId: "microfluidic_flow_sensor_01" })], transitions: { success: "passivate_surface" }, evidence: [feedback, flow].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(flow, "target_flow_rate", 500, "µL/min"), parameter(flow, "estimated_clear_time", 31.19, "s")]) }),
      step({ id: "passivate_surface", label: "Passivate the flow-chamber surface", phase: "operate", componentIds: ["microfluidic_mux_valve_01", "microfluidic_flow_chamber_01"], interactions: [interaction("operation", ["microfluidic_mux_valve_01", "microfluidic_flow_chamber_01"])], transitions: { success: "immobilize_sample" }, evidence: preparation }),
      step({ id: "immobilize_sample", label: "Deliver and immobilize the sample", phase: "operate", componentIds: ["microfluidic_mux_valve_01", "microfluidic_flow_chamber_01"], interactions: [interaction("operation", ["microfluidic_mux_valve_01", "microfluidic_flow_chamber_01"])], transitions: { success: "condition_imaging_buffer" }, evidence: [preparation, microfluidicOperations].filter((item): item is ProcessEvidence => Boolean(item)) }),
      step({ id: "condition_imaging_buffer", label: "Exchange to the imaging buffer and publish prepared state", phase: "update", componentIds: ["microfluidic_flow_chamber_01", "opentwins_state_01"], interactions: [interaction("state-update", ["microfluidic_flow_chamber_01", "opentwins_state_01"], { state: "completed" })], transitions: {}, evidence: preparation }),
    ] : [
      step({ id: "prepare_pressure_flow", label: "Prepare pressure-controlled sample flow", phase: "operate", componentIds: ["microfluidic_assembly_01"], interactions: [interaction("operation", ["microfluidic_assembly_01"])], transitions: { success: "condition_sample" }, evidence: microfluidicPreparation }),
      step({ id: "condition_sample", label: "Personalize, immobilize or change buffers", phase: "operate", componentIds: ["microfluidic_assembly_01"], interactions: [interaction("operation", ["microfluidic_assembly_01"])], transitions: {}, evidence: microfluidicOperations }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    if (detailed) for (const stepId of missing) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", `Microfluidic step ${stepId} lacks its device-source fragment.`, "Restore the corresponding automated microfluidic intent before using that operation.", "microfluidic_sample_preparation", stepId));
    if (detailed) findings.push(processFinding("PROCESS_PROTOCOL_INCOMPLETE", "info", "The hardware order and nominal flow controls are sourced, while the supporting-information buffer recipe and acceptance thresholds are not yet represented.", "Ingest and validate the experiment-specific buffer table and contamination acceptance criteria before execution.", "microfluidic_sample_preparation"));
    else findings.push(processFinding("PROCESS_ORDERING_UNEVIDENCED", "info", "Microfluidic capabilities are evidenced but their device-level sequence is unavailable.", "Ingest the automated microfluidic operation intents before using a source-ordered sequence.", "microfluidic_sample_preparation"));
    processes.push(definition({ id: "microfluidic_sample_preparation", label: "Pressure-controlled sample preparation", kind: "sample-preparation", completeness: "partial", ordering: detailed ? "source" : "presentation-only", cyclic: false, entryStepId: steps[0]?.id, successStepId: steps.at(-1)?.id, steps, gaps: detailed ? [...missing.map((id) => `missing evidence for ${id}`), "buffer identities, incubation durations and contamination acceptance thresholds remain protocol-specific"] : ["operation order, pressure profile, buffer identity and completion criteria are not specified"] }));
  }

  const dosing = evidence("Syringebot dosing", ["syringebot", "liquid dispenser", "6 syringes"], 15);
  const actuators = evidence("Syringebot actuators", ["syringebot", "stepper engines", "servo valves"], 15);
  if (dosing || actuators || processTwinDeclaration) {
    const homing = deviceEvidence(DEVICE_ARTIFACTS.syringebot, "Syringebot homing, prime and purge", ["every cold start", "homed", "priming", "purge procedure"]);
    const calibration = deviceEvidence(DEVICE_ARTIFACTS.syringebot, "Syringebot volume calibration", ["calibration of the volume", "#total syringes 6", "inlet tube volume"]);
    const titration = deviceEvidence(DEVICE_ARTIFACTS.syringebot, "automatic titration setup", ["50 ml", "hydrochloric acid 0.2 m", "potassium hydroxide (1 m)"]);
    const macro = deviceEvidence(DEVICE_ARTIFACTS.syringebot, "automatic titration macro", ["total volume in ml", "number of additions", "pause in seconds", "log.txt"]);
    const detailed = [homing, calibration, titration, macro].some(Boolean);
    const steps = detailed ? [
      step({ id: "home_all_syringes", label: "Home every syringe at cold start with valves in purge position", phase: "validate", componentIds: ["syringebot_controller_01", "syringebot_syringe_bank_01", "syringebot_valve_bank_01"], interactions: [interaction("command", ["syringebot_controller_01", "syringebot_syringe_bank_01"], { fromComponentId: "syringebot_controller_01", toComponentId: "syringebot_syringe_bank_01" }), interaction("safety", ["syringebot_valve_bank_01"])], transitions: { success: "calibrate_syringe_volume" }, evidence: homing }),
      step({ id: "calibrate_syringe_volume", label: "Calibrate plunger distance against syringe and tube volumes", phase: "validate", componentIds: ["syringebot_controller_01", "syringebot_syringe_bank_01"], interactions: [interaction("validation", ["syringebot_controller_01", "syringebot_syringe_bank_01"])], transitions: { success: "prime_inlet_and_outlet" }, evidence: calibration, parameters: parameters([parameter(calibration, "configured_syringes", 6), parameter(calibration, "example_inlet_tube_volume", 10, "mL"), parameter(calibration, "example_outlet_tube_volume", 10, "mL")]) }),
      step({ id: "prime_inlet_and_outlet", label: "Prime syringe 1 and fill the outlet before measured additions", phase: "operate", componentIds: ["syringebot_syringe_bank_01", "syringebot_valve_bank_01"], interactions: [interaction("operation", ["syringebot_syringe_bank_01", "syringebot_valve_bank_01"])], transitions: { success: "configure_titration" }, evidence: [homing, titration].filter((item): item is ProcessEvidence => Boolean(item)) }),
      step({ id: "configure_titration", label: "Configure the documented acid/base titration", phase: "command", componentIds: ["sila_orchestrator_01", "syringebot_controller_01", "syringebot_syringe_bank_01"], interactions: [interaction("command", ["sila_orchestrator_01", "syringebot_controller_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "syringebot_controller_01" })], transitions: { success: "execute_measured_additions" }, evidence: [titration, macro].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(titration, "initial_hcl_volume", 50, "mL"), parameter(titration, "hcl_concentration", 0.2, "M"), parameter(titration, "koh_concentration", 1, "M"), parameter(titration, "selected_syringe", 1), parameter(titration, "selected_syringe_capacity", 60, "mL"), parameter(macro, "total_addition_volume", 20, "mL"), parameter(macro, "addition_count", 20), parameter(macro, "pause_between_additions", 1, "s")]) }),
      step({ id: "execute_measured_additions", label: "Execute the measured addition loop and wait after each dose", phase: "operate", componentIds: ["syringebot_controller_01", "syringebot_syringe_bank_01", "syringebot_valve_bank_01", "syringebot_01"], interactions: [interaction("command", ["syringebot_controller_01", "syringebot_syringe_bank_01"], { fromComponentId: "syringebot_controller_01", toComponentId: "syringebot_syringe_bank_01" }), interaction("operation", ["syringebot_syringe_bank_01", "syringebot_valve_bank_01", "syringebot_01"])], transitions: { success: "purge_outlet" }, evidence: macro }),
      step({ id: "purge_outlet", label: "Purge the outlet so the complete measured volume reaches the vessel", phase: "operate", componentIds: ["syringebot_syringe_bank_01", "syringebot_valve_bank_01", "syringebot_01"], interactions: [interaction("operation", ["syringebot_syringe_bank_01", "syringebot_valve_bank_01", "syringebot_01"])], transitions: { success: "close_valves_and_log" }, evidence: homing }),
      step({ id: "close_valves_and_log", label: "Close both valve paths and preserve the titration log", phase: "update", componentIds: ["syringebot_valve_bank_01", "syringebot_controller_01", "opentwins_state_01"], interactions: [interaction("safety", ["syringebot_valve_bank_01"]), interaction("state-update", ["syringebot_controller_01", "opentwins_state_01"], { state: "completed" })], transitions: {}, evidence: [homing, macro].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(macro, "log_file", "log.txt")]) }),
    ] : [
      step({ id: "configure_dosing", label: "Configure syringe and valve actuation", phase: "command", componentIds: ["sila_orchestrator_01", "syringebot_01"], interactions: [interaction("command", ["sila_orchestrator_01", "syringebot_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "syringebot_01" })], transitions: { success: "dispense_liquid" }, evidence: actuators }),
      step({ id: "dispense_liquid", label: "Dispense liquid for synthesis", phase: "operate", componentIds: ["syringebot_01"], interactions: [interaction("operation", ["syringebot_01"])], transitions: {}, evidence: dosing }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    if (detailed) for (const stepId of missing) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", `Syringebot step ${stepId} lacks its device-source fragment.`, "Restore the corresponding Syringebot operations intent before declaring the sequence complete.", "syringebot_synthesis", stepId));
    if (!detailed) findings.push(processFinding("PROCESS_ORDERING_UNEVIDENCED", "info", "Syringebot dosing hardware is evidenced but the detailed device protocol is unavailable.", "Ingest the Syringebot operations and application-note intents.", "syringebot_synthesis"));
    processes.push(definition({ id: "syringebot_synthesis", label: detailed ? "Syringebot automatic titration" : "Syringebot dosing and synthesis", kind: "synthesis", completeness: detailed && !missing.length ? "complete" : "partial", ordering: detailed ? "source" : "presentation-only", cyclic: false, entryStepId: steps[0]?.id, successStepId: steps.at(-1)?.id, steps, gaps: detailed ? missing.map((id) => `missing evidence for ${id}`) : ["reagent order, volume, timing, setpoints and termination criteria are not specified"] }));
  }

  const pipetteCalibration = deviceEvidence(DEVICE_ARTIFACTS.pipetteSoftware, "pipette volume calibration", ["linear regression", "volume", "distance"]);
  const pipettePresets = deviceEvidence(DEVICE_ARTIFACTS.pipetteSoftware, "pipette encoder presets", ["encoder_pos_top", "encoder_pos_tip", "encoder_pos_bottom"]);
  const pipetteCommands = deviceEvidence(DEVICE_ARTIFACTS.pipetteSoftware, "pipette command register", ["aspirate", "dispense", "homing", "eject_tip"]);
  const pipetteExample = deviceEvidence(DEVICE_ARTIFACTS.pipetteSoftware, "pipette master sequence", ["forward_aspirate", "forward_dispense", "eject"]);
  const pipetteState = deviceEvidence(DEVICE_ARTIFACTS.pipetteSoftware, "pipette state registers", ["pt_error", "position_mm", "nano_liters", "motor_state"]);
  const pipetteErrors = deviceEvidence(DEVICE_ARTIFACTS.pipetteSoftware, "pipette trajectory errors", ["trajectory_not_implemented", "trajectory_buffer_ovf", "trajectory_params_ovf"]);
  if ([pipetteCalibration, pipettePresets, pipetteCommands, pipetteExample, pipetteState, pipetteErrors].some(Boolean)) {
    const steps = [
      step({ id: "validate_pipette_calibration", label: "Validate piston-volume calibration and encoder end positions", phase: "validate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01"], interactions: [interaction("validation", ["oscar_robot_01", "oscar_pipette_tool_01"])], transitions: { success: "home_pipette_piston", failure: "report_pipette_fault" }, evidence: [pipetteCalibration, pipettePresets].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(pipetteCalibration, "example_volume_formula_multiplier", 12499, "nL/mm"), parameter(pipetteCalibration, "example_volume_formula_offset", -1918, "nL"), parameter(pipettePresets, "encoder_top", -12079), parameter(pipettePresets, "encoder_tip", 118083), parameter(pipettePresets, "encoder_bottom", 157010)]) }),
      step({ id: "home_pipette_piston", label: "Home the pipette piston before liquid handling", phase: "command", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01"], interactions: [interaction("command", ["oscar_robot_01", "oscar_pipette_tool_01"], { fromComponentId: "oscar_robot_01", toComponentId: "oscar_pipette_tool_01" })], transitions: { success: "aspirate_liquid", failure: "report_pipette_fault" }, evidence: pipetteCommands }),
      step({ id: "aspirate_liquid", label: "Aspirate the requested volume with the selected trajectory", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01"])], transitions: { success: "dispense_liquid", failure: "report_pipette_fault" }, evidence: [pipetteCommands, pipetteExample].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(pipetteExample, "example_volume", 75000, "nL"), parameter(pipetteExample, "example_speed", 0.02)]) }),
      step({ id: "dispense_liquid", label: "Dispense the requested volume and configured purge offset", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01"])], transitions: { success: "eject_pipette_tip", failure: "report_pipette_fault" }, evidence: [pipetteCommands, pipetteExample].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(pipetteExample, "example_purge_offset", 35000, "nL")]) }),
      step({ id: "eject_pipette_tip", label: "Eject the pipette tip after the transfer", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01"])], transitions: { success: "read_pipette_state", failure: "report_pipette_fault" }, evidence: [pipetteCommands, pipetteExample].filter((item): item is ProcessEvidence => Boolean(item)) }),
      step({ id: "read_pipette_state", label: "Read volume, position, motor and error registers", phase: "observe", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01"], interactions: [interaction("observation", ["oscar_pipette_tool_01", "oscar_robot_01"], { fromComponentId: "oscar_pipette_tool_01", toComponentId: "oscar_robot_01" })], transitions: {}, evidence: pipetteState }),
      step({ id: "report_pipette_fault", label: "Stop motion and report protocol or trajectory fault", phase: "recover", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01"], interactions: [interaction("safety", ["oscar_robot_01", "oscar_pipette_tool_01"], { state: "recovering" })], transitions: {}, evidence: [pipetteErrors, pipetteState].filter((item): item is ProcessEvidence => Boolean(item)) }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    findings.push(processFinding("PROCESS_LABWARE_BINDING_MISSING", "info", "The pipette software defines motion, volumes and errors, but the archive does not bind the demonstration volumes to verified source/destination labware in the scene.", "Add a reviewed transfer protocol with labware wells and permitted volume ranges before real-device execution.", "oscar_pipette_control"));
    findings.push(processFinding("PROCESS_KINEMATIC_MAPPING_MISSING", "info", "Encoder positions are sourced, but no verified mapping connects piston coordinates to a movable scene submesh.", "Bind the encoder frame to a pipette piston mesh before displaying literal travel; until then animate the complete pipette-tool group.", "oscar_pipette_control"));
    processes.push(definition({ id: "oscar_pipette_control", label: "OSCAR digital pipette control", kind: "manipulation", completeness: "partial", ordering: "source", cyclic: false, entryStepId: "validate_pipette_calibration", successStepId: "read_pipette_state", failureStepId: "report_pipette_fault", steps, gaps: [...missing.map((id) => `missing evidence for ${id}`), "source and destination labware plus accepted volume ranges are protocol-specific"] }));
  }

  const mosMachine = deviceEvidence(DEVICE_ARTIFACTS.mos3sSyringeFirmware, "MOS3S dual-extruder configuration", ["hybrid 3d bioprinter", "extruders 2"]);
  const mosSafety = deviceEvidence(DEVICE_ARTIFACTS.mos3sSyringeFirmware, "MOS3S thermal protection", ["thermal protection", "damage", "fire"]);
  const mosAxes = deviceEvidence(DEVICE_ARTIFACTS.mos3sSyringeFirmware, "MOS3S axis envelope", ["x_bed_size 190", "y_bed_size 190", "z_max_pos 200"]);
  const mosHoming = deviceEvidence(DEVICE_ARTIFACTS.mos3sSyringeFirmware, "MOS3S homing configuration", ["z_safe_homing", "homing_feedrate_xy", "homing_feedrate_z"]);
  const mosJob = deviceEvidence(DEVICE_ARTIFACTS.mos3sPrintheadFirmware, "MOS3S print job controls", ["print job timer", "m75", "m76", "m77"]);
  if ([mosMachine, mosSafety, mosAxes, mosHoming, mosJob].some(Boolean)) {
    const motionGroup = ["bioprinter_mos3s_01", "bioprinter_part_carriage", "bioprinter_part_syringe_clamp", "bioprinter_part_platform_holder"];
    const syringeGroup = ["bioprinter_mos3s_01", "bioprinter_part_syringe_clamp", "bioprinter_part_syringe_support_1", "bioprinter_part_syringe_support_2", "bioprinter_part_plunger_retainer_2ml"];
    const steps = [
      step({ id: "validate_bioprinter_safety", label: "Validate the configured machine, two extruders and thermal protection", phase: "validate", componentIds: ["bioprinter_mos3s_01"], interactions: [interaction("validation", ["bioprinter_mos3s_01"]), interaction("safety", ["bioprinter_mos3s_01"])], transitions: { success: "home_bioprinter_axes" }, evidence: [mosMachine, mosSafety].filter((item): item is ProcessEvidence => Boolean(item)), parameters: parameters([parameter(mosMachine, "extruders", 2)]) }),
      step({ id: "home_bioprinter_axes", label: "Home X, Y and Z within the configured safe-homing rules", phase: "command", componentIds: motionGroup, interactions: [interaction("command", motionGroup, { fromComponentId: "bioprinter_mos3s_01", toComponentId: "bioprinter_part_carriage" })], transitions: { success: "position_printhead" }, evidence: mosHoming, parameters: parameters([parameter(mosHoming, "xy_homing_feedrate", 3000, "mm/min"), parameter(mosHoming, "z_homing_feedrate", 240, "mm/min")]) }),
      step({ id: "position_printhead", label: "Position carriage and platform inside the firmware travel envelope", phase: "operate", componentIds: motionGroup, interactions: [interaction("operation", motionGroup)], transitions: { success: "deposit_dual_material" }, evidence: mosAxes, parameters: parameters([parameter(mosAxes, "x_travel", 190, "mm"), parameter(mosAxes, "y_travel", 190, "mm"), parameter(mosAxes, "z_travel", 200, "mm")]) }),
      step({ id: "deposit_dual_material", label: "Drive the two configured syringe extruders along the job toolpath", phase: "operate", componentIds: syringeGroup, interactions: [interaction("operation", syringeGroup)], transitions: { success: "record_bioprint_job" }, evidence: mosMachine }),
      step({ id: "record_bioprint_job", label: "Track print-job state and completion counters", phase: "observe", componentIds: ["bioprinter_mos3s_01", "opentwins_state_01"], interactions: [interaction("observation", ["bioprinter_mos3s_01", "opentwins_state_01"], { fromComponentId: "bioprinter_mos3s_01", toComponentId: "opentwins_state_01" })], transitions: {}, evidence: mosJob, parameters: parameters([parameter(mosJob, "start_pause_stop_commands", "M75; M76; M77")]) }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    findings.push(processFinding("PROCESS_TOOLPATH_MISSING", "warning", "The firmware configuration exposes machine limits and two extruders, but the selected archive does not provide a reviewed bioprint G-code/toolpath and material protocol.", "Supply and validate the job toolpath, material identities, dispense calibration and acceptance criteria before execution.", "mos3s_bioprinting"));
    findings.push(processFinding("PROCESS_KINEMATIC_MAPPING_MISSING", "info", "The archive supplies axis limits but not a verified mapping from firmware axes to the imported MOS3S part transforms.", "Create axis-to-subassembly bindings for carriage, platform and syringe plungers before literal transform animation; current animation highlights the affected groups only.", "mos3s_bioprinting"));
    processes.push(definition({ id: "mos3s_bioprinting", label: "MOS3S dual-syringe bioprint job", kind: "synthesis", completeness: "partial", ordering: "presentation-only", cyclic: false, entryStepId: "validate_bioprinter_safety", successStepId: "record_bioprint_job", steps, gaps: [...missing.map((id) => `missing evidence for ${id}`), "reviewed G-code/toolpath, material recipe, syringe calibration and scene-axis mapping are absent"] }));
  }

  const cloningDemo = evidence("plasmid cloning demonstration", ["complete plasmid cloning protocol"], 12);
  if (processTwinDeclaration || cloningDemo) {
    const protocol = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR cloning protocols", ["protocol #1", "protocol #2", "protocol #3"]);
    const preparePcr = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR PCR preparation", ["prepare the pcr reactions", "12,5", "reaction_1"]);
    const amplify = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR PCR amplification", ["perform pcr reaction", "prepare the samples", "1% agarose gel"]);
    const loadGel = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR first gel loading", ["transfer prepared samples", "well #1", "well #3"]);
    const firstGel = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR first electrophoresis", ["start the electrophoresis", "120 v", "40 min", "protocol #2"]);
    const gibson = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR Gibson assembly", ["gibson assembly", "37°c", "50°c"]);
    const transform = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR transformation", ["transform assembled dna", "42c", "wait 1h", "petri dish"]);
    const verifyMix = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR verification master mix", ["prepare the pcr master mix", "r_1 / r_2 / r_3 / r_4 / r_5"]);
    const pick = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR colony picking", ["take a picture", "pick", "r_1", "r_5"]);
    const verifyPcr = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR verification PCR", ["perform pcr reaction", "r_1 => r_5", "changing tip"]);
    const verifyLoad = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR verification gel loading", ["transfer prepared samples", "well #2 => well #6"]);
    const verifyGel = deviceEvidence(DEVICE_ARTIFACTS.oscarProtocol, "OSCAR verification electrophoresis", ["start the electrophoresis", "120v", "40min"]);
    const detailed = [protocol, preparePcr, amplify, loadGel, firstGel, gibson, transform, verifyMix, pick, verifyPcr, verifyLoad, verifyGel].some(Boolean);
    if (detailed) {
      const steps = [
        step({ id: "prepare_fragment_pcr", label: "Prepare two fragment-amplification PCR reactions", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"])], transitions: { success: "amplify_and_prepare_gel" }, evidence: preparePcr, parameters: parameters([parameter(preparePcr, "pcr_mix_per_reaction", 12.5, "µL"), parameter(preparePcr, "water_per_reaction", 9.5, "µL"), parameter(preparePcr, "mix_cycles", 5)]) }),
        step({ id: "amplify_and_prepare_gel", label: "Run fragment PCR and prepare 1% agarose-gel samples", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"])], transitions: { success: "load_fragment_gel" }, evidence: amplify, parameters: parameters([parameter(amplify, "agarose_gel", 1, "%"), parameter(amplify, "loading_dye", 5, "µL"), parameter(amplify, "amplified_dna", 5, "µL")]) }),
        step({ id: "load_fragment_gel", label: "Load ladder and two amplified fragments into gel wells", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_gel_electrophoresis_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_gel_electrophoresis_01"])], transitions: { success: "verify_fragment_electrophoresis" }, evidence: loadGel, parameters: parameters([parameter(loadGel, "ladder_volume", 5, "µL"), parameter(loadGel, "dna_volume_per_well", 10, "µL")]) }),
        step({ id: "verify_fragment_electrophoresis", label: "Run the first electrophoresis verification", phase: "operate", componentIds: ["oscar_gel_electrophoresis_01"], interactions: [interaction("operation", ["oscar_gel_electrophoresis_01"])], transitions: { success: "assemble_gibson" }, evidence: firstGel, parameters: parameters([parameter(firstGel, "voltage", 120, "V"), parameter(firstGel, "duration", 40, "min")]) }),
        step({ id: "assemble_gibson", label: "Remove template and perform Gibson assembly", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"])], transitions: { success: "transform_and_plate" }, evidence: gibson, parameters: parameters([parameter(gibson, "dpni_stage_temperature", 37, "°C"), parameter(gibson, "dpni_stage_duration", 5, "min"), parameter(gibson, "assembly_temperature", 50, "°C"), parameter(gibson, "assembly_duration", 60, "min")]) }),
        step({ id: "transform_and_plate", label: "Heat-shock competent cells, recover in LB and plate", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"])], transitions: { success: "prepare_colony_pcr_mix" }, evidence: transform, parameters: parameters([parameter(transform, "heat_shock_temperature", 42, "°C"), parameter(transform, "heat_shock_duration", 1, "min"), parameter(transform, "lb_recovery_duration", 1, "h"), parameter(transform, "plating_volume", 200, "µL")]) }),
        step({ id: "prepare_colony_pcr_mix", label: "Prepare and dispense colony-verification PCR master mix", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"])], transitions: { success: "image_and_pick_colonies" }, evidence: verifyMix, parameters: parameters([parameter(verifyMix, "master_mix_per_reaction", 24, "µL"), parameter(verifyMix, "verification_reactions", 5)]) }),
        step({ id: "image_and_pick_colonies", label: "Image isolated colonies and pick five verification samples", phase: "operate", componentIds: ["oscar_colony_camera_01", "oscar_robot_01", "oscar_pipette_tool_01"], interactions: [interaction("observation", ["oscar_colony_camera_01", "oscar_robot_01"], { fromComponentId: "oscar_colony_camera_01", toComponentId: "oscar_robot_01" }), interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01"])], transitions: { success: "run_colony_pcr" }, evidence: pick, parameters: parameters([parameter(pick, "colonies", 5), parameter(pick, "resuspension_cycles", 5)]) }),
        step({ id: "run_colony_pcr", label: "Run colony PCR and prepare verification gel samples", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_thermocycler_01"])], transitions: { success: "load_verification_gel" }, evidence: verifyPcr, parameters: parameters([parameter(verifyPcr, "verification_samples", 5), parameter(verifyPcr, "loading_dye_per_sample", 5, "µL")]) }),
        step({ id: "load_verification_gel", label: "Load ladder and five colony-PCR samples", phase: "operate", componentIds: ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_gel_electrophoresis_01"], interactions: [interaction("operation", ["oscar_robot_01", "oscar_pipette_tool_01", "oscar_gel_electrophoresis_01"])], transitions: { success: "verify_assembly_electrophoresis" }, evidence: verifyLoad, parameters: parameters([parameter(verifyLoad, "sample_wells", "2-6"), parameter(verifyLoad, "dna_volume_per_well", 10, "µL")]) }),
        step({ id: "verify_assembly_electrophoresis", label: "Run final electrophoresis to verify plasmid assembly", phase: "observe", componentIds: ["oscar_gel_electrophoresis_01", "opentwins_state_01"], interactions: [interaction("operation", ["oscar_gel_electrophoresis_01"]), interaction("state-update", ["oscar_gel_electrophoresis_01", "opentwins_state_01"], { state: "completed" })], transitions: {}, evidence: verifyGel, parameters: parameters([parameter(verifyGel, "voltage", 120, "V"), parameter(verifyGel, "duration", 40, "min")]) }),
      ];
      const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
      for (const stepId of missing) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", `OSCAR cloning step ${stepId} lacks its protocol fragment.`, "Restore the corresponding OSCAR supplementary-protocol intent before declaring the workflow complete.", "plasmid_cloning", stepId));
      processes.push(definition({ id: "plasmid_cloning", label: "OSCAR plasmid cloning workflow", kind: "cloning", completeness: missing.length ? "partial" : "complete", ordering: "source", cyclic: false, entryStepId: "prepare_fragment_pcr", successStepId: "verify_assembly_electrophoresis", steps, gaps: missing.map((id) => `missing evidence for ${id}`) }));
    } else {
      findings.push(processFinding("PROCESS_DETAIL_DECLARED_ONLY", "warning", "A plasmid-cloning ProcessTwin and completed demonstration are declared, but no ordered protocol is provided.", "Ingest a reviewed cloning protocol before generating executable or animated laboratory steps.", "plasmid_cloning"));
      processes.push({ id: "plasmid_cloning", label: "Plasmid cloning workflow twin", kind: "cloning", completeness: "declared-only", ordering: "declared-only", cyclic: false, componentIds: ["oscar_robot_01"], steps: [], evidence: uniqueEvidence([processTwinDeclaration, cloningDemo]), gaps: ["ordered cloning operations, materials, conditions, timing and acceptance criteria are absent"] });
    }
  }

  if (!processes.length) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", "No canonical biofoundry process evidence was found in the active intentDSL index.", "Ingest and validate the canonical study intent pack before expecting ProcessDSL output."));
  for (const process of processes.filter((item) => item.ordering === "presentation-only")) {
    findings.push(processFinding("PROCESS_TIMING_UNSPECIFIED", "info", `${process.label} has no source-backed duration.`, "Keep execution timing unknown until a reviewed protocol or live command supplies it.", process.id));
  }

  const document: ProcessDocument = {
    schema: "subactor.process/v1",
    id: `${input.projectId}-processes`,
    projectId: input.projectId,
    sourceSnapshotHash: input.sourceSnapshotHash,
    processes,
    coverage: { processes: 0, complete: 0, partial: 0, declaredOnly: 0, steps: 0, evidencedSteps: 0, missingEvidence: 0, missingComponents: 0 },
    findings,
  };
  document.coverage = processCoverage(document);
  const componentIds = flattenComponents(input.twin.components).map((component) => component.id);
  return validateProcessDocument(document, componentIds);
}
