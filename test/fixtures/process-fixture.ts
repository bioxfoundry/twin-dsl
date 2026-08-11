import type { IntentRecord, TwinDocument } from "../../src/core/types.js";
import type { GroundedIntentEvidence } from "../../src/runtime/biofoundry-concept.js";

export const COMPONENT_IDS = [
  "opentwins_state_01", "oscar_robot_01", "cleanroom_base_01", "sila_orchestrator_01", "ros2_robotics_01",
  "chemos_planner_01", "biospec_bioreactor_01", "microscope_module_01", "microfluidic_assembly_01", "syringebot_01",
  "biospec_controller_01", "biospec_feed_pump_01", "biospec_gas_valve_01", "biospec_stirrer_01", "biospec_condenser_01",
  "microscopy_acquisition_unit_01", "microscopy_reconstruction_unit_01", "microscopy_orchestrator_01",
  "microfluidic_pressure_controller_01", "microfluidic_mux_valve_01", "microfluidic_flow_sensor_01", "microfluidic_flow_chamber_01",
  "syringebot_controller_01", "syringebot_syringe_bank_01", "syringebot_valve_bank_01",
  "oscar_pipette_tool_01", "oscar_thermocycler_01", "oscar_gel_electrophoresis_01", "oscar_colony_camera_01",
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

function deviceIntent(id: string, artifactPath: string, text: string): GroundedIntentEvidence {
  const artifactUri = `subactor://markdown/${artifactPath}`;
  return {
    sourceUri: `urn:subactor:resource:sha256:${"e".repeat(64)}`,
    record: {
      schema: "t2c.intent/v1", id, type: "plan", text, actor: "source:markdown", targetUris: [artifactUri],
      source: {
        artifactUri, revisionHash: "f".repeat(64), fragment: `${artifactPath}#${id}`,
        artifactUrn: `urn:subactor:artifact:sha256:${id.padEnd(64, "0")}`, converter: "fixture", converterVersion: "1",
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

export function deviceIntents(): GroundedIntentEvidence[] {
  const biospec = "I. Bioreactor/1-s2.0-S2468067225000483-main.pdf.md";
  const microscopy = "II. Microscopy/1-s2.0-S246806722300007X-main.pdf.md";
  const microfluidic = "III. Microfluidic assembly/1-s2.0-S2468067223000329-main.pdf.md";
  const syringebot = "IV. 3D microfluidic bioprinting/3d chemical synthesis robot/PIIS2468067222000554.pdf.md";
  const oscar = "0. OSCAR robot/sb5c00733_si_002.pdf.md";
  return [
    deviceIntent("bio-hardware", biospec, "Real-time feedback controls solenoid valves and Peltier condensers; stirrers and pumps use relays."),
    deviceIntent("bio-gas", biospec, "Solenoid valves are normally closed. Set at least 1 vvm and each pressure regulator to 300 mbarg."),
    deviceIntent("bio-setup", biospec, "Ensure correct GPIO pins. Up to six reactors are controlled. Define the desired timing interval and START_TIME."),
    deviceIntent("bio-phase", biospec, "command_dict sets AIR N2 FEED FEED2 OUT STIR. An initial growth phase precedes cycling; check phase transitions."),
    deviceIntent("bio-endurance", biospec, "The system operates at least 35 days with real-time monitoring and safe operation after power interruption."),
    deviceIntent("mic-cycle", microscopy, "One cycle consists of imaging a FOV, reconstructing raw data and visualizing it as a napari layer."),
    deviceIntent("mic-units", microscopy, "User parameters include number of tiles and laser powers; raw data goes to the reconstruction unit."),
    deviceIntent("mic-post", microscopy, "Reconstructed images are displayed as napari layers and users can post-process them."),
    deviceIntent("mic-watch", microscopy, "The watcher adds the incoming files to a queue where they are processed sequentially."),
    deviceIntent("mic-meta", microscopy, "Metadata is preserved, reconstruction writes TIFF and Zarr, and a logger file records completion."),
    deviceIntent("mic-preflight", microscopy, "Before experiments all units must be synchronized by setting up the file watchers."),
    deviceIntent("mic-tiling", microscopy, "Cyclic time-lapse images are acquired by imaging tiles and sequentially repeating the procedure."),
    deviceIntent("flow-hardware", microfluidic, "Up to nine buffer reservoirs use a flow sensor, bubble trap and valve system."),
    deviceIntent("flow-feedback", microfluidic, "Feedback from the flow sensor is used to regulate the pressure for constant volume flow."),
    deviceIntent("flow-control", microfluidic, "The MUX Distribution Valve supports sequential channel selection with real-time monitoring."),
    deviceIntent("flow-prep", microfluidic, "Flush with deionized water then isopropanol and dry air; surface passivation precedes sample immobilization and imaging buffer."),
    deviceIntent("flow-sequence", microfluidic, "Pressure is set to a constant value of 200 mbar; preprocessing volume is 387 µL and at least 5 s per channel."),
    deviceIntent("flow-rate", microfluidic, "Maintain a stable flow rate of 500 µL/min with estimated clearing time 31:19 s."),
    deviceIntent("syr-home", syringebot, "At every cold start every syringe must be homed; priming fills inlet and the purge procedure clears outlet before valves close."),
    deviceIntent("syr-cal", syringebot, "Calibration of the volume uses #total syringes 6 and inlet tube volume 10 ml and outlet tube volume 10 ml."),
    deviceIntent("syr-demo", syringebot, "Automatic titration starts with 50 ml hydrochloric acid 0.2 M and potassium hydroxide (1 M), using syringe 1 of 60 ml."),
    deviceIntent("syr-macro", syringebot, "Macro parameters set total volume in ml, number of additions and pause in seconds; results go to log.txt."),
    deviceIntent("oscar-overview", oscar, "Protocol #1 amplifies fragments, Protocol #2 performs Gibson assembly, Protocol #3 verifies colonies."),
    deviceIntent("oscar-pcr", oscar, "Prepare the PCR reactions with 12,5 µl mix in Reaction_1 and Reaction_2."),
    deviceIntent("oscar-amplify", oscar, "Perform PCR reaction and prepare the samples for a 1% agarose gel."),
    deviceIntent("oscar-load", oscar, "Transfer prepared samples: ladder to Well #1 and fragments through Well #3."),
    deviceIntent("oscar-gel1", oscar, "Start the electrophoresis at 120 V for 40 min. Protocol #2 follows."),
    deviceIntent("oscar-gibson", oscar, "Gibson assembly runs at 37°C and then 50°C."),
    deviceIntent("oscar-transform", oscar, "Transform assembled DNA at 42C, wait 1h, then transfer to a Petri Dish."),
    deviceIntent("oscar-mix", oscar, "Prepare the PCR master mix and dispense it to R_1 / R_2 / R_3 / R_4 / R_5."),
    deviceIntent("oscar-pick", oscar, "Take a picture, Pick isolated colonies into R_1 through R_5."),
    deviceIntent("oscar-verify", oscar, "Perform PCR reaction for R_1 => R_5, changing tip for each sample."),
    deviceIntent("oscar-load2", oscar, "Transfer prepared samples from R_1 through R_5 to Well #2 => Well #6."),
    deviceIntent("oscar-gel2", oscar, "Start the electrophoresis at 120V for 40min."),
  ];
}
