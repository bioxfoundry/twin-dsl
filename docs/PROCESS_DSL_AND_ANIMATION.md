# Source-grounded ProcessDSL and process animation

## Purpose

The biofoundry twin does not stop at a static equipment inventory. During a living-project iteration it derives a process model from validated intent records, binds every process actor to an accepted TwinDSL component, and compiles a presentation-only animation plan for the accepted SceneDSL.

The deterministic pipeline is:

```text
reviewed source artifact
  -> Markdown with provenance
  -> intentDSL records
  -> ProcessDSL validation against TwinDSL
  -> AnimationDSL validation against SceneDSL
  -> accepted iteration and dashboard
```

The model never fills a missing protocol step, duration, setpoint, reagent quantity or safety limit with a plausible guess. Missing evidence lowers completeness and remains visible as a stable finding from the `error/[code].md` catalog.

## Source used by the biofoundry compiler

The current deterministic compiler starts from `Atvirojo kodo biofoundry studija.pdf` and follows its named equipment into allowlisted device-source packs: BIO-SPEC, microscopy synchronization, automated microfluidics, Syringebot and the OSCAR supplementary protocol. It retains the intent id, intent URI, source and artifact URIs, source revision, page or fragment, and a bounded excerpt for every evidenced step. Text copied into an unrelated artifact is not accepted as device evidence.

The study currently supports the following process detail:

| Process | Status | Source-grounded behavior | Explicit limitation |
| --- | --- | --- | --- |
| OSCAR laboratory manipulation | complete | state preflight; high-level command; SiLA/ROS validation; MoveIt verification and motion; progress observations; state update; safe recovery | completeness applies to the documented control sequence, not to a wet-lab SOP |
| ChemOS–OpenTwins optimization | complete | plan; execute; monitor; optimize; return to planning | step durations and experiment-specific parameters are not supplied |
| BIO-SPEC cultivation | partial | GPIO/probe dry-run; fail-closed gas preflight; growth and scheduled phases; gas/feed/stir/condenser actuation; GUI/twin monitoring; safe power-loss state | phase intervals, experiment setpoints and biological termination criteria remain configurable |
| microscopy acquisition | complete | synchronize watchers; queue scripts; acquire raw tiles; reconstruct; napari post-process; repeat/stitch; publish TIFF/Zarr, metadata and log | completeness covers the documented dataflow, not sample-specific imaging acceptance |
| microfluidic preparation | partial | device preflight; DI-water/isopropanol/dry-air flush; air removal at 200 mbar; 500 µL/min feedback; passivation; immobilization; imaging-buffer exchange | buffer identities, incubations and contamination acceptance thresholds remain protocol-specific |
| Syringebot automatic titration | complete | home; calibrate; prime; configure the documented HCl/KOH run; execute 20 measured additions; purge; close valves and log | completeness applies to the documented demonstration, not arbitrary chemical synthesis |
| OSCAR plasmid cloning | complete | fragment PCR and gel; Gibson assembly; heat-shock, recovery and plating; colony image/pick; verification PCR and gel | completeness applies to the supplied three-protocol demonstration |

`complete` means that every step in the particular modeled sequence has source evidence. It does not mean that the source is a deployment-ready SOP. `partial` means that useful behavior is evidenced but the listed gaps prevent an executable interpretation. `declared-only` preserves a capability claim without fabricating a workflow.

## ProcessDSL contract

The accepted runtime publishes both `current/process.json` and `current/process.dsl`. Both represent `subactor.process/v1` and contain:

- process completeness and ordering basis;
- entry, success and failure steps;
- semantic interactions: validation, command, operation, observation, state update and safety;
- source-valued parameters with units and the exact evidence intent id that supports each value;
- success and failure transitions;
- component ids validated against the accepted TwinDSL;
- evidence attached at process and step level;
- unresolved gaps, findings and exact coverage totals.

`src/dsl/process.ts` validates the JSON object and the textual DSL round trip. Validation fails closed for duplicate ids, broken transitions, missing components, missing evidence or step gaps in a complete process, parameters that do not cite evidence on the same step, a stale process-level evidence index, or inconsistent coverage. The JSON Schema is `schemas/process.schema.json`.

## AnimationDSL contract

The accepted runtime also publishes `current/process-animation.json` and `current/process-animation.dsl` as `subactor.process-animation/v1`. The compiler translates semantic interactions into four visual effects:

| Process interaction | Dashboard effect |
| --- | --- |
| validation | highlight validated actors |
| command or observation | highlight endpoints and show a directional flow |
| operation | pulse the active device |
| state update or safety | show completed or recovering state |

Every effect is validated against a component binding in the accepted SceneDSL. Device-level actors include controllers, pumps, valves, stirrers, sensors, flow chambers, compute units, thermocycler, gel station and colony camera. Their existence and function are source-backed; their compact dashboard placement and primitive envelopes are explicitly presentation-only. The dashboard never moves geometry to invent a physical trajectory. It changes only presentation state such as color and scale, while the process panel identifies the active step, relevant actors, evidence page or fragment, intent id, source-valued parameters and unresolved gaps.

The success path follows `success` transitions. When a documented failure transition exists, the failure control follows it to the recovery step. A process without steps is visible but its animation is unavailable with a stable explanation code.

All clips use normalized display timing. The contract fixes `factualProcessDuration` to `false` and displays this disclaimer:

> Normalized display timing only; it is not laboratory execution time and does not authorize device control.

The JSON Schema is `schemas/process-animation.schema.json`.

## Runtime state and precedence

Process animation is an explanatory overlay, not device state. When a live TwinState binding reports an alert or another authoritative state, that state takes visual precedence over the presentation animation. Process playback cannot mutate the Twin, accepted artifacts or connected equipment.

This separation is deliberate:

- ProcessDSL says what the supplied evidence supports logically;
- AnimationDSL says how that logic can be illustrated in time;
- TwinState says what the connected or simulated system reports now;
- an approved control integration, which is outside this animation contract, would be required to command hardware.

## Extending process detail safely

To add a process or promote an existing one:

1. convert the authoritative source while preserving provenance;
2. create and validate intentDSL records through the canonical `todo2code` installation;
3. add deterministic evidence matchers and explicit component bindings;
4. record every missing parameter or relationship as a gap instead of guessing it;
5. validate ProcessDSL against TwinDSL and AnimationDSL against SceneDSL;
6. add positive, missing-evidence and invalid-binding tests;
7. run a living-project iteration and inspect the accepted coverage and dashboard evidence.

The related stable errors and findings are documented under `error/PROCESS_*.md` and indexed by `error/README.md`.
