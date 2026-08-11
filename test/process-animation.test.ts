import test from "node:test";
import assert from "node:assert/strict";
import type { SceneDocument } from "../src/core/types.js";
import { deriveBiofoundryProcesses } from "../src/runtime/process-model.js";
import {
  compileProcessAnimation,
  parseProcessAnimationDsl,
  PRESENTATION_STEP_DURATION_MS,
  renderProcessAnimationDsl,
  validateProcessAnimation,
} from "../src/runtime/process-animation.js";
import { canonicalIntents, COMPONENT_IDS, twin } from "./fixtures/process-fixture.js";

function scene(): SceneDocument {
  return {
    schema: "subactor.scene/v1", id: "process-scene", format: "openusd", sourceTwinId: "test-twin",
    bindings: COMPONENT_IDS.map((componentId, index) => ({ twinUri: `urn:test#${componentId}`, componentId, scenePath: `/Biofoundry/${componentId}`, primitive: "cube", position: [index, 0, 0], size: [1, 1, 1], propertyMap: {} })),
  };
}

test("AnimationDSL compiles semantic interactions into normalized presentation effects", () => {
  const processes = deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents: canonicalIntents(), twin: twin() });
  const document = compileProcessAnimation(processes, scene());
  assert.equal(document.timing.factualProcessDuration, false);
  assert.equal(document.timing.stepDurationMs, PRESENTATION_STEP_DURATION_MS);
  assert.match(document.timing.disclaimer, /not laboratory execution time/i);
  const manipulation = document.animations.find((animation) => animation.processId === "laboratory_manipulation");
  assert.deepEqual(manipulation?.successStepIds, ["check_documented_state", "dispatch_oscar_command", "validate_ros_parameters", "verify_and_execute_motion", "publish_progress", "update_equipment_state"]);
  assert.deepEqual(manipulation?.failureStepIds.at(-1), "safe_recovery");
  assert.ok(manipulation?.clips.some((clip) => clip.effects.some((effect) => effect.kind === "flow")));
  assert.ok(manipulation?.clips.every((clip) => clip.effects.every((effect) => effect.basis === "presentation-only")));
  const cloning = document.animations.find((animation) => animation.processId === "plasmid_cloning");
  assert.equal(cloning?.available, false);
  assert.equal(cloning?.unavailableReason, "PROCESS_DETAIL_DECLARED_ONLY");
});

test("AnimationDSL round-trips and rejects effects outside the accepted Scene", () => {
  const processes = deriveBiofoundryProcesses({ projectId: "biofoundry", sourceSnapshotHash: "d".repeat(64), intents: canonicalIntents(), twin: twin() });
  const acceptedScene = scene();
  const document = compileProcessAnimation(processes, acceptedScene);
  const dsl = renderProcessAnimationDsl(document);
  assert.deepEqual(parseProcessAnimationDsl(dsl, processes, acceptedScene), document);
  assert.equal(renderProcessAnimationDsl(parseProcessAnimationDsl(dsl)), dsl);
  const invalid = structuredClone(document);
  invalid.animations[0].clips[0].effects[0].componentId = "missing_component";
  assert.throws(() => validateProcessAnimation(invalid, processes, acceptedScene), /PROCESS_ANIMATION_COMPONENT_MISSING/);
});
