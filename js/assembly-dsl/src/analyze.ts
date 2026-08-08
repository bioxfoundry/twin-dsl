import type { AssemblyDocument, AssemblyFinding, AssemblyReport, SceneDocument, TwinComponent, TwinDocument } from "./types.js";
import { validateAssembly } from "./dsl.js";

function kebab(code: string): string {
  return code.toLowerCase().replace(/_/g, "-");
}

export function analyzeAssemblies(input: { projectId: string; document: AssemblyDocument; twin: TwinDocument; scene: SceneDocument; allowedAssetUris: string[] }): AssemblyReport {
  const document = validateAssembly(input.document);
  const components = new Map<string, { component: TwinComponent; parentId?: string }>();
  const visit = (component: TwinComponent, parentId?: string): void => {
    components.set(component.id, { component, parentId });
    component.children.forEach((child) => visit(child, component.id));
  };
  input.twin.components.forEach((component) => visit(component));
  const bindings = new Map(input.scene.bindings.filter((binding) => binding.componentId).map((binding) => [binding.componentId!, binding]));
  const allowedAssets = new Set(input.allowedAssetUris);
  const findings: AssemblyFinding[] = [];
  const addFinding = (code: string, severity: AssemblyFinding["severity"], assemblyId: string, componentId: string, message: string, repairProcess: string, partId?: string): void => {
    findings.push({ code, errorUri: `urn:subactor:error:assembly:${kebab(code)}`, severity, assemblyId, partId, componentId, message, repairProcess });
  };
  const assemblies = document.assemblies.map((assembly) => {
    const rootExists = components.has(assembly.rootComponentId);
    if (!rootExists) addFinding("ASSEMBLY_ROOT_MISSING", "error", assembly.id, assembly.rootComponentId, "Assembly root component is absent from Twin identity.", "subactor://process/repair/assembly/add-root-component");
    const parts = assembly.parts.map((part) => {
      const component = components.get(part.componentId);
      const binding = bindings.get(part.componentId);
      const componentExists = Boolean(component);
      const parentMatches = component?.parentId === assembly.rootComponentId;
      const actualAssetUri = binding?.assetUri;
      const assetUri = part.assetUri ?? actualAssetUri;
      const assetAvailable = Boolean(assetUri);
      const assetGrounded = Boolean(assetUri && allowedAssets.has(assetUri));
      const assetMatches = !part.assetUri || !actualAssetUri || part.assetUri === actualAssetUri;
      const placed = Boolean(binding && (!part.scenePath || binding.scenePath === part.scenePath));
      const findingCodes: string[] = [];
      const finding = (code: string, severity: AssemblyFinding["severity"], message: string, repairProcess: string): void => {
        findingCodes.push(code);
        addFinding(code, severity, assembly.id, part.componentId, message, repairProcess, part.id);
      };
      if (!componentExists) finding("ASSEMBLY_PART_COMPONENT_MISSING", "error", "Declared part has no stable Twin component identity.", "subactor://process/repair/assembly/add-part-component");
      else if (!parentMatches) finding("ASSEMBLY_PART_PARENT_DRIFT", "error", "Part component is not a child of the declared assembly root.", "subactor://process/repair/assembly/align-hierarchy");
      if (!assetAvailable) finding("ASSEMBLY_PART_ASSET_MISSING", "warning", "No deterministic mesh/CAD asset is available for this part.", "subactor://process/repair/geometry/materialize-part");
      else if (!assetGrounded) finding("ASSEMBLY_PART_ASSET_UNGROUNDED", "error", "Part asset URI is outside the ingested/content-addressed resource set.", "subactor://process/repair/assembly/import-asset");
      if (!assetMatches) finding("ASSEMBLY_PART_ASSET_DRIFT", "error", "Scene asset differs from the asset declared by AssemblyDSL.", "subactor://process/repair/assembly/align-asset-binding");
      if (!placed) finding(part.scenePath && binding ? "ASSEMBLY_PART_SCENE_PATH_DRIFT" : "ASSEMBLY_PART_UNPLACED", "warning", "Part has no validated scene placement at the declared path.", "subactor://process/repair/assembly/define-transform");
      const complete = componentExists && parentMatches && assetAvailable && assetGrounded && assetMatches && placed;
      return { ...part, componentExists, parentMatches, assetAvailable, assetGrounded, placed, actualAssetUri, actualScenePath: binding?.scenePath, complete, findingCodes };
    });
    return { ...assembly, rootExists, complete: rootExists && parts.filter((part) => part.required).every((part) => part.complete), parts };
  });
  const requiredParts = assemblies.flatMap((assembly) => assembly.parts).filter((part) => part.required);
  const allParts = assemblies.flatMap((assembly) => assembly.parts);
  return {
    schema: "subactor.assembly-report/v1",
    id: `${document.id}-report`,
    projectId: input.projectId,
    ok: !findings.some((finding) => finding.severity === "error"),
    complete: assemblies.every((assembly) => assembly.complete),
    coverage: {
      assemblies: assemblies.length,
      completeAssemblies: assemblies.filter((assembly) => assembly.complete).length,
      requiredParts: requiredParts.length,
      completeRequiredParts: requiredParts.filter((part) => part.complete).length,
      availableAssets: allParts.filter((part) => part.assetGrounded).length,
      placedParts: allParts.filter((part) => part.placed).length,
    },
    assemblies,
    findings,
  };
}

export function renderAssemblyReportDsl(report: AssemblyReport): string {
  const output = [`ASSEMBLY_REPORT ${report.id}`, `PROJECT ${report.projectId}`, `RESULT ${report.ok ? "PASS" : "FAIL"}`, `COMPLETENESS ${report.complete ? "COMPLETE" : "INCOMPLETE"}`, `COVERAGE assemblies=${report.coverage.completeAssemblies}/${report.coverage.assemblies} required_parts=${report.coverage.completeRequiredParts}/${report.coverage.requiredParts} assets=${report.coverage.availableAssets} placed=${report.coverage.placedParts}`];
  for (const assembly of report.assemblies) {
    output.push(`ASSEMBLY ${assembly.id} ROOT ${assembly.rootComponentId} COMPLETE ${assembly.complete}`);
    for (const part of assembly.parts) output.push(`PART ${part.id} COMPONENT ${part.componentId} REQUIRED ${part.required} COMPLETE ${part.complete} ASSET ${part.assetGrounded} PLACED ${part.placed}`);
  }
  for (const finding of report.findings) output.push(`FINDING ${finding.code} ${finding.severity} ${finding.errorUri} COMPONENT ${finding.componentId} REPAIR ${finding.repairProcess} MESSAGE ${JSON.stringify(finding.message)}`);
  return `${output.join("\n")}\n`;
}
