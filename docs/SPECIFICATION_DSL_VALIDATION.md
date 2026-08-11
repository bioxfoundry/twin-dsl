# Specification data validation

The key biofoundry PDF family is accepted only when one deterministic validation chain proves that
the source bytes, Markdown mirror, intentDSL packs and active Twin still describe the same project.
The validator does not call an LLM and does not repair data while validating it.

## Command

From `twin-dsl` run:

```bash
make specification-validate
```

The command writes `.factory-demo/runtime/specification-dsl-validation.json` and exits non-zero on
`FAIL`. Workspace CI invokes the same target, so a skipped or unreadable input cannot inherit a
green result.

The direct CLI contract is:

```text
specification-dsl-validate <source-dir> <markdown-dir> <dsl-dir> \
  [scene-blueprint.json] [intent-index.json] [twin.json] [scene.json] [report.json]
```

The report schema is `bioxfoundry.specification-dsl-validation/v1`; its published JSON Schema is
[`schemas/specification-dsl-validation.schema.json`](../schemas/specification-dsl-validation.schema.json).

## Deterministic checks

For every PDF in `A. SPECIFIKACIJA`, the validator checks:

- source and translated Markdown plus their structure and quality sidecars;
- SHA-256 binding from source PDF to structure metadata and from Markdown body to structure data;
- identical source-page coverage and diagram targets in both languages;
- valid local diagram destinations and absence of known translation corruptions;
- one valid `t2c.intent-pack/v1` whose source hash, record schema, page and fragment provenance bind
  every intent to the current Markdown;
- canonical evidence from pages 10–17 of `Atvirojo kodo biofoundry studija.pdf`;
- at least the historical 45-component scene baseline and one binding per component;
- distinct Twin identities for OSCAR, BIO-SPEC, microscopy, microfluidics, Syringebot, cleanroom,
  ChemOS, SiLA 2, ROS 2 and OpenTwins;
- exact identity coverage between the accepted blueprint, flattened generated Twin and Scene, plus
  matched intent evidence on every required component;
- priority of the canonical study in the active intent index.

Missing spatial evidence is not replaced with invented dimensions or coordinates. A documented
physical component such as Syringebot may therefore exist as a `scope` binding until measured or
source-backed geometry becomes available.

Every stable finding code has a companion `error/<CODE>.md` page containing meaning, likely causes,
impact and deterministic resolution steps. `error/catalog.json` is the machine-readable index.

## Intent validation with todo2code

The canonical installation is `~/github/semcod/todo2code`. Requirements are first recorded as
atomic `t2c.intent/v1` task records. The implementation is then extracted independently from Git,
AST and documentation, linked with `todo2code link`, checked by `todo2code diagnose`, and summarized
by `todo2code reality`. The resulting graph fingerprint is the auditable connection between the
requested intent and the committed implementation; it is evidence, not permission to mutate files.

LLM assistance remains outside this validator. Where an agent uses an LLM elsewhere in the system,
the only accepted model output is patchDSL and the existing deterministic parser, base hash,
allowed-path and domain validators remain authoritative.
