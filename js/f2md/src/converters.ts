/**
 * The converter backends, weakest dependency first.
 *
 * Each backend throws `ExternalConverterRequired` when the file is not its job, which is what lets
 * `ConverterChain` fall through without treating "wrong backend" as an error.
 */
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import { detectDocumentKind, isTextKind } from "./detect.js";
import { ConversionError, type ConvertedDocument, type Converter, ExternalConverterRequired } from "./types.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_MAX_CHARS = Number(process.env.F2MD_MAX_CHARS ?? process.env.DT_MAX_EXTRACT_CHARS ?? 400_000);
export const DEFAULT_TIMEOUT_MS = Number(process.env.F2MD_TIMEOUT_MS ?? 120_000);

async function statMetadata(path: string): Promise<Record<string, unknown>> {
  const info = await stat(path);
  return { source: path, size: info.size, mtime: info.mtime.toISOString() };
}

function clip(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n…[truncated]`;
}

/**
 * Text and source files, using only the standard library.
 *
 * Markdown passes through untouched; everything else is fenced with its language so the original
 * bytes stay recoverable and a downstream indexer does not mistake code for prose.
 */
export class TextConverter implements Converter {
  readonly name = "deterministic-text";
  readonly version = "1.2.0";
  constructor(readonly maxChars = DEFAULT_MAX_CHARS) {}

  async convert(path: string): Promise<ConvertedDocument> {
    const kind = detectDocumentKind(path);
    if (!isTextKind(kind)) throw new ExternalConverterRequired(kind);
    const raw = await readFile(path);
    // A NUL byte means this is not really text, whatever the extension claims.
    if (raw.includes(0)) throw new ExternalConverterRequired(kind);
    const text = raw.toString("utf8");
    const metadata = { ...(await statMetadata(path)), extractedChars: text.length };
    if (kind === ".md" || kind === ".markdown") {
      return { markdown: text, metadata, assets: [], converter: this.name, version: this.version };
    }
    const fence = kind.replace(/^\./, "") || "text";
    return {
      markdown: `# ${basename(path)}\n\n\`\`\`${fence}\n${clip(text, this.maxChars)}\n\`\`\`\n`,
      metadata,
      assets: [],
      converter: this.name,
      version: this.version,
    };
  }
}

const PANDOC_FORMATS: Record<string, string> = {
  ".docx": "docx", ".odt": "odt", ".rtf": "rtf", ".pptx": "pptx", ".epub": "epub",
};

/**
 * `pdftotext` (poppler) and `pandoc`, so PDFs and Office files work with no daemon.
 *
 * A missing binary is reported as "not my job" so the chain moves on, rather than as an opaque
 * ENOENT that would look like a broken backend.
 */
export class LocalToolConverter implements Converter {
  readonly name = "local-tools";
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
    return {
      markdown: `# ${basename(path)}\n\n${clip(text, this.maxChars)}\n`,
      metadata: { ...(await statMetadata(path)), extractedChars: text.length },
      assets: [],
      converter: tool,
      version: this.version,
    };
  }
}

/** A Docling service over HTTP, for everything the local tools cannot read. */
export class DoclingHttpConverter implements Converter {
  readonly name = "docling-http";
  readonly version = "1.0.0";
  readonly baseUrl: string;
  constructor(baseUrl = process.env.DOCLING_URL ?? "http://127.0.0.1:5001", readonly timeoutMs = 180_000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async convert(path: string): Promise<ConvertedDocument> {
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
    };
  }
}
