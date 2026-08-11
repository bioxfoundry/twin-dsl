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

The current deterministic compiler recognizes intent records grounded in `Atvirojo kodo biofoundry studija.pdf`. It retains the intent id, intent URI, source and artifact URIs, source revision, page or fragment, and a bounded excerpt for every evidenced step.

The study currently supports the following process detail:

| Process | Status | Source-grounded behavior | Explicit limitation |
| --- | --- | --- | --- |
| OSCAR laboratory manipulation | complete | state preflight; high-level command; SiLA/ROS validation; MoveIt verification and motion; progress observations; state update; safe recovery | completeness applies to the documented control sequence, not to a wet-lab SOP |
| ChemOS–OpenTwins optimization | complete | plan; execute; monitor; optimize; return to planning | step durations and experiment-specific parameters are not supplied |
| BIO-SPEC cultivation | partial | control pH, DO, temperature and pumps; observe state | ordered protocol, setpoints, timing and termination criteria are absent |
| microscopy acquisition | partial | acquire, reconstruct and analyze images; publish results | sample loading, imaging parameters, duration and acceptance criteria are absent |
| microfluidic preparation | partial | pressure-controlled preparation; personalization, immobilization or buffer change | precise order, pressure profile, buffers and completion criteria are absent |
| Syringebot synthesis | partial | configure syringe/valve actuation; dispense liquid | reagents, quantities, order, timing and limits are absent |
| plasmid cloning | declared-only | a process twin and completed demonstration are declared | no ordered protocol is present, therefore no steps or animation are generated |

`complete` means that every step in the particular modeled sequence has source evidence. It does not mean that the source is a deployment-ready SOP. `partial` means that useful behavior is evidenced but the listed gaps prevent an executable interpretation. `declared-only` preserves a capability claim without fabricating a workflow.

## ProcessDSL contract

The accepted runtime publishes both `current/process.json` and `current/process.dsl`. Both represent `subactor.process/v1` and contain:

- process completeness and ordering basis;
- entry, success and failure steps;
- semantic interactions: validation, command, operation, observation, state update and safety;
- success and failure transitions;
- component ids validated against the accepted TwinDSL;
- evidence attached at process and step level;
- unresolved gaps, findings and exact coverage totals.

`src/dsl/process.ts` validates the JSON object and the textual DSL round trip. Validation fails closed for duplicate ids, broken transitions, missing components, missing evidence in a complete process, or inconsistent coverage. The JSON Schema is `schemas/process.schema.json`.

## AnimationDSL contract

The accepted runtime also publishes `current/process-animation.json` and `current/process-animation.dsl` as `subactor.process-animation/v1`. The compiler translates semantic interactions into four visual effects:

| Process interaction | Dashboard effect |
| --- | --- |
| validation | highlight validated actors |
| command or observation | highlight endpoints and show a directional flow |
| operation | pulse the active device |
| state update or safety | show completed or recovering state |

Every effect is validated against a component binding in the accepted SceneDSL. The dashboard never moves geometry to invent a physical trajectory. It changes only presentation state such as color and scale, while the process panel identifies the active step, the relevant actors, the evidence page and intent id, and the unresolved gaps.

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
