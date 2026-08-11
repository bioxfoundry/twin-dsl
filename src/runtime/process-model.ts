import type { ProcessDefinition, ProcessDocument, ProcessEvidence, ProcessFinding, ProcessInteraction, ProcessStep, TwinDocument } from "../core/types.js";
import { intentUri } from "../dsl/intent.js";
import { processCoverage, validateProcessDocument } from "../dsl/process.js";
import type { GroundedIntentEvidence } from "./biofoundry-concept.js";

type EvidenceNeed = { label: string; includes: string[]; page?: number };

function normalized(value: string): string {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function canonicalEvidence(intents: GroundedIntentEvidence[]): GroundedIntentEvidence[] {
  return intents.filter(({ record }) => [record.source?.artifactUri, ...record.targetUris]
    .filter((value): value is string => typeof value === "string")
    .some((value) => normalized(value).includes("atvirojo kodo biofoundry studija")));
}

function findEvidence(intents: GroundedIntentEvidence[], need: EvidenceNeed): ProcessEvidence | undefined {
  const found = intents.find(({ record }) => {
    const text = normalized(record.text);
    return need.includes.every((part) => text.includes(normalized(part))) && (need.page === undefined || record.source?.page === need.page);
  });
  const source = found?.record.source;
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
    excerpt: found.record.text.slice(0, 800),
  };
}

function uniqueEvidence(values: Array<ProcessEvidence | undefined>): ProcessEvidence[] {
  return [...new Map(values.filter((value): value is ProcessEvidence => Boolean(value)).map((value) => [value.intentId, value])).values()]
    .sort((left, right) => (left.page ?? 0) - (right.page ?? 0) || left.intentId.localeCompare(right.intentId));
}

function interaction(kind: ProcessInteraction["kind"], componentIds: string[], options: Partial<ProcessInteraction> = {}): ProcessInteraction {
  return { kind, componentIds: [...new Set(componentIds)], ...options };
}

function step(input: Omit<ProcessStep, "evidence" | "gaps"> & { evidence?: ProcessEvidence; gaps?: string[] }): ProcessStep {
  return { ...input, evidence: input.evidence ? [input.evidence] : [], gaps: input.gaps ?? (input.evidence ? [] : ["source evidence for this step is missing"]) };
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
    const steps = [
      step({ id: "plan_experiment", label: "Plan the next experiment", phase: "plan", componentIds: ["chemos_planner_01"], interactions: [interaction("operation", ["chemos_planner_01"])], transitions: { success: "execute_plan" }, evidence: closedCycle }),
      step({ id: "execute_plan", label: "Execute plan through SiLA 2 and connected equipment", phase: "command", componentIds: ["chemos_planner_01", "sila_orchestrator_01", "oscar_robot_01", "biospec_bioreactor_01", "microscope_module_01", "microfluidic_assembly_01", "syringebot_01"], interactions: [interaction("command", ["chemos_planner_01", "sila_orchestrator_01"], { fromComponentId: "chemos_planner_01", toComponentId: "sila_orchestrator_01" }), interaction("operation", ["oscar_robot_01", "biospec_bioreactor_01", "microscope_module_01", "microfluidic_assembly_01", "syringebot_01"])], transitions: { success: "monitor_process" }, evidence: closedCycle }),
      step({ id: "monitor_process", label: "Synchronize telemetry and process status in OpenTwins", phase: "observe", componentIds: ["sila_orchestrator_01", "opentwins_state_01"], interactions: [interaction("observation", ["sila_orchestrator_01", "opentwins_state_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "opentwins_state_01" })], transitions: { success: "optimize_next_plan" }, evidence: liveStatus ?? fullCycle }),
      step({ id: "optimize_next_plan", label: "Return results to ChemOS for optimization", phase: "optimize", componentIds: ["opentwins_state_01", "chemos_planner_01"], interactions: [interaction("state-update", ["opentwins_state_01", "chemos_planner_01"], { state: "completed" }), interaction("observation", ["opentwins_state_01", "chemos_planner_01"], { fromComponentId: "opentwins_state_01", toComponentId: "chemos_planner_01" })], transitions: { success: "plan_experiment" }, evidence: fullCycle ?? closedCycle }),
    ];
    const missing = steps.filter((item) => !item.evidence.length).map((item) => item.id);
    for (const stepId of missing) findings.push(processFinding("PROCESS_EVIDENCE_MISSING", "warning", `Closed-loop step ${stepId} has no canonical intent evidence.`, "Restore canonical closed-cycle intent records before enabling complete-loop status.", "closed_optimization", stepId));
    processes.push(definition({ id: "closed_optimization", label: "ChemOS–OpenTwins closed optimization cycle", kind: "optimization", completeness: missing.length ? "partial" : "complete", ordering: "source", cyclic: true, entryStepId: "plan_experiment", successStepId: "optimize_next_plan", steps, gaps: missing.map((id) => `missing evidence for ${id}`) }));
  }

  const processTwinDeclaration = evidence("declared process twins", ["process twins", "cloning", "cultivation", "synthesis"], 25);
  const cultivationControl = evidence("BIO-SPEC controls", ["bio-spec", "controls ph, do, temperature, pumps"], 21);
  const cultivationModes = evidence("BIO-SPEC operating modes", ["bio-spec", "chemostat"], 13);
  if (cultivationControl || cultivationModes || processTwinDeclaration) {
    const steps = [
      step({ id: "control_cultivation", label: "Control pH, DO, temperature and pumps", phase: "operate", componentIds: ["sila_orchestrator_01", "biospec_bioreactor_01"], interactions: [interaction("command", ["sila_orchestrator_01", "biospec_bioreactor_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "biospec_bioreactor_01" }), interaction("operation", ["biospec_bioreactor_01"])], transitions: { success: "observe_cultivation" }, evidence: cultivationControl }),
      step({ id: "observe_cultivation", label: "Observe cultivation state in the digital twin", phase: "observe", componentIds: ["biospec_bioreactor_01", "opentwins_state_01"], interactions: [interaction("observation", ["biospec_bioreactor_01", "opentwins_state_01"], { fromComponentId: "biospec_bioreactor_01", toComponentId: "opentwins_state_01" })], transitions: {}, evidence: cultivationControl }),
    ];
    const gaps = ["source does not define cultivation step ordering, setpoints, timing or termination criteria"];
    findings.push(processFinding("PROCESS_ORDERING_UNEVIDENCED", "info", "BIO-SPEC capabilities are evidenced but their complete operational sequence is not.", "Provide a reviewed cultivation protocol with ordered commands, setpoints and completion criteria.", "cultivation_monitoring"));
    processes.push(definition({ id: "cultivation_monitoring", label: "BIO-SPEC cultivation monitoring", kind: "cultivation", completeness: "partial", ordering: "presentation-only", cyclic: false, entryStepId: "control_cultivation", successStepId: "observe_cultivation", steps, gaps }));
  }

  const imaging = evidence("microscopy acquisition and analysis", ["microscopy system", "image collection", "reconstruction", "analysis"], 14);
  const imageFlow = evidence("microscopy result stream", ["microscopy system", "flow of images", "results of reconstruction"], 21);
  if (imaging || imageFlow) {
    const steps = [
      step({ id: "acquire_and_analyze_images", label: "Acquire, reconstruct and analyze images", phase: "operate", componentIds: ["microscope_module_01"], interactions: [interaction("operation", ["microscope_module_01"])], transitions: { success: "publish_image_results" }, evidence: imaging }),
      step({ id: "publish_image_results", label: "Publish image and reconstruction results", phase: "observe", componentIds: ["microscope_module_01", "sila_orchestrator_01", "opentwins_state_01"], interactions: [interaction("observation", ["microscope_module_01", "sila_orchestrator_01"], { fromComponentId: "microscope_module_01", toComponentId: "sila_orchestrator_01" }), interaction("observation", ["sila_orchestrator_01", "opentwins_state_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "opentwins_state_01" })], transitions: {}, evidence: imageFlow }),
    ];
    processes.push(definition({ id: "microscopy_acquisition", label: "Microscopy acquisition and analysis", kind: "imaging", completeness: "partial", ordering: "source", cyclic: false, entryStepId: "acquire_and_analyze_images", successStepId: "publish_image_results", steps, gaps: ["source does not define sample loading, imaging parameters, duration or acceptance criteria"] }));
  }

  const microfluidicPreparation = evidence("pressure-controlled sample preparation", ["microfluidics line", "pressure-controlled", "preparing single-compound samples"], 15);
  const microfluidicOperations = evidence("microfluidic operations", ["microfluidics line", "immobilisation", "change of buffers"], 15);
  if (microfluidicPreparation || microfluidicOperations) {
    const steps = [
      step({ id: "prepare_pressure_flow", label: "Prepare pressure-controlled sample flow", phase: "operate", componentIds: ["microfluidic_assembly_01"], interactions: [interaction("operation", ["microfluidic_assembly_01"])], transitions: { success: "condition_sample" }, evidence: microfluidicPreparation }),
      step({ id: "condition_sample", label: "Personalize, immobilize or change buffers", phase: "operate", componentIds: ["microfluidic_assembly_01"], interactions: [interaction("operation", ["microfluidic_assembly_01"])], transitions: {}, evidence: microfluidicOperations }),
    ];
    findings.push(processFinding("PROCESS_ORDERING_UNEVIDENCED", "info", "Microfluidic operations are evidenced as capabilities but their exact protocol order is not.", "Provide a reviewed sample-preparation protocol before using this as an executable sequence.", "microfluidic_sample_preparation"));
    processes.push(definition({ id: "microfluidic_sample_preparation", label: "Pressure-controlled sample preparation", kind: "sample-preparation", completeness: "partial", ordering: "presentation-only", cyclic: false, entryStepId: "prepare_pressure_flow", successStepId: "condition_sample", steps, gaps: ["operation order, pressure profile, buffer identity and completion criteria are not specified"] }));
  }

  const dosing = evidence("Syringebot dosing", ["syringebot", "liquid dispenser", "6 syringes"], 15);
  const actuators = evidence("Syringebot actuators", ["syringebot", "stepper engines", "servo valves"], 15);
  if (dosing || actuators || processTwinDeclaration) {
    const steps = [
      step({ id: "configure_dosing", label: "Configure syringe and valve actuation", phase: "command", componentIds: ["sila_orchestrator_01", "syringebot_01"], interactions: [interaction("command", ["sila_orchestrator_01", "syringebot_01"], { fromComponentId: "sila_orchestrator_01", toComponentId: "syringebot_01" })], transitions: { success: "dispense_liquid" }, evidence: actuators }),
      step({ id: "dispense_liquid", label: "Dispense liquid for synthesis", phase: "operate", componentIds: ["syringebot_01"], interactions: [interaction("operation", ["syringebot_01"])], transitions: {}, evidence: dosing }),
    ];
    findings.push(processFinding("PROCESS_ORDERING_UNEVIDENCED", "info", "Syringebot dosing hardware is evidenced but reagent order and quantities are not.", "Provide a reviewed synthesis protocol with reagent identity, volume, timing and safety limits.", "syringebot_synthesis"));
    processes.push(definition({ id: "syringebot_synthesis", label: "Syringebot dosing and synthesis", kind: "synthesis", completeness: "partial", ordering: "presentation-only", cyclic: false, entryStepId: "configure_dosing", successStepId: "dispense_liquid", steps, gaps: ["reagent order, volume, timing, setpoints and termination criteria are not specified"] }));
  }

  const cloningDemo = evidence("plasmid cloning demonstration", ["complete plasmid cloning protocol"], 12);
  if (processTwinDeclaration || cloningDemo) {
    findings.push(processFinding("PROCESS_DETAIL_DECLARED_ONLY", "warning", "A plasmid-cloning ProcessTwin and completed demonstration are declared, but no ordered protocol is provided.", "Ingest a reviewed cloning protocol before generating executable or animated laboratory steps.", "plasmid_cloning"));
    processes.push({ id: "plasmid_cloning", label: "Plasmid cloning workflow twin", kind: "cloning", completeness: "declared-only", ordering: "declared-only", cyclic: false, componentIds: ["oscar_robot_01"], steps: [], evidence: uniqueEvidence([processTwinDeclaration, cloningDemo]), gaps: ["ordered cloning operations, materials, conditions, timing and acceptance criteria are absent"] });
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
