/**
 * f2md — convert any file to a unified Markdown envelope.
 *
 * ```ts
 * import { convert } from "@subactor/f2md";
 * const doc = await convert("report.pdf");
 * doc.converter; // "pdftotext"
 * ```
 *
 * The core has no dependencies; PDF/Office support uses `pdftotext`/`pandoc` if present, and
 * anything else can be routed to a Docling service. Every result carries provenance, so a caller
 * always knows which backend produced the Markdown.
 */
export const VERSION = "0.1.0";

export { ConversionError, ExternalConverterRequired } from "./types.js";
export type { ConvertedDocument, Converter } from "./types.js";
export {
  DEFAULT_MAX_CHARS,
  DEFAULT_TIMEOUT_MS,
  DoclingHttpConverter,
  LocalToolConverter,
  TextConverter,
} from "./converters.js";
export { ConverterChain, convert, convertToMarkdown, defaultChain } from "./chain.js";
export {
  BINARY_EXTENSIONS,
  MEDIA_TYPES,
  TEXT_EXTENSIONS,
  detectDocumentKind,
  isTextKind,
  mediaTypeFor,
} from "./detect.js";
