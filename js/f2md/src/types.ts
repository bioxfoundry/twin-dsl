/**
 * The envelope every converter returns.
 *
 * Conversion is only half the job: what a downstream index needs is the Markdown *plus* enough
 * provenance to say where it came from and which backend produced it. Keeping that in one shape
 * means a caller never has to branch on which converter ran.
 */
/**
 * How a backend does its work. Useful for capacity planning and for explaining latency:
 * `stdlib` is in-process and free, `binary` forks a process, `node` loads a library into this
 * process, `http` depends on a remote service being up.
 */
export type BackendType = "stdlib" | "binary" | "node" | "http";
export const BACKEND_TYPES: readonly BackendType[] = ["stdlib", "binary", "node", "http"];

export interface ConvertedDocument {
  markdown: string;
  metadata: Record<string, unknown>;
  assets: string[];
  /** Which backend actually ran: `deterministic-text`, `pdftotext`, `pandoc`, `docling`. */
  converter: string;
  /** That backend's version, so output changes stay traceable. */
  version: string;
  backendType: BackendType;
  /** Detected input kind, independent of what the filename claims. */
  inputKind: string;
  /** Whether this Markdown came from optical recognition rather than an embedded text layer. */
  ocr: boolean;
  /** How many backends declined before the one that succeeded. 0 means first choice. */
  fallbackDepth: number;
  /** Wall-clock cost of the conversion, for diagnosing a slow pipeline. */
  durationMs: number;
  /** Non-fatal quality signals, e.g. truncation or content the backend could not represent. */
  warnings: string[];
}

export interface Converter {
  readonly name: string;
  readonly backendType: BackendType;
  convert(path: string): Promise<ConvertedDocument>;
}

/** Base class for every failure this package raises. */
export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}

/**
 * The file needs a backend that is not available or not applicable here.
 *
 * Carries the detected kind so the chain can try the next converter, and so a caller that catches
 * it can tell "unsupported format" apart from "backend broke".
 */
export class ExternalConverterRequired extends ConversionError {
  constructor(readonly kind: string) {
    super(`EXTERNAL_CONVERTER_REQUIRED:${kind}`);
    this.name = "ExternalConverterRequired";
  }
}
