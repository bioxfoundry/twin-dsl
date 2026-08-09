import { stat } from "node:fs/promises";
import { basename } from "node:path";
import type { AssemblyDocument, GeometryBuildReceipt, PhysicalEvidenceDocument, ResourceRecord } from "../core/types.js";

type Vec3 = [number, number, number];

function worldHalfExtent(size:Vec3,orientation:[number,number,number,number]):Vec3 {
  const [x,y,z,w]=orientation;
  const rotation=[
    [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
    [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
    [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)],
  ];
  const half=size.map(value=>value/2) as Vec3;
  return rotation.map(row=>row.reduce((sum,value,index)=>sum+Math.abs(value)*half[index],0)) as Vec3;
}

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

/** Derive a root assembly world AABB only when every part shares one evidenced CAD frame. */
export function assemblyAggregateEvidence(document:AssemblyDocument,evidence:PhysicalEvidenceDocument):PhysicalEvidenceDocument|undefined {
  const byComponent=new Map(evidence.records.map(record=>[record.componentId,record]));
  const records:PhysicalEvidenceDocument["records"]=[];
  for(const assembly of document.assemblies) {
    const parts=assembly.parts.map(part=>byComponent.get(part.componentId));
    if(parts.some(part=>!part?.position||!part.size||!part.orientation)) continue;
    const placementMethods=[...new Set(parts.map(part=>String(part!.properties?.placementMethod??"")))];
    if(placementMethods.length!==1||!placementMethods[0]) continue;
    const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
    for(const part of parts) {
      const half=worldHalfExtent(part!.size!,part!.orientation!);
      for(let axis=0;axis<3;axis++) {
        min[axis]=Math.min(min[axis],part!.position![axis]-half[axis]);
        max[axis]=Math.max(max[axis],part!.position![axis]+half[axis]);
      }
    }
    records.push({
      componentId:assembly.rootComponentId,kind:"equipment",evidence:"cad",
      position:max.map((value,axis)=>(value+min[axis])/2) as Vec3,
      size:max.map((value,axis)=>value-min[axis]) as Vec3,
      orientation:[0,0,0,1],sourceRef:`assembly:${assembly.id}`,
      properties:{derivation:"world-aabb-union",derivedFromPartCount:parts.length,placementMethod:placementMethods[0]},
    });
  }
  if(!records.length) return undefined;
  return {schema:"subactor.physical-evidence/v1",id:`assembly-aggregate-${document.id}`,coordinateSystem:{...evidence.coordinateSystem},records};
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
