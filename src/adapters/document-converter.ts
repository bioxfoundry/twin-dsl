import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, extname } from "node:path";

const execFileAsync = promisify(execFile);

export interface ConvertedDocument {
  markdown: string;
  metadata: Record<string, unknown>;
  assets: string[];
  converter: string;
  version: string;
}
export interface DocumentConverter {
  convert(path: string): Promise<ConvertedDocument>;
}

const TEXT_EXT = [
  ".md", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".csv",
  ".ts", ".js", ".mjs", ".py", ".php", ".go", ".rs", ".java", ".xml", ".html", ".htm",
  ".dsl", ".projectdsl", ".mathdsl", ".treedsl", ".twindsl", ".scenedsl", ".resourcedsl", ".dql",
  ".svg", ".tex",
];

export class DeterministicMarkdownConverter implements DocumentConverter {
  async convert(path: string): Promise<ConvertedDocument> {
    const ext = extname(path).toLowerCase();
    if (!TEXT_EXT.includes(ext)) throw new Error(`EXTERNAL_CONVERTER_REQUIRED:${ext}`);
    const text = await readFile(path, "utf8");
    const s = await stat(path);
    return {
      markdown: ext === ".md" ? text : `# ${basename(path)}\n\n\`\`\`${ext.slice(1) || "text"}\n${text}\n\`\`\`\n`,
      metadata: { source: path, size: s.size, mtime: s.mtime.toISOString() },
      assets: [],
      converter: "deterministic-text",
      version: "1.2.0",
    };
  }
}

/** Imports may be named `file.pdf-<hash>` — detect logical extension from basename. */
export function detectDocumentKind(path: string): string {
  const base = basename(path).toLowerCase();
  for (const ext of [".pdf", ".docx", ".odt", ".rtf", ".pptx", ".xlsx", ".step", ".stl", ".f3d", ".glb", ".usda", ".zip"]) {
    if (base.includes(ext)) return ext;
  }
  return extname(path).toLowerCase();
}

/** Local pdftotext (poppler) + pandoc for Office — no Docling daemon required. */
export class LocalToolDocumentConverter implements DocumentConverter {
  constructor(
    readonly maxChars = Number(process.env.DT_MAX_EXTRACT_CHARS ?? 400_000),
  ) {}

  async convert(path: string): Promise<ConvertedDocument> {
    const ext = detectDocumentKind(path);
    const s = await stat(path);
    if (ext === ".pdf") {
      const { stdout } = await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"], {
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000,
      });
      const text = String(stdout ?? "").trim();
      if (!text) throw new Error("PDFTOTEXT_EMPTY");
      const clipped = text.length > this.maxChars ? `${text.slice(0, this.maxChars)}\n\n…[truncated]` : text;
      return {
        markdown: `# ${basename(path)}\n\n${clipped}\n`,
        metadata: { source: path, size: s.size, mtime: s.mtime.toISOString(), extractedChars: text.length },
        assets: [],
        converter: "pdftotext",
        version: "1.0.0",
      };
    }
    if ([".docx", ".odt", ".rtf", ".pptx"].includes(ext)) {
      // For hashed imports without real extension, copy-less: pandoc accepts path as-is.
      const { stdout } = await execFileAsync("pandoc", [path, "-t", "markdown", "--wrap=none", "-f", ext === ".docx" ? "docx" : "markdown"], {
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000,
      });
      const text = String(stdout ?? "").trim();
      if (!text) throw new Error("PANDOC_EMPTY");
      const clipped = text.length > this.maxChars ? `${text.slice(0, this.maxChars)}\n\n…[truncated]` : text;
      return {
        markdown: `# ${basename(path)}\n\n${clipped}\n`,
        metadata: { source: path, size: s.size, mtime: s.mtime.toISOString(), extractedChars: text.length },
        assets: [],
        converter: "pandoc",
        version: "1.0.0",
      };
    }
    throw new Error(`EXTERNAL_CONVERTER_REQUIRED:${ext}`);
  }
}

export class DoclingHttpAdapter implements DocumentConverter {
  constructor(readonly baseUrl = process.env.DOCLING_URL ?? "http://127.0.0.1:5001") {}
  async convert(path: string): Promise<ConvertedDocument> {
    const bytes = await readFile(path);
    const form = new FormData();
    form.set("file", new Blob([bytes]), basename(path));
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/convert`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok) throw new Error(`DOCLING_HTTP:${response.status}`);
    const data = await response.json() as { markdown?: unknown; converter?: unknown; metadata?: unknown; assets?: unknown };
    if (typeof data.markdown !== "string") throw new Error("DOCLING_MARKDOWN_MISSING");
    return {
      markdown: data.markdown,
      metadata: data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : { source: path },
      assets: Array.isArray(data.assets) ? data.assets.map(String) : [],
      converter: typeof data.converter === "string" ? data.converter : "docling",
      version: "1",
    };
  }
}

/**
 * Chain: deterministic text → local pdftotext/pandoc → optional Docling HTTP.
 */
export class CompositeDocumentConverter implements DocumentConverter {
  constructor(
    readonly deterministic = new DeterministicMarkdownConverter(),
    readonly localTools = new LocalToolDocumentConverter(),
    readonly docling = process.env.DOCLING_URL ? new DoclingHttpAdapter() : null,
  ) {}

  async convert(path: string): Promise<ConvertedDocument> {
    try {
      return await this.deterministic.convert(path);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("EXTERNAL_CONVERTER_REQUIRED:")) throw error;
    }
    try {
      return await this.localTools.convert(path);
    } catch (error) {
      if (this.docling) {
        try {
          return await this.docling.convert(path);
        } catch {
          /* fall through */
        }
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
