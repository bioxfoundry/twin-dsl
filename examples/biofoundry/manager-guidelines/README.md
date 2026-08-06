# Biofoundry manager guidelines

The Digital Twin is updated continuously from approved sources. Manager policy is authoritative for hard execution gates. Customer documentation defines verified dimensions and layout constraints. Project telemetry and status files define observed state.

Rules:

1. Never rebuild the current 3D scene when `approved=false`.
2. Never exceed the configured active-bioreactor limit.
3. Keep clean and dirty processing zones semantically separate.
4. Customer dimensions may update geometry, but missing geometry must remain conceptual and explicitly unverified.
5. An LLM may propose `mathDSL`, `twinDSL` and `sceneDSL`; runtime validation decides whether artifacts are materialized.
