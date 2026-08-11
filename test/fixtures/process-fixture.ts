import type { IntentRecord, TwinDocument } from "../../src/core/types.js";
import type { GroundedIntentEvidence } from "../../src/runtime/biofoundry-concept.js";

export const COMPONENT_IDS = [
  "opentwins_state_01", "oscar_robot_01", "cleanroom_base_01", "sila_orchestrator_01", "ros2_robotics_01",
  "chemos_planner_01", "biospec_bioreactor_01", "microscope_module_01", "microfluidic_assembly_01", "syringebot_01",
];

export function twin(ids = COMPONENT_IDS): TwinDocument {
  return {
    schema: "subactor.twin/v1", id: "test-twin", kind: "physical", observedAt: "1970-01-01T00:00:00.000Z",
    sourceSnapshotHash: "a".repeat(64),
    components: ids.map((id) => ({ id, type: "equipment", sourceUris: ["urn:test"], properties: {}, children: [] })),
  };
}

function intent(id: string, page: number, text: string, type: IntentRecord["type"] = "plan"): GroundedIntentEvidence {
  return {
    sourceUri: `urn:subactor:resource:sha256:${"b".repeat(64)}`,
    record: {
      schema: "t2c.intent/v1", id, type, text, actor: "source:markdown",
      targetUris: ["subactor://markdown/A. SPECIFIKACIJA/Atvirojo kodo biofoundry studija.pdf.md"],
      source: {
        artifactUri: "subactor://markdown/A. SPECIFIKACIJA/Atvirojo kodo biofoundry studija.pdf.md",
        revisionHash: "c".repeat(64), fragment: `canonical#${id}`, page,
        artifactUrn: `urn:subactor:artifact:sha256:${id.padEnd(64, "0")}`,
        converter: "fixture", converterVersion: "1",
      },
    },
  };
}

export function canonicalIntents(): GroundedIntentEvidence[] {
  return [
    intent("seq1", 24, "29 Conduct sequence: The orchestra checks OpenTwins the documented status of the equipment, sample and work area."),
    intent("seq2", 24, "29 Conduct sequence: SiLA 2 client calls high level OSCAR command and transmit process parameters."),
    intent("seq3", 24, "29 Conduct sequence: SiLA-ROS bridge validates the parameters and initiates the corresponding ROS 2 step."),
    intent("seq4", 24, "29 Conduct sequence: MoveIt 2 verify the trajectory in the digital working area model and perform movement."),
    intent("seq5", 24, "29 Conduct sequence: Sensor nodes publish progress and the bridge forwards it to OpenTwins."),
    intent("seq6", 24, "29 Conduct sequence: In case of success the status of the sample and equipment is updated and on error safe suspension follows."),
    intent("safe", 25, "30 Safety and reliability: After loss of communication the system passes to a predefined secure state."),
    intent("loop1", 13, "10.2 ChemOS: Used for closed cycle: planning to execution to data collection to optimisation.", "claim"),
    intent("loop2", 28, "37 ChemOS and OpenTwins: Real-time status source for AI planner.", "claim"),
    intent("loop3", 29, "40 Summary: full closed cycle planning to execution to monitoring to optimization.", "report"),
    intent("twins", 25, "32 OpenTwins overview: Process twins for cloning, cultivation and synthesis.", "report"),
    intent("bio1", 21, "21.2 BIO-SPEC: SiLA 2 controls pH, DO, temperature, pumps.", "claim"),
    intent("bio2", 13, "10.3 BIO-SPEC operating modes include chemostat.", "claim"),
    intent("img1", 14, "10.4 microscopy system allows image collection, reconstruction and analysis.", "report"),
    intent("img2", 21, "21.3 microscopy system exposes flow of images and results of reconstruction.", "claim"),
    intent("micro1", 15, "10.5 microfluidics line is pressure-controlled for preparing single-compound samples.", "claim"),
    intent("micro2", 15, "10.5 microfluidics line supports immobilisation and change of buffers.", "claim"),
    intent("syr1", 15, "10.6 Syringebot is a liquid dispenser with up to 6 syringes.", "claim"),
    intent("syr2", 15, "10.6 Syringebot uses stepper engines and servo valves.", "claim"),
    intent("clone", 12, "10.1 OSCAR demonstration: complete plasmid cloning protocol.", "report"),
  ];
}
