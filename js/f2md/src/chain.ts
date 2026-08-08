/** The fallback chain: cheapest backend that can do the job wins. */
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { DoclingHttpConverter, LocalToolConverter, MammothConverter, ScadSourceConverter, TextConverter, TurndownConverter } from "./converters.js";
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
    const started = Date.now();
    let firstRealFailure: ConversionError | undefined;
    let lastKind = extname(path).toLowerCase();
    for (let depth = 0; depth < this.converters.length; depth++) {
      try {
        const document = await this.converters[depth].convert(path);
        // Stamp facts a backend cannot know about itself: how deep the chain went, and how long.
        return { ...document, fallbackDepth: depth, durationMs: Date.now() - started };
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
 * Turndown/Mammoth (Node) -> text -> pdftotext/pandoc -> Docling over HTTP.
 *
 * Docling joins only when a URL is configured, so the default chain never waits on a service that
 * was never meant to be running.
 */
export function defaultChain(doclingUrl?: string): ConverterChain {
  const converters: Converter[] = [
    // Turndown must precede TextConverter: .html is a text extension, so without this HTML would
    // be fenced as a code block instead of becoming real Markdown. When the optional peer
    // dependency is absent Turndown declines and TextConverter still produces something usable.
    new TurndownConverter(),
    new MammothConverter(),
    new ScadSourceConverter(),
    new TextConverter(),
    new LocalToolConverter(),
  ];
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
