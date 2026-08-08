/**
 * The converter backends, weakest dependency first.
 *
 * Each backend throws `ExternalConverterRequired` when the file is not its job, which is what lets
 * `ConverterChain` fall through without treating "wrong backend" as an error.
 */
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { detectDocumentKind, isTextKind } from "./detect.js";
import { type BackendType, ConversionError, type ConvertedDocument, type Converter, ExternalConverterRequired } from "./types.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_MAX_CHARS = Number(process.env.F2MD_MAX_CHARS ?? process.env.DT_MAX_EXTRACT_CHARS ?? 400_000);
export const DEFAULT_TIMEOUT_MS = Number(process.env.F2MD_TIMEOUT_MS ?? 120_000);

async function statMetadata(path: string): Promise<Record<string, unknown>> {
  const info = await stat(path);
  // Absolute: a caller that recorded a relative path cannot resolve it later from a different
  // working directory, which defeats the point of recording provenance.
  return { source: resolve(path), size: info.size, mtime: info.mtime.toISOString() };
}

/** Truncate to `maxChars`, reporting it as a warning rather than silently losing content. */
function clip(text: string, maxChars: number): { body: string; warnings: string[] } {
  if (maxChars <= 0 || text.length <= maxChars) return { body: text, warnings: [] };
  return { body: `${text.slice(0, maxChars)}\n\n…[truncated]`, warnings: [`TRUNCATED:${maxChars}:${text.length}`] };
}

/** Load an optional peer dependency; absence is a routing signal, not a crash. */
async function optionalModule<T>(name: string, kind: string): Promise<T> {
  try {
    return (await import(name)) as T;
  } catch {
    throw new ExternalConverterRequired(kind);
  }
}

/**
 * Text and source files, using only the standard library.
 *
 * Markdown passes through untouched; everything else is fenced with its language so the original
 * bytes stay recoverable and a downstream indexer does not mistake code for prose.
 */
export class TextConverter implements Converter {
  readonly name = "deterministic-text";
  readonly backendType: BackendType = "stdlib";
  readonly version = "1.2.0";
  constructor(readonly maxChars = DEFAULT_MAX_CHARS) {}

  async convert(path: string): Promise<ConvertedDocument> {
    const kind = detectDocumentKind(path);
    // LaTeX is text syntactically, but it is a document format. Give Pandoc a chance to preserve
    // headings, lists, tables and mathematics; if Pandoc is unavailable it remains recoverable
    // through the deterministic text backend.
    if (kind === ".tex") {
      try {
        await execFileAsync("pandoc", ["--version"], { timeout: 5_000 });
        throw new ExternalConverterRequired(kind);
      } catch (error) {
        if (error instanceof ExternalConverterRequired) throw error;
        // Pandoc absence is handled by LocalToolConverter below.
      }
    }
    if (!isTextKind(kind)) throw new ExternalConverterRequired(kind);
    const raw = await readFile(path);
    // A NUL byte means this is not really text, whatever the extension claims.
    if (raw.includes(0)) throw new ExternalConverterRequired(kind);
    const text = raw.toString("utf8");
    const metadata = { ...(await statMetadata(path)), extractedChars: text.length };
    // Markdown and executable/validation DSL documents are already canonical text. Wrapping a
    // TestQLDSL file in another fence corrupts its grammar and breaks the feedback loop.
    if (kind === ".md" || kind === ".markdown" || kind.endsWith("dsl") || kind === ".dql") {
      return { markdown: text, metadata, assets: [], converter: this.name, version: this.version,
        backendType: this.backendType, inputKind: kind, ocr: false, fallbackDepth: 0, durationMs: 0, warnings: [] };
    }
    const fence = kind.replace(/^\./, "") || "text";
    const { body, warnings } = clip(text, this.maxChars);
    return {
      markdown: `# ${basename(path)}\n\n\`\`\`${fence}\n${body}\n\`\`\`\n`,
      metadata,
      assets: [],
      converter: this.name,
      version: this.version,
      backendType: this.backendType, inputKind: kind, ocr: false, fallbackDepth: 0, durationMs: 0, warnings,
    };
  }
}

/** Recoverable SCAD fallback: preserve source and expose parametric intent when solid tessellation is unavailable. */
export class ScadSourceConverter implements Converter {
  readonly name = "scad-source";
  readonly backendType: BackendType = "stdlib";
  readonly version = "1.0.0";
  async convert(path: string): Promise<ConvertedDocument> {
    const kind = detectDocumentKind(path);
    if (kind !== ".scad") throw new ExternalConverterRequired(kind);
    const text = (await readFile(path)).toString("utf8");
    const params = [...text.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*([^;]+);/gm)].map((m) => `${m[1]} = ${m[2].trim()}`);
    const dependencies = [...text.matchAll(/^\s*(?:use|include)\s*<([^>]+)>/gm)].map((m) => m[1]);
    const operators = [...new Set([...text.matchAll(/\b(cylinder|sphere|cube|polyhedron|linear_extrude|rotate_extrude|translate|rotate|scale|mirror|hull|minkowski|difference|union|intersection)\s*\(/g)].map((m) => m[1]))];
    const metadata = { ...(await statMetadata(path)), extractedChars: text.length, parameters: params.length, dependencies, operators };
    return { markdown: `---\nconverter: ${this.name}\nconverterVersion: ${this.version}\nconverted: true\nmediaType: text/x-scad\n---\n\n# ${basename(path)}\n\n## Extracted SCAD intent\n\n- Parameters: ${params.length}\n- Dependencies: ${dependencies.join(", ") || "none"}\n- Geometry/operators: ${operators.join(", ") || "none"}\n\n${params.map((p) => `- ${p}`).join("\n")}\n\n## Source\n\n\`\`\`scad\n${text.trim()}\n\`\`\`\n`, metadata, assets: [], converter: this.name, version: this.version, backendType: this.backendType, inputKind: kind, ocr: false, fallbackDepth: 0, durationMs: 0, warnings: [] };
  }
}

const PANDOC_FORMATS: Record<string, string> = {
  ".tex": "latex", ".docx": "docx", ".odt": "odt", ".rtf": "rtf", ".pptx": "pptx", ".epub": "epub",
};

/**
 * `pdftotext` (poppler) and `pandoc`, so PDFs and Office files work with no daemon.
 *
 * A missing binary is reported as "not my job" so the chain moves on, rather than as an opaque
 * ENOENT that would look like a broken backend.
 */
export class LocalToolConverter implements Converter {
  readonly name = "local-tools";
  readonly backendType: BackendType = "binary";
  readonly version = "1.0.0";
  constructor(readonly maxChars = DEFAULT_MAX_CHARS, readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  async #run(command: string, args: string[], kind: string): Promise<string> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024, timeout: this.timeoutMs, encoding: "utf8" }));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new ExternalConverterRequired(kind);
      const detail = error instanceof Error ? error.message.slice(0, 300) : String(error);
      throw new ConversionError(`${command.toUpperCase()}_FAILED:${detail}`);
    }
    const text = String(stdout ?? "").trim();
    if (!text) throw new ConversionError(`${command.toUpperCase()}_EMPTY`);
    return text;
  }

  async convert(path: string): Promise<ConvertedDocument> {
    const kind = detectDocumentKind(path);
    let text: string;
    let tool: string;
    if (kind === ".pdf") {
      text = await this.#run("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"], kind);
      tool = "pdftotext";
    } else if (PANDOC_FORMATS[kind]) {
      text = await this.#run("pandoc", [path, "-f", PANDOC_FORMATS[kind], "-t", "markdown", "--wrap=none"], kind);
      tool = "pandoc";
    } else {
      throw new ExternalConverterRequired(kind);
    }
    const { body, warnings } = clip(text, this.maxChars);
    // pdftotext emits a plain text layer: tables and figures are flattened or lost.
    if (tool === "pdftotext") warnings.push("LAYOUT_ONLY:tables and images are not preserved");
    return {
      markdown: `# ${basename(path)}\n\n${body}\n`,
      metadata: { ...(await statMetadata(path)), extractedChars: text.length },
      assets: [],
      converter: tool,
      version: this.version,
      backendType: this.backendType, inputKind: kind, ocr: false, fallbackDepth: 0, durationMs: 0, warnings,
    };
  }
}

/** A Docling service over HTTP, for everything the local tools cannot read. */
export class DoclingHttpConverter implements Converter {
  readonly name = "docling-http";
  readonly backendType: BackendType = "http";
  readonly version = "1.0.0";
  readonly baseUrl: string;
  constructor(baseUrl = process.env.DOCLING_URL ?? "http://127.0.0.1:5001", readonly timeoutMs = 180_000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async convert(path: string): Promise<ConvertedDocument> {
    const kind = detectDocumentKind(path);
    const bytes = await readFile(path);
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(bytes)]), basename(path));
    let data: { markdown?: unknown; converter?: unknown; metadata?: unknown; assets?: unknown };
    try {
      const response = await fetch(`${this.baseUrl}/convert`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      data = (await response.json()) as typeof data;
    } catch (error) {
      throw new ConversionError(`DOCLING_HTTP:${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof data.markdown !== "string") throw new ConversionError("DOCLING_MARKDOWN_MISSING");
    return {
      markdown: data.markdown,
      metadata:
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : await statMetadata(path),
      assets: Array.isArray(data.assets) ? data.assets.map(String) : [],
      converter: typeof data.converter === "string" ? data.converter : "docling",
      version: this.version,
      backendType: this.backendType,
      inputKind: kind,
      // Only trust an explicit signal from the service; never guess that OCR happened.
      ocr: Boolean((data as { ocr?: unknown }).ocr),
      fallbackDepth: 0,
      durationMs: 0,
      warnings: Array.isArray((data as { warnings?: unknown }).warnings)
        ? ((data as { warnings: unknown[] }).warnings).map(String)
        : [],
    };
  }
}

/**
 * HTML via Turndown.
 *
 * Optional peer dependency: `npm install turndown`. Absent, the backend declines and the chain
 * moves on, so the core package stays dependency-free.
 */
export class TurndownConverter implements Converter {
  readonly name = "turndown";
  readonly backendType: BackendType = "node";
  readonly version = "7";
  static readonly KINDS = [".html", ".htm"];
  constructor(readonly maxChars = DEFAULT_MAX_CHARS) {}

  async convert(path: string): Promise<ConvertedDocument> {
    const kind = detectDocumentKind(path);
    if (!TurndownConverter.KINDS.includes(kind)) throw new ExternalConverterRequired(kind);
    const html = (await readFile(path)).toString("utf8");
    return htmlToDocument(html, path, kind, this.maxChars, this.name, this.version, this.backendType, []);
  }
}

/**
 * DOCX via Mammoth, then Turndown.
 *
 * Mammoth's own Markdown output is deprecated upstream, so the supported path is
 * DOCX -> semantic HTML -> Markdown, which also keeps the HTML conversion rules in one place.
 * Optional peer dependencies: `npm install mammoth turndown`.
 */
export class MammothConverter implements Converter {
  readonly name = "mammoth+turndown";
  readonly backendType: BackendType = "node";
  readonly version = "1";
  constructor(readonly maxChars = DEFAULT_MAX_CHARS) {}

  async convert(path: string): Promise<ConvertedDocument> {
    const kind = detectDocumentKind(path);
    if (kind !== ".docx") throw new ExternalConverterRequired(kind);
    const mammoth = await optionalModule<{
      convertToHtml(input: { path: string }): Promise<{ value: string; messages: { type: string; message: string }[] }>;
    }>("mammoth", kind);
    let result: { value: string; messages: { type: string; message: string }[] };
    try {
      result = await mammoth.convertToHtml({ path });
    } catch (error) {
      throw new ConversionError(`MAMMOTH_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
    // Mammoth reports unconvertible styles and dropped images; surface them rather than lose them.
    const warnings = result.messages
      .filter((m) => m.type === "warning" || m.type === "error")
      .slice(0, 10)
      .map((m) => `MAMMOTH:${m.message}`.slice(0, 200));
    return htmlToDocument(result.value, path, kind, this.maxChars, this.name, this.version, this.backendType, warnings);
  }
}

/** Shared HTML -> Markdown step, so both HTML and DOCX produce identical formatting. */
async function htmlToDocument(
  html: string,
  path: string,
  kind: string,
  maxChars: number,
  name: string,
  version: string,
  backendType: BackendType,
  warnings: string[],
): Promise<ConvertedDocument> {
  const mod = await optionalModule<{ default: new (options?: Record<string, unknown>) => { turndown(html: string): string } }>(
    "turndown",
    kind,
  );
  const Turndown = mod.default ?? (mod as unknown as new (options?: Record<string, unknown>) => { turndown(html: string): string });
  let text: string;
  try {
    text = new Turndown({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" }).turndown(html).trim();
  } catch (error) {
    throw new ConversionError(`TURNDOWN_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }
  if (!text) throw new ConversionError("TURNDOWN_EMPTY");
  const clipped = clip(text, maxChars);
  return {
    markdown: clipped.body,
    metadata: { ...(await statMetadata(path)), extractedChars: text.length },
    assets: [],
    converter: name,
    version,
    backendType,
    inputKind: kind,
    ocr: false,
    fallbackDepth: 0,
    durationMs: 0,
    warnings: [...warnings, ...clipped.warnings],
  };
}
