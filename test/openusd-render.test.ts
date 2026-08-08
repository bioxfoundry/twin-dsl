import test from "node:test";
import assert from "node:assert/strict";
import { renderOpenUsd } from "../src/scene/openusd.js";
import { biofoundryLiveBlueprintV02, materializeBlueprintScene, materializeBlueprintTwin } from "../src/scene/blueprint.js";
import type { ResourceRecord, SceneDocument, TwinDocument } from "../src/core/types.js";

function component(id: string, properties: Record<string, unknown> = {}) {
  return { id, type: "equipment", sourceUris: [`urn:${id}`], properties, children: [] };
}

function twinOf(...ids: { id: string; properties?: Record<string, unknown> }[]): TwinDocument {
  return {
    schema: "subactor.twin/v1",
    id: "t",
    kind: "conceptual",
    observedAt: "2026-01-01T00:00:00Z",
    sourceSnapshotHash: "a".repeat(64),
    components: ids.map((x) => component(x.id, x.properties)),
  };
}

/** Prim names are unique per parent, so counting `def` lines per identifier is enough to spot collisions. */
function primPaths(usd: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  for (const line of usd.split("\n")) {
    const open = line.match(/^(\s*)def \w+ "([^"]+)" \{/);
    if (open) {
      const depth = open[1].length / 4;
      stack.length = depth;
      stack.push(open[2]);
      out.push("/" + stack.join("/"));
    }
  }
  return out;
}

test("distinct scene paths sharing a leaf name render as distinct USD prims", () => {
  const scene: SceneDocument = {
    schema: "subactor.scene/v1",
    id: "biofoundry-scene",
    format: "openusd",
    sourceTwinId: "t",
    bindings: [
      { twinUri: "u#a", componentId: "a", scenePath: "/Biofoundry/Zones/Build", primitive: "cube", position: [0, 0, 0], size: [2, 2, 2], propertyMap: {} },
      { twinUri: "u#b", componentId: "b", scenePath: "/Biofoundry/Equipment/Build", primitive: "cube", position: [5, 0, 0], size: [4, 4, 4], propertyMap: {} },
    ],
  };
  const paths = primPaths(renderOpenUsd(scene, twinOf({ id: "a" }, { id: "b" })));
  assert.ok(paths.includes("/Biofoundry/Zones/Build"), "zone prim missing");
  assert.ok(paths.includes("/Biofoundry/Equipment/Build"), "equipment prim missing");
  assert.equal(new Set(paths).size, paths.length, "duplicate prim path would make the layer unloadable");
});

test("USD prim hierarchy mirrors scenePath so component identity stays addressable", () => {
  const blueprint = biofoundryLiveBlueprintV02();
  const roles: ResourceRecord["sourceRole"][] = ["manager", "customer", "project", "runtime", "development"];
  const resources: ResourceRecord[] = roles.map((role, i) => ({
    schema: "subactor.resource/v1",
    id: String(role),
    uri: `urn:subactor:resource:sha256:${String(i).repeat(64)}`,
    logicalUri: `subactor://${role}`,
    mediaType: "text/markdown",
    sha256: "a".repeat(64),
    size: 1,
    sourcePath: `${role}/doc.md`,
    sourceRole: role,
    derived: false,
    derivedFrom: [],
    createdAt: "2026-08-06T00:00:00Z",
  }));
  const twin = materializeBlueprintTwin({
    blueprint,
    projectId: "bf",
    resources,
    observations: { schema: "subactor.observation/v1", id: "o", sourceSnapshotHash: "e".repeat(64), observations: [] },
    development: {
      schema: "subactor.development-evidence/v1",
      source: "todo2code",
      graphFingerprint: "d".repeat(64),
      recordCount: 1,
      relationCount: 0,
      diagnosticCount: 0,
      blockingDiagnosticCount: 0,
      acceptance: "accepted",
      manifestStatus: "succeeded",
      evidenceUris: ["urn:intent"],
    },
    sourceSnapshotHash: "b".repeat(64),
  });
  const scene = materializeBlueprintScene({ blueprint, projectId: "bf", format: "openusd", twin });
  const paths = new Set(primPaths(renderOpenUsd(scene, twin)));
  for (const binding of scene.bindings) {
    assert.ok(paths.has(binding.scenePath), `USD prim missing for ${binding.scenePath}`);
  }
});

test("cube geometry scale equals the declared extent in metres", () => {
  const scene: SceneDocument = {
    schema: "subactor.scene/v1",
    id: "s",
    format: "openusd",
    sourceTwinId: "t",
    bindings: [{ twinUri: "u#a", componentId: "a", scenePath: "/Facility/Envelope", primitive: "cube", position: [0, 0, 0], size: [60, 36, 0.15], propertyMap: {} }],
  };
  const usd = renderOpenUsd(scene, twinOf({ id: "a" }));
  assert.match(usd, /double size = 1/);
  assert.match(usd, /double3 xformOp:scale = \(60, 36, 0\.15\)/);
});

test("OpenUSD preserves canonical quaternion orientation", () => {
  const scene: SceneDocument = {
    schema: "subactor.scene/v1",
    id: "s",
    format: "openusd",
    sourceTwinId: "t",
    bindings: [{ twinUri: "u#a", componentId: "a", scenePath: "/Facility/Robot", primitive: "cube", position: [1, 2, 3], size: [1, 2, 3], orientation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], propertyMap: {} }],
  };
  const usd = renderOpenUsd(scene, twinOf({ id: "a" }));
  assert.match(usd, /quatd xformOp:orient = \(0\.7071067811865476, \(0, 0, 0\.7071067811865476\)\)/);
  assert.match(usd, /xformOpOrder = \["xformOp:translate", "xformOp:orient"\]/);
});

test("each USD attribute is declared once per prim", () => {
  const scene: SceneDocument = {
    schema: "subactor.scene/v1",
    id: "s",
    format: "openusd",
    sourceTwinId: "t",
    bindings: [{ twinUri: "u#a", componentId: "a", scenePath: "/Facility/Zone", primitive: "cube", position: [0, 0, 0], size: [1, 1, 1], propertyMap: {} }],
  };
  const usd = renderOpenUsd(scene, twinOf({ id: "a", properties: { label: "Zone A" } }));
  const declared = [...usd.matchAll(/custom \S+(?:\[\])? (subactor:\w+) =/g)].map((m) => m[1]);
  assert.equal(new Set(declared).size, declared.length, `duplicate attribute: ${declared.join(",")}`);
  assert.match(usd, /subactor:label = "Zone A"/);
});

test("binding assetUri and propertyMap reach the USD layer", () => {
  const scene: SceneDocument = {
    schema: "subactor.scene/v1",
    id: "s",
    format: "openusd",
    sourceTwinId: "t",
    bindings: [
      {
        twinUri: "u#a",
        componentId: "a",
        scenePath: "/Facility/Reactor",
        primitive: "cylinder",
        position: [0, 0, 0],
        size: [1, 1, 2],
        propertyMap: { status: "subactor:health" },
        assetUri: "./cad/reactor.usdz",
      },
    ],
  };
  const usd = renderOpenUsd(scene, twinOf({ id: "a", properties: { status: "running" } }));
  assert.match(usd, /custom asset subactor:assetUri = @\.\/cad\/reactor\.usdz@/);
  assert.match(usd, /custom string subactor:health = "running"/);
  assert.doesNotMatch(usd, /subactor:status/);
});
