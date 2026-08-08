import { createHash } from "node:crypto";
import { extname, posix } from "node:path";
import type { AnalyzeArchiveInput, ArchiveCandidate, ArchiveEntryKind, ArchiveFinding, ArchiveProjectAnalysis } from "./types.js";

const TEXT_EXTENSIONS = new Set([
  ".md", ".rst", ".txt", ".adoc", ".tex", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".xml", ".csv",
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".cpp", ".c", ".h", ".ino",
  ".dsl", ".projectdsl", ".assemblydsl", ".geometrydsl", ".scenedsl", ".twindsl", ".livebindingdsl",
]);
const MATERIALIZABLE_GEOMETRY = new Map([
  [".obj", "obj"], [".stl", "stl"], [".step", "step"], [".stp", "step"], [".scad", "openscad"],
  [".3mf", "3mf"], [".glb", "glb"], [".gltf", "gltf"], [".mtl", "mtl"],
]);
const UNSUPPORTED_NATIVE_CAD = new Map([
  [".sldasm", "solidworks"], [".sldprt", "solidworks"], [".f3d", "fusion360"], [".fcstd", "freecad"],
  [".ipt", "inventor"], [".iam", "inventor"], [".dwg", "dwg"],
]);
const MANIFEST_NAMES = new Set([
  "package.json", "pyproject.toml", "requirements.txt", "cargo.toml", "go.mod", "pom.xml", "dockerfile",
  "docker-compose.yml", "docker-compose.yaml", "platformio.ini", "makefile", "cmakelists.txt",
]);

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "archive";
}

function urnCode(code: string): string {
  return `urn:subactor:error:archive:${slug(code)}`;
}

function repair(code: string): string {
  return `subactor://process/repair/archive/${slug(code)}`;
}

function kindFor(path: string): ArchiveEntryKind {
  const lower = path.toLowerCase();
  const base = posix.basename(lower);
  const ext = extname(lower);
  if (ext === ".mtl") return "material-library";
  if (ext === ".sldasm" || ext === ".iam" || /(^|[_-])(assembly|assemblage)([_-]|\.)/.test(base)) return "assembly-cad";
  if ([".sldprt", ".ipt"].includes(ext)) return "part-cad";
  if ([".stl", ".obj", ".glb", ".gltf", ".3mf"].includes(ext)) return "mesh";
  if ([".scad", ".fcstd", ".f3d"].includes(ext)) return "parametric-cad";
  if ([".step", ".stp", ".iges", ".igs", ".dwg", ".dxf"].includes(ext)) return "cad-exchange";
  if (/^(bom|bill.of.materials)(\.|_|-)/.test(base) || lower.includes("/bom.")) return "bill-of-materials";
  if (MANIFEST_NAMES.has(base) || /(^|\/)(manifest|config|configuration)(\.|\/)/.test(lower)) return "manifest";
  if ([".md", ".rst", ".txt", ".adoc", ".tex", ".pdf", ".docx", ".pptx"].includes(ext) || /^readme(?:\.|$)/.test(base)) return "documentation";
  if ([".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".cpp", ".c", ".h", ".ino"].includes(ext)) return "source-code";
  if ([".json", ".jsonl", ".yaml", ".yml", ".toml", ".xml", ".csv", ".xlsx", ".parquet", ".h5"].includes(ext)) return "data";
  if ([".png", ".jpg", ".jpeg", ".svg", ".webp", ".tif", ".tiff"].includes(ext)) return "image";
  return "other";
}

function score(path: string, kind: ArchiveEntryKind, size: number): number {
  const lower = path.toLowerCase();
  const base = posix.basename(lower);
  let value: number = ({
    "assembly-cad": 100, mesh: 76, "cad-exchange": 74, "part-cad": 62, "parametric-cad": 62,
    "bill-of-materials": 58, "material-library": 56, manifest: 48, documentation: 42, "source-code": 26, data: 20, image: 12, other: 0,
  })[kind];
  if (/assembly|complete|export|final|production/.test(lower)) value += 18;
  if (/readme|manual|datasheet|specification|config/.test(base)) value += 10;
  if (/test|example|sample|backup|old|archive|cache|node_modules|\.git\//.test(lower)) value -= 16;
  if (size === 0) value -= 25;
  if (size > 512 * 1024 * 1024) value -= 8;
  return Math.max(0, value);
}

function useFor(kind: ArchiveEntryKind): ArchiveCandidate["expectedUse"] {
  if (kind === "assembly-cad") return "assembly";
  if (["mesh", "part-cad", "parametric-cad", "cad-exchange"].includes(kind)) return "geometry";
  if (kind === "source-code" || kind === "manifest") return "behavior";
  if (kind === "material-library") return "material";
  if (kind === "documentation" || kind === "image") return "documentation";
  if (kind === "bill-of-materials") return "assembly";
  return "data";
}

function rootCandidates(paths: string[]): string[] {
  const markers = paths.filter((path) => {
    const base = posix.basename(path).toLowerCase();
    return MANIFEST_NAMES.has(base) || /^readme(?:\.|$)/.test(base) || base === "bom.xlsx" || base === "manifest.json";
  });
  const roots = markers.map((path) => posix.dirname(path)).map((path) => path === "." ? "" : path);
  return [...new Set(roots)].sort((a, b) => a.localeCompare(b));
}

export function analyzeArchiveProject(input: AnalyzeArchiveInput): ArchiveProjectAnalysis {
  const findings: ArchiveFinding[] = [];
  const candidates: ArchiveCandidate[] = [];
  for (const entry of input.entries) {
    if (!entry.safe) {
      findings.push({
        severity: "error", code: "ARCHIVE_UNSAFE_PATH", errorUri: urnCode("ARCHIVE_UNSAFE_PATH"),
        repairProcess: repair("remove-unsafe-entry"), entryPath: entry.path,
        message: `Archive entry is not safe to materialize: ${entry.path}`,
      });
      continue;
    }
    const kind = kindFor(entry.path);
    const ext = extname(entry.path).toLowerCase();
    const backend = MATERIALIZABLE_GEOMETRY.get(ext) ?? UNSUPPORTED_NATIVE_CAD.get(ext);
    const materializable = MATERIALIZABLE_GEOMETRY.has(ext);
    candidates.push({
      path: entry.path, kind, uncompressedSize: entry.uncompressedSize, score: score(entry.path, kind, entry.uncompressedSize),
      materializable, expectedUse: useFor(kind), backend,
      reason: kind === "assembly-cad" ? "Native assembly definition can recover hierarchy and part identity."
        : kind === "bill-of-materials" ? "Bill of materials can validate assembly completeness."
        : kind === "source-code" ? "Control software can contribute behavior, telemetry and integration intent."
        : ["mesh", "parametric-cad", "cad-exchange", "part-cad"].includes(kind) ? "Geometry candidate can improve real-mesh coverage."
        : kind === "documentation" ? "Documentation can contribute dimensions, materials, placement and visible-feature intent."
        : "Project evidence candidate.",
    });
    if (UNSUPPORTED_NATIVE_CAD.has(ext)) findings.push({
      severity: "warning", code: "ARCHIVE_CAD_BACKEND_MISSING", errorUri: urnCode("ARCHIVE_CAD_BACKEND_MISSING"),
      repairProcess: repair(`convert-${UNSUPPORTED_NATIVE_CAD.get(ext)}-to-step`), entryPath: entry.path,
      message: `${ext || "native CAD"} requires a deterministic export backend before it can become physical geometry evidence.`,
    });
  }
  const sorted = candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const textCandidates = sorted.filter((candidate) => TEXT_EXTENSIONS.has(extname(candidate.path).toLowerCase()));
  const geometryCandidates = sorted.filter((candidate) => candidate.materializable && ["geometry", "assembly", "material"].includes(candidate.expectedUse));
  const maxText = input.maxTextEntries ?? 64;
  const maxGeometry = input.maxGeometryEntries ?? 32;
  if (textCandidates.length > maxText) findings.push({
    severity: "info", code: "ARCHIVE_TEXT_SELECTION_LIMIT", errorUri: urnCode("ARCHIVE_TEXT_SELECTION_LIMIT"),
    repairProcess: repair("increase-text-budget-or-refine-ranking"),
    message: `Selected ${maxText} of ${textCandidates.length} readable text entries by evidence score.`,
  });
  if (geometryCandidates.length > maxGeometry) findings.push({
    severity: "info", code: "ARCHIVE_GEOMETRY_SELECTION_LIMIT", errorUri: urnCode("ARCHIVE_GEOMETRY_SELECTION_LIMIT"),
    repairProcess: repair("increase-geometry-budget-or-refine-ranking"),
    message: `Selected ${maxGeometry} of ${geometryCandidates.length} materializable geometry entries by evidence score.`,
  });
  const safeCandidates = candidates.filter((candidate) => candidate.path.length > 0);
  const archiveUri = `urn:subactor:resource:sha256:${input.archiveSha256}`;
  return {
    schema: "subactor.archive-project-analysis/v1",
    archive: { path: input.archivePath, uri: archiveUri, sha256: input.archiveSha256, size: input.archiveSize },
    coverage: {
      entries: input.entries.length,
      safeEntries: input.entries.filter((entry) => entry.safe).length,
      unsafeEntries: input.entries.filter((entry) => !entry.safe).length,
      totalUncompressedBytes: input.entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
      geometryEntries: safeCandidates.filter((candidate) => candidate.expectedUse === "geometry").length,
      assemblyEntries: safeCandidates.filter((candidate) => candidate.expectedUse === "assembly").length,
      documentationEntries: safeCandidates.filter((candidate) => candidate.expectedUse === "documentation").length,
      sourceCodeEntries: safeCandidates.filter((candidate) => candidate.kind === "source-code").length,
      materializableGeometryEntries: geometryCandidates.length,
      unsupportedCadEntries: safeCandidates.filter((candidate) => !candidate.materializable && ["assembly-cad", "part-cad", "parametric-cad", "cad-exchange"].includes(candidate.kind)).length,
    },
    projectRoots: rootCandidates(input.entries.filter((entry) => entry.safe).map((entry) => entry.path)),
    candidates: sorted,
    selectedTextEntries: textCandidates.slice(0, maxText).map((candidate) => candidate.path),
    selectedGeometryEntries: geometryCandidates.slice(0, maxGeometry).map((candidate) => candidate.path),
    findings,
  };
}

export function archiveAnalysisFingerprint(analysis: ArchiveProjectAnalysis): string {
  return createHash("sha256").update(JSON.stringify({
    archive: analysis.archive.sha256,
    candidates: analysis.candidates.map(({ path, kind, uncompressedSize, score, materializable }) => ({ path, kind, uncompressedSize, score, materializable })),
    selectedTextEntries: analysis.selectedTextEntries,
    selectedGeometryEntries: analysis.selectedGeometryEntries,
  })).digest("hex");
}
