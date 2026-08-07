#!/usr/bin/env node
/** `f2md` command line entry point. */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConverterChain, defaultChain } from "./chain.js";
import { DoclingHttpConverter, LocalToolConverter, TextConverter } from "./converters.js";
import { detectDocumentKind, mediaTypeFor } from "./detect.js";
import { ConversionError } from "./types.js";
import { VERSION } from "./index.js";

const USAGE = `usage: f2md [options] <file...>

  --json              emit the full envelope instead of Markdown
  --detect            only report detected kind and media type
  --backend <name>    auto (default) | text | local | docling
  --docling-url <url> Docling service URL (or set DOCLING_URL)
  --version
`;

function chainFor(backend: string, doclingUrl?: string): ConverterChain {
  if (backend === "text") return new ConverterChain([new TextConverter()]);
  if (backend === "local") return new ConverterChain([new TextConverter(), new LocalToolConverter()]);
  if (backend === "docling") return new ConverterChain([new DoclingHttpConverter(doclingUrl)]);
  return defaultChain(doclingUrl);
}

export async function main(argv: string[]): Promise<number> {
  const paths: string[] = [];
  let json = false;
  let detect = false;
  let backend = "auto";
  let doclingUrl: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") json = true;
    else if (arg === "--detect") detect = true;
    else if (arg === "--backend") backend = argv[++i] ?? "auto";
    else if (arg === "--docling-url") doclingUrl = argv[++i];
    else if (arg === "--version") { console.log(`f2md ${VERSION}`); return 0; }
    else if (arg === "--help" || arg === "-h") { console.log(USAGE); return 0; }
    else if (arg.startsWith("-")) { console.error(`f2md: unknown option ${arg}\n${USAGE}`); return 2; }
    else paths.push(arg);
  }
  if (!paths.length) { console.error(USAGE); return 2; }

  if (detect) {
    for (const path of paths) console.log(JSON.stringify({ path, kind: detectDocumentKind(path), mediaType: mediaTypeFor(path) }));
    return 0;
  }

  const chain = chainFor(backend, doclingUrl);
  let failures = 0;
  for (const path of paths) {
    try {
      const document = await chain.convert(path);
      if (json) console.log(JSON.stringify(document));
      else {
        if (paths.length > 1) console.log(`<!-- f2md source=${path} converter=${document.converter} -->`);
        console.log(document.markdown);
      }
    } catch (error) {
      // Failures go to stderr so `f2md *.pdf > out.md` stays usable when one file is bad.
      console.error(`f2md: ${path}: ${error instanceof ConversionError ? error.message : String(error)}`);
      failures++;
    }
  }
  return failures ? 1 : 0;
}

/**
 * Only run when this module *is* the entry point. Matching on the filename is not enough: the bin
 * is installed as a symlink, and any consumer whose path merely contains "f2md" would trigger it.
 */
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
