import test from "node:test";
import assert from "node:assert/strict";
import { contentUri as applicationContentUri } from "../src/core/canonical.js";
import type { AssemblyDocument as ApplicationAssemblyDocument, LiveBindingDocument as ApplicationLiveBindingDocument } from "../src/core/types.js";
import { parseAssemblyDsl as applicationParseAssemblyDsl } from "../src/dsl/assembly.js";
import { parseLiveBindingDsl as applicationParseLiveBindingDsl } from "../src/dsl/live-binding.js";
import { parseAssemblyDsl as packageParseAssemblyDsl } from "../js/assembly-dsl/src/index.js";
import type { AssemblyDocument as PackageAssemblyDocument } from "../js/assembly-dsl/src/index.js";
import { contentUri as packageContentUri, parseLiveBindingDsl as packageParseLiveBindingDsl } from "../js/live-twin-state/src/index.js";
import type { LiveBindingDocument as PackageLiveBindingDocument, ObservationDocument } from "../js/live-twin-state/src/index.js";

test("application compatibility modules are exact package exports and contracts remain structurally compatible", () => {
  assert.equal(applicationParseAssemblyDsl, packageParseAssemblyDsl);
  assert.equal(applicationParseLiveBindingDsl, packageParseLiveBindingDsl);

  const packageAssembly = packageParseAssemblyDsl("ASSEMBLIES boundary\nASSEMBLY device\nROOT device_01\nKIND device\nPART shell COMPONENT shell_01 REQUIRED true\nEND_PART\nEND_ASSEMBLY\n");
  const applicationAssembly: ApplicationAssemblyDocument = packageAssembly;
  const packageAssemblyAgain: PackageAssemblyDocument = applicationAssembly;
  assert.equal(packageAssemblyAgain.schema, "subactor.assembly/v1");

  const packageBindings = packageParseLiveBindingDsl("LIVE_BINDINGS boundary\nBIND temperature\nSUBJECT urn:test:sensor\nMETRIC temperature\nTARGET device_01 thermal\nFRESH_FOR 1s\nEXPIRE_AFTER 2s\nON_STALE unknown\nEND\n");
  const applicationBindings: ApplicationLiveBindingDocument = packageBindings;
  const packageBindingsAgain: PackageLiveBindingDocument = applicationBindings;
  assert.equal(packageBindingsAgain.schema, "subactor.live-binding/v1");
});

test("package and application canonical hashing mint the same observation URI", () => {
  const observations: ObservationDocument = {
    schema: "subactor.observation/v1",
    id: "boundary",
    sourceSnapshotHash: "a".repeat(64),
    observations: [],
  };
  assert.equal(packageContentUri("observation", observations), applicationContentUri("observation", observations));
});
