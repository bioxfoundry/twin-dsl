/**
 * Format detection that survives content-addressed filenames.
 *
 * Ingestion pipelines routinely rename imports to `report.pdf-9f2c…` or `deck.pptx.part`, which
 * destroys `extname()`. Detection therefore scans the basename for a known extension before
 * falling back to the real suffix.
 */
import { basename, extname } from "node:path";

/** Extensions handled without any external tool. */
export const TEXT_EXTENSIONS: readonly string[] = [
  ".md", ".markdown", ".txt", ".text", ".json", ".jsonl", ".ndjson", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".csv", ".tsv", ".xml", ".html", ".htm", ".svg", ".tex", ".rst",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".php", ".go", ".rs", ".java",
  ".kt", ".c", ".h", ".cpp", ".hpp", ".cs", ".sh", ".bash", ".zsh", ".sql", ".graphql",
  ".dockerfile", ".env", ".properties", ".gradle", ".make", ".cmake",
  ".dsl", ".projectdsl", ".mathdsl", ".treedsl", ".twindsl", ".scenedsl", ".resourcedsl", ".dql",
];

/** Extensions that require an external backend, checked against the whole basename. */
export const BINARY_EXTENSIONS: readonly string[] = [
  ".pdf", ".docx", ".doc", ".odt", ".rtf", ".pptx", ".ppt", ".xlsx", ".xls", ".ods", ".epub",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp",
  ".step", ".stp", ".stl", ".f3d", ".scad", ".glb", ".gltf", ".usda", ".usdz", ".ifc", ".dwg", ".dxf",
  ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar",
];

export const MEDIA_TYPES: Record<string, string> = {
  ".md": "text/markdown", ".markdown": "text/markdown", ".txt": "text/plain",
  ".json": "application/json", ".jsonl": "application/x-ndjson", ".ndjson": "application/x-ndjson",
  ".yaml": "application/yaml", ".yml": "application/yaml", ".toml": "application/toml",
  ".csv": "text/csv", ".tsv": "text/tab-separated-values", ".xml": "application/xml",
  ".html": "text/html", ".htm": "text/html", ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".odt": "application/vnd.oasis.opendocument.text", ".rtf": "application/rtf",
  ".epub": "application/epub+zip",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".tiff": "image/tiff",
  ".step": "model/step", ".stp": "model/step", ".stl": "model/stl",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".usda": "model/vnd.usda", ".usdz": "model/vnd.usdz+zip", ".ifc": "application/x-step",
  ".zip": "application/zip", ".tar": "application/x-tar", ".gz": "application/gzip",
  // Source files: without these every code file would report application/octet-stream even
  // though the text backend converts them happily.
  ".ts": "text/x-typescript", ".tsx": "text/x-typescript", ".js": "text/javascript",
  ".jsx": "text/javascript", ".mjs": "text/javascript", ".cjs": "text/javascript",
  ".py": "text/x-python", ".rb": "text/x-ruby", ".php": "application/x-httpd-php",
  ".go": "text/x-go", ".rs": "text/x-rust", ".java": "text/x-java-source", ".kt": "text/x-kotlin",
  ".c": "text/x-c", ".h": "text/x-c", ".cpp": "text/x-c++", ".hpp": "text/x-c++", ".cs": "text/x-csharp",
  ".sh": "application/x-sh", ".bash": "application/x-sh", ".zsh": "application/x-sh",
  ".sql": "application/sql", ".graphql": "application/graphql", ".rst": "text/x-rst",
  ".tex": "application/x-tex", ".ini": "text/plain", ".cfg": "text/plain", ".env": "text/plain",
};

/**
 * Return the logical extension, tolerating hash/part suffixes.
 *
 * `detectDocumentKind("report.pdf-9f2c8a")` -> `".pdf"`.
 * Longer extensions win, so `.tar.gz`-style names do not match `.gz` prematurely.
 */
export function detectDocumentKind(path: string): string {
  const base = basename(path).toLowerCase();
  let best = "";
  for (const ext of [...BINARY_EXTENSIONS, ...TEXT_EXTENSIONS]) {
    if (base.includes(ext) && ext.length > best.length) best = ext;
  }
  return best || extname(base);
}

/** Best-effort IANA media type, falling back to a generic binary type. */
export function mediaTypeFor(path: string): string {
  return MEDIA_TYPES[detectDocumentKind(path)] ?? MEDIA_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export function isTextKind(kind: string): boolean {
  return TEXT_EXTENSIONS.includes(kind);
}
