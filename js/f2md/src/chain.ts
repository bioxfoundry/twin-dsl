/** The fallback chain: cheapest backend that can do the job wins. */
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { DoclingHttpConverter, LocalToolConverter, TextConverter } from "./converters.js";
import { ConversionError, type ConvertedDocument, type Converter, ExternalConverterRequired } from "./types.js";

/**
 * Try each backend in order; skip the ones that say the file is not theirs.
 *
 * A backend throwing `ExternalConverterRequired` is a routing signal, not a failure, so the chain
 * moves on. A backend that *was* the right one but broke throws `ConversionError`, which is
 * remembered and rethrown if nothing later succeeds — otherwise a Docling outage would surface as
 * the misleading "unsupported format".
 */
export class ConverterChain {
  readonly converters: Converter[];
  constructor(converters: Converter[]) {
    if (!converters.length) throw new ConversionError("CONVERTER_CHAIN_EMPTY");
    this.converters = [...converters];
  }

  async convert(path: string): Promise<ConvertedDocument> {
    try {
      if (!(await stat(path)).isFile()) throw new ConversionError(`FILE_NOT_FOUND:${path}`);
    } catch (error) {
      if (error instanceof ConversionError) throw error;
      throw new ConversionError(`FILE_NOT_FOUND:${path}`);
    }
    let firstRealFailure: ConversionError | undefined;
    let lastKind = extname(path).toLowerCase();
    for (const converter of this.converters) {
      try {
        return await converter.convert(path);
      } catch (error) {
        if (error instanceof ExternalConverterRequired) {
          lastKind = error.kind;
          continue;
        }
        if (error instanceof ConversionError) {
          firstRealFailure ??= error;
          continue;
        }
        throw error;
      }
    }
    if (firstRealFailure) throw firstRealFailure;
    throw new ExternalConverterRequired(lastKind);
  }
}

/**
 * Text -> local pdftotext/pandoc -> Docling over HTTP.
 *
 * Docling joins only when a URL is configured, so the default chain never waits on a service that
 * was never meant to be running.
 */
export function defaultChain(doclingUrl?: string): ConverterChain {
  const converters: Converter[] = [new TextConverter(), new LocalToolConverter()];
  const url = doclingUrl ?? process.env.DOCLING_URL;
  if (url) converters.push(new DoclingHttpConverter(url));
  return new ConverterChain(converters);
}

/** Convert one file to Markdown using the default chain. */
export function convert(path: string, doclingUrl?: string): Promise<ConvertedDocument> {
  return defaultChain(doclingUrl).convert(path);
}

/** Convenience wrapper returning only the Markdown body. */
export async function convertToMarkdown(path: string, doclingUrl?: string): Promise<string> {
  return (await convert(path, doclingUrl)).markdown;
}
