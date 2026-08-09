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
export const VERSION = "0.2.1";

export { BACKEND_TYPES, ConversionError, ExternalConverterRequired } from "./types.js";
export type { BackendType, ConvertedDocument, Converter } from "./types.js";
export {
  DEFAULT_MAX_CHARS,
  DEFAULT_TIMEOUT_MS,
  DoclingHttpConverter,
  LocalToolConverter,
  MammothConverter,
  ScadSourceConverter,
  TextConverter,
  TurndownConverter,
} from "./converters.js";
export { ConverterChain, convert, convertToMarkdown, defaultChain } from "./chain.js";
export { SKIP_DIRS, convertTree, frontMatter, walkFiles } from "./tree.js";
export type { TreeOptions, TreeResult } from "./tree.js";
export {
  BINARY_EXTENSIONS,
  DOCLING_EXTENSIONS,
  DOCUMENT_CONVERSION_EXTENSIONS,
  MEDIA_TYPES,
  TEXT_EXTENSIONS,
  detectDocumentKind,
  isDoclingKind,
  isDocumentConversionKind,
  isTextKind,
  mediaTypeFor,
} from "./detect.js";
