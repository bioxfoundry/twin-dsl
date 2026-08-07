/**
 * Document conversion for the runtime.
 *
 * The implementation lives in `js/f2md` — a standalone package (`@subactor/f2md` on npm, `f2md` on
 * PyPI) so the same conversion contract can be used outside this runtime. This module is the
 * runtime-facing surface over it, keeping the historical class names stable for callers.
 */
export type { ConvertedDocument, Converter } from "../../js/f2md/src/index.js";
export {
  ConversionError,
  ExternalConverterRequired,
  TextConverter,
  LocalToolConverter,
  DoclingHttpConverter,
  ConverterChain,
  defaultChain,
  convert,
  convertToMarkdown,
  detectDocumentKind,
  mediaTypeFor,
  isTextKind,
  TEXT_EXTENSIONS,
  BINARY_EXTENSIONS,
  MEDIA_TYPES,
} from "../../js/f2md/src/index.js";

import {
  ConverterChain,
  DoclingHttpConverter,
  LocalToolConverter,
  TextConverter,
  type ConvertedDocument,
  type Converter,
} from "../../js/f2md/src/index.js";

/** @deprecated Use `TextConverter` from `@subactor/f2md`. */
export const DeterministicMarkdownConverter = TextConverter;
/** @deprecated Use `LocalToolConverter` from `@subactor/f2md`. */
export const LocalToolDocumentConverter = LocalToolConverter;
/** @deprecated Use `DoclingHttpConverter` from `@subactor/f2md`. */
export const DoclingHttpAdapter = DoclingHttpConverter;

/** Runtime-facing alias for the converter interface. */
export type DocumentConverter = Converter;

/**
 * Chain: deterministic text -> local pdftotext/pandoc -> optional Docling HTTP.
 *
 * Docling is attached only when `DOCLING_URL` is set, so an ingestion run never blocks on a
 * service that was never meant to be running.
 */
export class CompositeDocumentConverter implements Converter {
  readonly name = "composite";
  readonly #chain: ConverterChain;

  constructor(
    deterministic: Converter = new TextConverter(),
    localTools: Converter = new LocalToolConverter(),
    docling: Converter | null = process.env.DOCLING_URL ? new DoclingHttpConverter() : null,
  ) {
    this.#chain = new ConverterChain(docling ? [deterministic, localTools, docling] : [deterministic, localTools]);
  }

  convert(path: string): Promise<ConvertedDocument> {
    return this.#chain.convert(path);
  }
}
