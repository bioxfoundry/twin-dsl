import type { AssemblyDocument, AssemblyPartSpec, AssemblySpec } from "./types.js";
import { lines, unquote } from "./syntax.js";

function bool(raw: string): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`ASSEMBLY_BOOL_INVALID:${raw}`);
}

export function parseAssemblyDsl(source: string): AssemblyDocument {
  const input = lines(source);
  const header = input.shift()?.match(/^ASSEMBLIES\s+(\S+)$/);
  if (!header) throw new Error("ASSEMBLIES_HEADER_REQUIRED");
  const assemblies: AssemblySpec[] = [];
  let assembly: Partial<AssemblySpec> | undefined;
  let part: Partial<AssemblyPartSpec> | undefined;
  for (const line of input) {
    if (line.startsWith("ASSEMBLY ")) {
      if (assembly || part) throw new Error("ASSEMBLY_END_REQUIRED");
      assembly = { id: line.slice(9).trim(), parts: [] };
      continue;
    }
    if (line.startsWith("PART ")) {
      if (!assembly || part) throw new Error("ASSEMBLY_PART_CONTEXT_INVALID");
      const match = line.match(/^PART\s+(\S+)\s+COMPONENT\s+(\S+)\s+REQUIRED\s+(true|false)$/);
      if (!match) throw new Error(`ASSEMBLY_PART_HEADER_INVALID:${line}`);
      part = { id: match[1], componentId: match[2], required: bool(match[3]) };
      continue;
    }
    if (line === "END_PART") {
      if (!assembly || !part) throw new Error("ASSEMBLY_PART_NOT_STARTED");
      assembly.parts!.push(part as AssemblyPartSpec);
      part = undefined;
      continue;
    }
    if (line === "END_ASSEMBLY") {
      if (!assembly || part) throw new Error("ASSEMBLY_END_INVALID");
      assemblies.push(assembly as AssemblySpec);
      assembly = undefined;
      continue;
    }
    if (!assembly) throw new Error(`ASSEMBLY_LINE_OUTSIDE:${line}`);
    const index = line.indexOf(" ");
    if (index < 0) throw new Error(`ASSEMBLY_KEY_VALUE_REQUIRED:${line}`);
    const key = line.slice(0, index).toUpperCase();
    const raw = line.slice(index + 1).trim();
    if (part) {
      if (key === "ASSET") part.assetUri = unquote(raw);
      else if (key === "SCENE_PATH") part.scenePath = unquote(raw);
      else throw new Error(`ASSEMBLY_PART_UNKNOWN_KEY:${key}`);
    } else if (key === "ROOT") assembly.rootComponentId = unquote(raw);
    else if (key === "KIND") assembly.kind = raw as AssemblySpec["kind"];
    else throw new Error(`ASSEMBLY_UNKNOWN_KEY:${key}`);
  }
  if (assembly || part) throw new Error("ASSEMBLY_END_REQUIRED");
  return validateAssembly({ schema: "subactor.assembly/v1", id: header[1], assemblies });
}

export function renderAssemblyDsl(document: AssemblyDocument): string {
  validateAssembly(document);
  const output = [`ASSEMBLIES ${document.id}`];
  for (const assembly of document.assemblies) {
    output.push(`ASSEMBLY ${assembly.id}`, `ROOT ${assembly.rootComponentId}`, `KIND ${assembly.kind}`);
    for (const part of assembly.parts) {
      output.push(`PART ${part.id} COMPONENT ${part.componentId} REQUIRED ${part.required}`);
      if (part.assetUri) output.push(`ASSET ${part.assetUri}`);
      if (part.scenePath) output.push(`SCENE_PATH ${JSON.stringify(part.scenePath)}`);
      output.push("END_PART");
    }
    output.push("END_ASSEMBLY");
  }
  return `${output.join("\n")}\n`;
}

export function validateAssembly(value: unknown): AssemblyDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ASSEMBLY_DOCUMENT_REQUIRED");
  const document = value as Record<string, unknown>;
  if (Object.keys(document).some((key) => !["schema", "id", "assemblies"].includes(key))) throw new Error("ASSEMBLY_DOCUMENT_UNKNOWN_KEY");
  if (document.schema !== "subactor.assembly/v1" || typeof document.id !== "string" || !document.id || !Array.isArray(document.assemblies) || document.assemblies.length === 0) throw new Error("ASSEMBLY_DOCUMENT_INVALID");
  const assemblyIds = new Set<string>();
  for (const raw of document.assemblies) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("ASSEMBLY_INVALID");
    const assembly = raw as AssemblySpec;
    if (Object.keys(raw).some((key) => !["id", "rootComponentId", "kind", "parts"].includes(key))) throw new Error(`ASSEMBLY_UNKNOWN_KEY:${assembly.id ?? "unknown"}`);
    if (!assembly.id || assemblyIds.has(assembly.id) || !assembly.rootComponentId || !["device", "assembly", "module"].includes(assembly.kind) || !Array.isArray(assembly.parts) || assembly.parts.length === 0) throw new Error(`ASSEMBLY_INVALID:${assembly.id ?? "unknown"}`);
    const partIds = new Set<string>();
    const componentIds = new Set<string>();
    for (const rawPart of assembly.parts) {
      if (!rawPart || typeof rawPart !== "object" || Array.isArray(rawPart)) throw new Error(`ASSEMBLY_PART_INVALID:${assembly.id}`);
      const part = rawPart as AssemblyPartSpec;
      if (Object.keys(rawPart).some((key) => !["id", "componentId", "required", "assetUri", "scenePath"].includes(key)) || !part.id || partIds.has(part.id) || !part.componentId || componentIds.has(part.componentId) || typeof part.required !== "boolean" || (part.assetUri !== undefined && !part.assetUri) || (part.scenePath !== undefined && !part.scenePath.startsWith("/"))) throw new Error(`ASSEMBLY_PART_INVALID:${assembly.id}:${part.id ?? "unknown"}`);
      partIds.add(part.id);
      componentIds.add(part.componentId);
    }
    assemblyIds.add(assembly.id);
  }
  return value as AssemblyDocument;
}
