export type ArchiveEntryKind =
  | "assembly-cad"
  | "part-cad"
  | "mesh"
  | "parametric-cad"
  | "cad-exchange"
  | "bill-of-materials"
  | "material-library"
  | "manifest"
  | "documentation"
  | "source-code"
  | "data"
  | "image"
  | "other";

export interface ArchiveInventoryEntry {
  path: string;
  uncompressedSize: number;
  compressedSize?: number;
  crc32?: string;
  safe: boolean;
}

export interface ArchiveCandidate {
  path: string;
  kind: ArchiveEntryKind;
  uncompressedSize: number;
  score: number;
  materializable: boolean;
  expectedUse: "geometry" | "assembly" | "material" | "behavior" | "documentation" | "data";
  backend?: string;
  reason: string;
}

export interface ArchiveFinding {
  severity: "info" | "warning" | "error";
  code: string;
  errorUri: string;
  repairProcess: string;
  entryPath?: string;
  message: string;
}

export interface ArchiveProjectAnalysis {
  schema: "subactor.archive-project-analysis/v1";
  archive: { path: string; uri: string; sha256: string; size: number };
  coverage: {
    entries: number;
    safeEntries: number;
    unsafeEntries: number;
    totalUncompressedBytes: number;
    geometryEntries: number;
    assemblyEntries: number;
    documentationEntries: number;
    sourceCodeEntries: number;
    materializableGeometryEntries: number;
    unsupportedCadEntries: number;
  };
  projectRoots: string[];
  candidates: ArchiveCandidate[];
  selectedTextEntries: string[];
  selectedGeometryEntries: string[];
  findings: ArchiveFinding[];
}

export interface AnalyzeArchiveInput {
  archivePath: string;
  archiveSha256: string;
  archiveSize: number;
  entries: ArchiveInventoryEntry[];
  maxTextEntries?: number;
  maxGeometryEntries?: number;
}
