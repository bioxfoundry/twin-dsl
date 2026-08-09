import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { canonicalJson, contentUri, sha256 } from "../core/canonical.js";
import type { SceneDocument, TwinDocument } from "../core/types.js";

export type PresentationEvidenceStatus = "current" | "stale" | "unverified" | "missing" | "invalid";

export interface PresentationCamera {
    mode:"static"|"orbit";
    eye:[number,number,number];
    target:[number,number,number];
    up:[number,number,number];
    verticalFovDeg:number;
    trajectorySha256:string|null;
}

export interface PresentationCapture {
  path:string;
  sha256:string;
  bytes:number;
  mediaType:"image/png"|"video/webm";
  camera:PresentationCamera|null;
}

export interface PresentationEvidenceManifest {
  schema:"subactor.presentation-evidence/v1";
  twinUri:string;
  sceneUri:string;
  capturedAt:string;
  renderer:{name:string;version:string};
  captures:Array<PresentationCapture&{camera:PresentationCamera}>;
}

export interface PresentationEvidenceSummary {
  schema:"subactor.presentation-evidence-status/v1";
  status:PresentationEvidenceStatus;
  expectedTwinUri:string;
  expectedSceneUri:string;
  manifestPath:"presentation/manifest.json";
  captures:PresentationCapture[];
  problems:string[];
  fingerprint:string;
}

const HASH=/^[a-f0-9]{64}$/;
const TWIN_URI=/^urn:subactor:twin:sha256:[a-f0-9]{64}$/;
const SCENE_URI=/^urn:subactor:scene:sha256:[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const vec3=(value:unknown):value is [number,number,number]=>Array.isArray(value)&&value.length===3&&value.every(item=>typeof item==="number"&&Number.isFinite(item));
const exact=(value:Record<string,unknown>,keys:string[],code:string):void=>{
  if(Object.keys(value).some(key=>!keys.includes(key))) throw new Error(`${code}_UNKNOWN_KEY`);
};
const record=(value:unknown,code:string):Record<string,unknown>=>{
  if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error(code);
  return value as Record<string,unknown>;
};
const safeRelativePath=(path:string):boolean=>{
  if(!path||path.startsWith("/")||path.includes("\\")) return false;
  const normalized=relative(".",resolve(".",path));
  return normalized===path&&!normalized.startsWith("..")&&!normalized.split("/").includes("..");
};

export function validatePresentationEvidence(value:unknown):PresentationEvidenceManifest {
  const document=record(value,"PRESENTATION_EVIDENCE_INVALID");
  exact(document,["schema","twinUri","sceneUri","capturedAt","renderer","captures"],"PRESENTATION_EVIDENCE");
  if(document.schema!=="subactor.presentation-evidence/v1"||typeof document.twinUri!=="string"||!TWIN_URI.test(document.twinUri)||typeof document.sceneUri!=="string"||!SCENE_URI.test(document.sceneUri)||typeof document.capturedAt!=="string"||!ISO.test(document.capturedAt)) throw new Error("PRESENTATION_EVIDENCE_HEADER_INVALID");
  const renderer=record(document.renderer,"PRESENTATION_RENDERER_INVALID");
  exact(renderer,["name","version"],"PRESENTATION_RENDERER");
  if(typeof renderer.name!=="string"||!renderer.name||typeof renderer.version!=="string"||!renderer.version) throw new Error("PRESENTATION_RENDERER_INVALID");
  if(!Array.isArray(document.captures)||document.captures.length===0) throw new Error("PRESENTATION_CAPTURES_REQUIRED");
  const paths=new Set<string>();
  const captures=document.captures.map((value,index)=>{
    const capture=record(value,`PRESENTATION_CAPTURE_INVALID:${index}`);
    exact(capture,["path","sha256","bytes","mediaType","camera"],"PRESENTATION_CAPTURE");
    if(typeof capture.path!=="string"||!safeRelativePath(capture.path)||typeof capture.sha256!=="string"||!HASH.test(capture.sha256)||!Number.isInteger(capture.bytes)||(capture.bytes as number)<=0||!["image/png","video/webm"].includes(String(capture.mediaType))) throw new Error(`PRESENTATION_CAPTURE_INVALID:${index}`);
    const camera=record(capture.camera,`PRESENTATION_CAMERA_INVALID:${index}`);
    exact(camera,["mode","eye","target","up","verticalFovDeg","trajectorySha256"],"PRESENTATION_CAMERA");
    if(!["static","orbit"].includes(String(camera.mode))||!vec3(camera.eye)||!vec3(camera.target)||!vec3(camera.up)||Math.hypot(...camera.up)===0||typeof camera.verticalFovDeg!=="number"||!Number.isFinite(camera.verticalFovDeg)||camera.verticalFovDeg<=0||camera.verticalFovDeg>=180||(camera.trajectorySha256!==null&&(typeof camera.trajectorySha256!=="string"||!HASH.test(camera.trajectorySha256)))||(camera.mode==="static"&&camera.trajectorySha256!==null)||(camera.mode==="orbit"&&camera.trajectorySha256===null)) throw new Error(`PRESENTATION_CAMERA_INVALID:${index}`);
    if(paths.has(capture.path)) throw new Error(`PRESENTATION_CAPTURE_DUPLICATE:${capture.path}`);
    paths.add(capture.path);
    return {path:capture.path,sha256:capture.sha256,bytes:capture.bytes,mediaType:capture.mediaType,camera:{mode:camera.mode,eye:camera.eye,target:camera.target,up:camera.up,verticalFovDeg:camera.verticalFovDeg,trajectorySha256:camera.trajectorySha256}} as PresentationCapture&{camera:PresentationCamera};
  });
  return {schema:"subactor.presentation-evidence/v1",twinUri:document.twinUri,sceneUri:document.sceneUri,capturedAt:document.capturedAt,renderer:{name:renderer.name,version:renderer.version},captures};
}

async function capturesIn(directory:string):Promise<PresentationCapture[]> {
  let names:string[];
  try { names=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile()&&/\.(?:png|webm)$/i.test(entry.name)).map(entry=>entry.name).sort(); }
  catch { return []; }
  const captures:PresentationCapture[]=[];
  for(const path of names) {
    const bytes=await readFile(resolve(directory,path));
    captures.push({path,sha256:sha256(bytes),bytes:bytes.length,mediaType:path.toLowerCase().endsWith(".png")?"image/png":"video/webm",camera:null});
  }
  return captures;
}

export async function presentationDirectoryFingerprint(directory:string):Promise<string> {
  const captures=await capturesIn(directory);
  let manifest:unknown=null;
  try { manifest=JSON.parse(await readFile(resolve(directory,"manifest.json"),"utf8")); }
  catch { /* a missing or malformed manifest remains distinct through the raw marker below */ }
  let manifestBytes:string|undefined;
  try { manifestBytes=await readFile(resolve(directory,"manifest.json"),"utf8"); } catch { /* missing */ }
  return sha256({captures,manifest:manifestBytes===undefined?null:manifest??`INVALID:${sha256(manifestBytes)}`});
}

export async function inspectPresentationEvidence(directory:string,twin:TwinDocument,scene:SceneDocument):Promise<PresentationEvidenceSummary> {
  const expectedTwinUri=contentUri("twin",twin);
  const expectedSceneUri=contentUri("scene",scene);
  const actualCaptures=await capturesIn(directory);
  const base={schema:"subactor.presentation-evidence-status/v1" as const,expectedTwinUri,expectedSceneUri,manifestPath:"presentation/manifest.json" as const};
  const finish=(status:PresentationEvidenceStatus,captures:PresentationCapture[],problems:string[]):PresentationEvidenceSummary=>{
    const core={...base,status,captures,problems};
    return {...core,fingerprint:sha256(core)};
  };
  let raw:unknown;
  try { raw=JSON.parse(await readFile(resolve(directory,"manifest.json"),"utf8")); }
  catch(error) {
    if(actualCaptures.length===0) return finish("missing",[],["CAPTURES_MISSING","MANIFEST_MISSING"]);
    return finish("unverified",actualCaptures,[error instanceof SyntaxError?"MANIFEST_INVALID_JSON":"MANIFEST_MISSING"]);
  }
  let manifest:PresentationEvidenceManifest;
  try { manifest=validatePresentationEvidence(raw); }
  catch(error) { return finish("invalid",actualCaptures,[error instanceof Error?error.message:"MANIFEST_INVALID"]); }
  const problems:string[]=[];
  const actualByPath=new Map(actualCaptures.map(capture=>[capture.path,capture]));
  const declaredPaths=new Set(manifest.captures.map(capture=>capture.path));
  for(const declared of manifest.captures) {
    const actual=actualByPath.get(declared.path);
    if(!actual) problems.push(`CAPTURE_MISSING:${declared.path}`);
    else if(actual.sha256!==declared.sha256||actual.bytes!==declared.bytes||actual.mediaType!==declared.mediaType) problems.push(`CAPTURE_DIGEST_MISMATCH:${declared.path}`);
  }
  for(const actual of actualCaptures) if(!declaredPaths.has(actual.path)) problems.push(`CAPTURE_UNDECLARED:${actual.path}`);
  if(problems.length) return finish("invalid",actualCaptures,problems);
  if(manifest.twinUri!==expectedTwinUri) problems.push("TWIN_REVISION_STALE");
  if(manifest.sceneUri!==expectedSceneUri) problems.push("SCENE_REVISION_STALE");
  return finish(problems.length?"stale":"current",manifest.captures,problems);
}

export function renderPresentationEvidenceDsl(summary:PresentationEvidenceSummary):string {
  const quote=(value:string)=>JSON.stringify(value);
  const lines=["```presentationevidencedsl","PRESENTATION_EVIDENCE active",`STATUS ${summary.status.toUpperCase()}`,`TWIN ${summary.expectedTwinUri}`,`SCENE ${summary.expectedSceneUri}`,`MANIFEST ${quote(summary.manifestPath)}`];
  for(const capture of summary.captures) {
    lines.push(`CAPTURE ${quote(capture.path)} SHA256 ${capture.sha256} BYTES ${capture.bytes} MEDIA ${capture.mediaType}`);
    lines.push(capture.camera
      ? `  CAMERA MODE ${capture.camera.mode.toUpperCase()} EYE [${capture.camera.eye.join(", ")}] TARGET [${capture.camera.target.join(", ")}] UP [${capture.camera.up.join(", ")}] VERTICAL_FOV_DEG ${capture.camera.verticalFovDeg} TRAJECTORY ${capture.camera.trajectorySha256??"none"}`
      : "  CAMERA UNKNOWN");
  }
  for(const problem of summary.problems) lines.push(`PROBLEM ${quote(problem)}`);
  lines.push(`FINGERPRINT ${summary.fingerprint}`,"END_PRESENTATION_EVIDENCE","```");
  return lines.join("\n")+"\n";
}
