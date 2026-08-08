import { stat } from "node:fs/promises";
import { basename } from "node:path";
import type { GeometryBuildReceipt, PhysicalEvidenceDocument, ResourceRecord } from "../core/types.js";

function extent(receipt: GeometryBuildReceipt): [number, number, number] | undefined {
  const bbox = receipt.validation.bboxM;
  if (!bbox) return undefined;
  return bbox.max.map((value, axis) => value - bbox.min[axis]) as [number, number, number];
}

export async function geometryReceiptResource(receipt: GeometryBuildReceipt, projectId: string): Promise<ResourceRecord | undefined> {
  const artifact = receipt.artifacts.glb;
  if (receipt.status !== "succeeded" || !artifact) return undefined;
  const info = await stat(artifact.path);
  return {
    schema: "subactor.resource/v1",
    id: `geometry-${receipt.geometryBuildHash.slice(0, 16)}-glb`,
    uri: `urn:subactor:resource:sha256:${artifact.sha256}`,
    logicalUri: `subactor://project/${projectId}/derived/geometry/${receipt.geometryBuildHash}/${basename(artifact.path)}`,
    mediaType: artifact.mediaType,
    sha256: artifact.sha256,
    size: artifact.bytes,
    sourcePath: artifact.path,
    sourceRole: "derived",
    labels: ["geometry", "cad", "openscad", receipt.target.componentId],
    derived: true,
    derivedFrom: [receipt.source.uri, ...receipt.dependencies.expected.map((dependency) => dependency.uri)],
    createdAt: info.mtime.toISOString(),
  };
}

export function geometryReceiptEvidence(receipt: GeometryBuildReceipt): PhysicalEvidenceDocument | undefined {
  const web = receipt.artifacts.glb;
  if (receipt.status !== "succeeded" || !receipt.validation.ok || !web) return undefined;
  const canonical = receipt.artifacts["3mf"];
  const usd = receipt.artifacts.usdc ?? receipt.artifacts.usda;
  return {
    schema: "subactor.physical-evidence/v1",
    id: `geometry-build-${receipt.geometryBuildHash.slice(0, 16)}`,
    coordinateSystem: { unit: "m", upAxis: "Z", origin: "geometry-local-origin" },
    records: [{
      componentId: receipt.target.componentId,
      kind: receipt.target.kind,
      evidence: "cad",
      size: extent(receipt),
      assetUri: `urn:subactor:resource:sha256:${web.sha256}`,
      sourceRef: receipt.source.uri,
      properties: {
        geometryBuildHash: receipt.geometryBuildHash,
        geometryArtifactHash: receipt.geometryArtifactHash,
        geometryCanonicalAssetUri: canonical?.uri,
        geometryUsdAssetUri: usd?.uri,
        geometryUsdAssetPath: usd?.path,
        geometrySourceFormat: receipt.source.format,
        geometryCompiler: `${receipt.engine.name} ${receipt.engine.version}`,
        geometryDependencySetHash: receipt.dependencies.dependencySetHash,
        geometryBboxM: receipt.validation.bboxM,
        geometryTriangleCount: receipt.validation.triangleCount,
        geometryVerificationStatus: "compiled",
      },
    }],
  };
}

/** Merge generated CAD with manual placement/survey facts without lowering evidence strength. */
export function mergeGeometryEvidence(base: PhysicalEvidenceDocument | undefined, generated: PhysicalEvidenceDocument[]): PhysicalEvidenceDocument | undefined {
  if (!base && generated.length === 0) return undefined;
  const records = new Map((base?.records ?? []).map((record) => [record.componentId, record]));
  const rank = new Map(["placeholder", "document", "measured", "cad", "ifc", "verified"].map((kind, index) => [kind, index]));
  for (const document of generated) {
    for (const candidate of document.records) {
      const current = records.get(candidate.componentId);
      if (!current) { records.set(candidate.componentId, candidate); continue; }
      if ((rank.get(current.evidence) ?? 0) > (rank.get(candidate.evidence) ?? 0)) continue;
      records.set(candidate.componentId, {
        ...candidate,
        position: current.position ?? candidate.position,
        orientation: current.orientation ?? candidate.orientation,
        positionToleranceM: current.positionToleranceM,
        sizeToleranceM: current.sizeToleranceM,
        angleToleranceDeg: current.angleToleranceDeg,
        sourceRef: candidate.sourceRef,
        properties: { ...(current.properties ?? {}), ...(candidate.properties ?? {}) },
      });
    }
  }
  return {
    schema: "subactor.physical-evidence/v1",
    id: base?.id ?? `compiled-geometry-${generated.map((item) => item.id).join("-")}`,
    coordinateSystem: { unit: "m", upAxis: "Z", origin: base?.coordinateSystem.origin ?? "geometry-local-origin" },
    records: [...records.values()],
    constraints: base?.constraints,
  };
}
