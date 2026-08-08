/**
 * Identity of the *generation semantics*, independent of the project's inputs.
 *
 * An iteration is skipped when nothing about the project changed — same sources, same code,
 * same observations, same config. That idempotence is what makes the watcher cheap to run
 * continuously, but it is keyed on inputs alone, so a change in how the runtime *derives*
 * the twin from those inputs would never reach an existing project: the fix ships, every
 * input hash stays identical, and every twin keeps the values the old code produced.
 *
 * Including this constant in the short-circuit closes that hole. Bump it whenever a change
 * alters what the runtime produces from unchanged inputs — grounding rules, blueprint
 * matching, evidence ranking, scene layout — and every project re-derives on its next
 * iteration. Do not bump it for changes that cannot alter output (docs, tests, logging):
 * a needless bump costs every project a full regeneration.
 */
export const RUNTIME_GENERATION = "2026-08-08.project-integrity-v1";
