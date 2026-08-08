import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, relative, resolve, join } from "node:path";
import { canonicalJson, sha256 } from "../core/canonical.js";
import { openRouterConfigFromEnv } from "../llm/openrouter.js";

export type DiagnosticSeverity = "info" | "warning" | "error" | "critical";
export interface DigitalTwinDiagnostic {
  uri: string;
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  evidence: string[];
  repairProcesses: string[];
}
export interface DigitalTwinDiagnosticsReport {
  schema: "subactor.digital-twin-diagnostics/v1";
  id: string;
  generatedAt: string;
  status: "pass" | "warning" | "error";
  inputs: { sourceRoot?: string; markdownRoot?: string; dslRoot?: string; runtimeRoot?: string };
  summary: { filesScanned: number; diagnostics: number; errors: number; warnings: number; info: number; repairProcesses: number };
  diagnostics: DigitalTwinDiagnostic[];
  repairProcesses: Array<{ uri: string; diagnosticCodes: string[]; mode: "deterministic" | "openrouter" | "manual" }>;
}

const CAD = new Set([".stl", ".step", ".stp", ".f3d", ".scad"]);
async function files(root:string|undefined):Promise<string[]> {
  if(!root) return [];
  try { if(!(await stat(root)).isDirectory()) return [root]; } catch { return []; }
  const out:string[]=[];
  async function walk(dir:string):Promise<void> {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      const path=join(dir,entry.name);
      if(entry.name.startsWith(".") && entry.name!==".living-runtime") continue;
      if(entry.isDirectory()) await walk(path); else out.push(path);
    }
  }
  await walk(root); return out;
}
async function json(path:string|undefined):Promise<any|null> { if(!path) return null; try { return JSON.parse(await readFile(path,"utf8")); } catch { return null; } }
function diagnostic(code:string,severity:DiagnosticSeverity,message:string,evidence:string[],repairProcesses:string[]):DigitalTwinDiagnostic {
  const payload={code,severity,message,evidence:[...new Set(evidence)],repairProcesses:[...new Set(repairProcesses)]};
  return { ...payload, uri:`urn:subactor:diagnostic:${code.toLowerCase()}:sha256:${sha256(canonicalJson(payload))}` };
}
function repairUri(name:string):string { return `subactor://process/repair/digital-twin/${name}`; }

/** Deterministic cross-boundary audit: source CAD, Markdown/DSL, runtime artefacts and scene usage. */
export async function diagnoseDigitalTwin(input:{sourceRoot?:string;markdownRoot?:string;dslRoot?:string;runtimeRoot?:string;dashboardSource?:string}):Promise<DigitalTwinDiagnosticsReport> {
  const sourceFiles=await files(input.sourceRoot), mdFiles=await files(input.markdownRoot), dslFiles=await files(input.dslRoot), runtimeFiles=await files(input.runtimeRoot);
  const diagnostics:DigitalTwinDiagnostic[]=[];
  const add=(...args:Parameters<typeof diagnostic>)=>diagnostics.push(diagnostic(...args));
  const cad=sourceFiles.filter(path=>CAD.has(extname(path).toLowerCase()));
  const byName=new Set(mdFiles.map(path=>path.split("/").pop()??""));
  const sourceCounts=new Map<string,number>();
  for(const path of cad) sourceCounts.set(extname(path).toLowerCase(),(sourceCounts.get(extname(path).toLowerCase())??0)+1);
  for(const path of cad) {
    const name=(path.split("/").pop()??"")+".md";
    if(!byName.has(name)) add("CAD_MARKDOWN_MISSING","error",`No Markdown conversion found for ${path}`,[path],[repairUri("convert-cad-to-markdown")]);
  }
  const converted=new Map<string,number>();
  for(const path of mdFiles) for(const ext of CAD) if(path.endsWith(`${ext}.md`)) converted.set(ext,(converted.get(ext)??0)+1);
  for(const [ext,count] of sourceCounts) if((converted.get(ext)??0)<count) add("CAD_CONVERSION_INCOMPLETE","error",`${count-(converted.get(ext)??0)} ${ext} file(s) lack Markdown conversion`,[input.sourceRoot??ext],[repairUri("convert-cad-to-markdown"),repairUri("retry-docling")]);
  const scene=await json(input.runtimeRoot?join(input.runtimeRoot,"current/scene.json"):undefined);
  const twin=await json(input.runtimeRoot?join(input.runtimeRoot,"current/twin.json"):undefined);
  const evidence=await json(input.runtimeRoot?join(input.runtimeRoot,"current/physical-evidence.report.json"):undefined);
  if(!scene) add("RUNTIME_SCENE_MISSING","critical","Current scene.json is missing or invalid",[input.runtimeRoot??""],[repairUri("regenerate-scene")]);
  if(!twin) add("RUNTIME_TWIN_MISSING","critical","Current twin.json is missing or invalid",[input.runtimeRoot??""],[repairUri("regenerate-twin")]);
  const bindings=Array.isArray(scene?.bindings)?scene.bindings:[];
  const assetBindings=bindings.filter((b:any)=>typeof b?.assetUri==="string");
  if(bindings.length && assetBindings.length===0) add("SCENE_NO_CAD_BINDINGS","warning","Scene has bindings but no CAD asset URI",[join(input.runtimeRoot??"","current/scene.json")],[repairUri("bind-grounded-assets")]);
  const sourceText=input.dashboardSource?await readFile(input.dashboardSource,"utf8").catch(()=>""):"";
  if(assetBindings.length && sourceText.includes("loadStl") && !sourceText.includes("loadStep") && !sourceText.includes("GLTFLoader") && !sourceText.includes("loadGlb")) add("SCENE_FORMAT_RENDERER_GAP","error","Dashboard renderer supports STL but not tessellated glTF/GLB assets",[input.dashboardSource??""],[repairUri("tessellate-cad-to-gltf"),repairUri("bind-grounded-assets")]);
  const placeholders=bindings.filter((b:any)=>!b?.assetUri && ["cube","cylinder","sphere","scope"].includes(String(b?.primitive))).length;
  if(placeholders>0) add("SCENE_PLACEHOLDER_GEOMETRY","warning",`${placeholders} scene binding(s) use conceptual primitive geometry`,[join(input.runtimeRoot??"","current/scene.json")],[repairUri("bind-grounded-assets"),repairUri("tessellate-cad-to-gltf")]);
  if(Array.isArray(evidence?.rejected) && evidence.rejected.length) add("PHYSICAL_EVIDENCE_REJECTED","error",`${evidence.rejected.length} physical-evidence record(s) were rejected`,[join(input.runtimeRoot??"","current/physical-evidence.report.json")],[repairUri("repair-physical-evidence")]);
  const audit=await json(input.runtimeRoot?join(input.runtimeRoot,"current/generation-audit.json"):undefined);
  if(audit?.warnings?.length) add("GENERATION_WARNINGS","warning",`${audit.warnings.length} generation warning(s) recorded`,[join(input.runtimeRoot??"","current/generation-audit.json")],[repairUri("rerun-generation")]);
  const cfg=openRouterConfigFromEnv();
  if(!cfg.apiKey) add("OPENROUTER_NOT_CONFIGURED","warning","OpenRouter API key is not available in environment or local .env",["OPENROUTER_API_KEY"],[repairUri("configure-openrouter")]);
  if(!dslFiles.length) add("DSL_INPUT_MISSING","error","No intent DSL files were found",[input.dslRoot??""],[repairUri("generate-intent-dsl")]);
  const codeGroups=new Map<string,string[]>(); for(const item of diagnostics) for(const process of item.repairProcesses) codeGroups.set(process,[...(codeGroups.get(process)??[]),item.code]);
  const repairProcesses=[...codeGroups].map(([uri,codes])=>({uri,diagnosticCodes:[...new Set(codes)],mode:uri.includes("openrouter")?"openrouter" as const:uri.includes("manual")?"manual" as const:"deterministic" as const}));
  const errors=diagnostics.filter(x=>x.severity==="error"||x.severity==="critical").length, warnings=diagnostics.filter(x=>x.severity==="warning").length, info=diagnostics.filter(x=>x.severity==="info").length;
  return {schema:"subactor.digital-twin-diagnostics/v1",id:`digital-twin-diagnostics-${sha256(canonicalJson({input,diagnostics})).slice(0,16)}`,generatedAt:new Date().toISOString(),status:errors?"error":warnings?"warning":"pass",inputs:input,summary:{filesScanned:sourceFiles.length+mdFiles.length+dslFiles.length+runtimeFiles.length,diagnostics:diagnostics.length,errors,warnings,info,repairProcesses:repairProcesses.length},diagnostics,repairProcesses};
}
export async function writeDiagnostics(path:string,report:DigitalTwinDiagnosticsReport):Promise<void>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2));}
