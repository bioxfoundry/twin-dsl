---
schema: bioxfoundry.error-page/v1
code: LLM_SCENE_PROPOSAL_REJECTED
source: error/catalog.json
generated: true
---

# LLM_SCENE_PROPOSAL_REJECTED — Llm scene proposal rejected

- Subsystem: `llm`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The llm scene proposal operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/runtime/living-project.ts`
