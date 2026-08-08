import type { GeometryBuildContract } from "../core/types.js";
import { canonicalJson, sha256 } from "../core/canonical.js";

export interface GeometryEngineIdentity {
  name: "openscad";
  version: string;
  imageDigest?: string;
}

/** Host paths are deliberately absent: build identity follows content, not checkout location. */
export function geometryBuildIdentity(contract: GeometryBuildContract, engine: GeometryEngineIdentity): Record<string, unknown> {
  return {
    profile: "subactor.geometry-build/openscad-v1",
    source: { uri: contract.source.uri, sha256: contract.source.sha256, format: contract.source.format },
    dependencies: contract.dependencies
      .map(({ path, mountPath, uri, sha256 }) => ({ path, mountPath, uri, sha256 }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    parameters: contract.parameters,
    engine: { name: engine.name, version: engine.version, imageDigest: engine.imageDigest ?? null },
    compilerOptions: contract.compilerOptions,
    coordinateSystem: contract.coordinateSystem,
    outputs: contract.outputs,
  };
}

export function parameterSetHash(contract: GeometryBuildContract): string {
  return sha256(canonicalJson(contract.parameters));
}

export function validationPolicyHash(contract: GeometryBuildContract): string {
  return sha256(canonicalJson(contract.validations));
}

export function geometryBuildHash(contract: GeometryBuildContract, engine: GeometryEngineIdentity): string {
  return sha256(canonicalJson(geometryBuildIdentity(contract, engine)));
}
