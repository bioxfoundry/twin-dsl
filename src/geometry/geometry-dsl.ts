import type { GeometryBuildContract, GeometryBuildReceipt } from "../core/types.js";

export function renderGeometryDsl(contract: GeometryBuildContract): string {
  const lines = [
    `GEOMETRY ${contract.id}`,
    `SOURCE ${contract.source.uri}`,
    `SOURCE_PATH ${JSON.stringify(contract.source.path)}`,
    `SOURCE_FORMAT ${contract.source.format}`,
    `SOURCE_REVISION sha256:${contract.source.sha256}`,
    `ENGINE ${contract.engine.type}${contract.engine.version ? ` VERSION ${JSON.stringify(contract.engine.version)}` : ""}`,
    `TARGET_COMPONENT ${contract.target.componentId}`,
    `TARGET_SCENE_PATH ${contract.target.scenePath}`,
    `TARGET_KIND ${contract.target.kind}`,
    `UNIT ${contract.coordinateSystem.unit}`,
    `UP_AXIS ${contract.coordinateSystem.upAxis}`,
    `HANDEDNESS ${contract.coordinateSystem.handedness}`,
  ];
  for (const dependency of [...contract.dependencies].sort((a, b) => a.path.localeCompare(b.path))) {
    lines.push(`DEPENDENCY ${JSON.stringify(dependency.path)} MOUNT ${JSON.stringify(dependency.mountPath)} URI ${dependency.uri} SHA256 ${dependency.sha256}`);
  }
  lines.push(`PARAMETER_SET ${contract.parameters.presetId}`);
  for (const [name, value] of Object.entries(contract.parameters.values).sort(([a], [b]) => a.localeCompare(b))) lines.push(`PARAMETER ${name} = ${JSON.stringify(value)}`);
  lines.push(
    `COMPILER hardWarnings=${contract.compilerOptions.hardWarnings} timeoutSeconds=${contract.compilerOptions.timeoutSeconds} maxTriangles=${contract.compilerOptions.maxTriangles}`,
    `OUTPUT canonical=${contract.outputs.canonical} web=${contract.outputs.web} scene=${contract.outputs.scene}`,
    `VALIDATE nonEmpty=true finiteBbox=true dependencyClosure=true glbLoad=true usdStageOpen=${contract.validations.usdStageOpen} bboxToleranceM=${contract.validations.bboxToleranceM}`,
  );
  if (contract.validations.reference) {
    const reference = contract.validations.reference;
    lines.push(`REFERENCE ${JSON.stringify(reference.path)} SOURCE ${reference.sourceUri} ARTIFACT ${reference.artifactUri} SHA256 ${reference.sha256} UNIT ${reference.unit} COMPARE ${reference.comparison}`);
  }
  lines.push("END_GEOMETRY");
  return "```geometrydsl\n" + lines.join("\n") + "\n```\n";
}

export function renderGeometryReceiptDsl(receipt: GeometryBuildReceipt): string {
  const lines = [
    `GEOMETRY_BUILD_RECEIPT ${receipt.id}`,
    `PROCESS ${receipt.processUri}`,
    `STATUS ${receipt.status.toUpperCase()}`,
    `CACHE ${receipt.cacheHit ? "HIT" : "MISS"}`,
    `BUILD_HASH ${receipt.geometryBuildHash}`,
    `PARAMETER_SET_HASH ${receipt.parameterSetHash}`,
    `VALIDATION_POLICY_HASH ${receipt.validationPolicyHash}`,
    `ENGINE ${receipt.engine.name} VERSION ${JSON.stringify(receipt.engine.version)}`,
    `DEPENDENCY_CLOSURE ${receipt.validation.dependencyClosure ? "PASS" : "FAIL"}`,
    `TRIANGLES ${receipt.validation.triangleCount}`,
    `RESULT ${receipt.validation.ok ? "PASS" : "FAIL"}`,
  ];
  if (receipt.geometryArtifactHash) lines.push(`GEOMETRY_ARTIFACT_HASH ${receipt.geometryArtifactHash}`);
  if (receipt.validation.bboxM) lines.push(`BBOX_M ${JSON.stringify(receipt.validation.bboxM)}`);
  if (receipt.validation.referenceMatch !== undefined) lines.push(`REFERENCE_GEOMETRY ${receipt.validation.referenceMatch ? "PASS" : "FAIL"} EXTENT_DELTA_M ${receipt.validation.referenceExtentDeltaM ?? -1}`);
  for (const failure of receipt.validation.failures) lines.push(`ERROR ${failure}`);
  if (receipt.error) lines.push(`ERROR_URN ${receipt.error.code}`, `ERROR_MESSAGE ${JSON.stringify(receipt.error.message)}`);
  if (receipt.repairProcess) lines.push(`REPAIR_PROCESS ${receipt.repairProcess}`);
  lines.push("END_GEOMETRY_BUILD_RECEIPT");
  return "```geometryreceiptdsl\n" + lines.join("\n") + "\n```\n";
}
