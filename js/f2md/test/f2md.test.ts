import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  BACKEND_TYPES,
  ConversionError,
  ConverterChain,
  DoclingHttpConverter,
  ExternalConverterRequired,
  LocalToolConverter,
  MammothConverter,
  PythonCanonicalConverter,
  TextConverter,
  TurndownConverter,
  convert,
  convertToMarkdown,
  convertTree,
  detectDocumentKind,
  mediaTypeFor,
  type ConvertedDocument,
  type Converter,
} from "../src/index.js";
import { main } from "../src/cli.js";

async function workspace(t: { after(fn: () => unknown): void }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "f2md-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/* ------------------------------------------------------------------ detection */
test("document kind survives content-addressed filenames", () => {
  assert.equal(detectDocumentKind("a/b/report.pdf"), ".pdf");
  // Ingestion renames imports and destroys the real suffix; detection must still work.
  assert.equal(detectDocumentKind("imports/report.pdf-9f2c8ad4"), ".pdf");
  assert.equal(detectDocumentKind("deck.pptx.part"), ".pptx");
  assert.equal(detectDocumentKind("notes.md"), ".md");
  assert.equal(detectDocumentKind("already-converted/report.pdf.md"), ".md");
  assert.equal(detectDocumentKind("already-converted/report.pdf.md-d5177023"), ".md");
  assert.equal(detectDocumentKind("already-converted/deck.pptx.lt.md"), ".md");
  assert.equal(detectDocumentKind("logs/runtime.log"), ".log");
  assert.equal(detectDocumentKind("logs/result.testqldsl"), ".testqldsl");
  assert.equal(detectDocumentKind("plain"), "");
});

test("media types cover source files, not just documents", () => {
  assert.equal(mediaTypeFor("x/report.pdf"), "application/pdf");
  assert.equal(mediaTypeFor("a.ts"), "text/x-typescript");
  assert.equal(mediaTypeFor("thing.unknown-ext"), "application/octet-stream");
});

/* ---------------------------------------------------------------- text backend */
test("markdown passes through unchanged", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "note.md");
  await writeFile(path, "# Title\n\nbody\n");
  const doc = await convert(path);
  assert.equal(doc.markdown, "# Title\n\nbody\n");
  assert.equal(doc.converter, "deterministic-text");
  assert.equal(doc.metadata.source, path);
});

test("DSL passes through unchanged instead of being nested in a code fence", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "result.testqldsl");
  const source = "TESTQL_RESULT run-1\nOK true\nEND_TESTQL_RESULT\n";
  await writeFile(path, source);
  const doc = await convert(path);
  assert.equal(doc.markdown, source);
  assert.equal(doc.inputKind, ".testqldsl");
});

test("code is fenced with its language", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "main.ts");
  await writeFile(path, "export const x = 1;\n");
  const markdown = await convertToMarkdown(path);
  assert.match(markdown, /^# main\.ts/);
  assert.match(markdown, /```ts\n/);
});

test("binary content is not treated as text whatever the extension says", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "fake.txt");
  await writeFile(path, Buffer.from([0x00, 0x01, 0x02, 0x41]));
  await assert.rejects(() => new TextConverter().convert(path), ExternalConverterRequired);
});

test("long text is truncated", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "big.txt");
  await writeFile(path, "a".repeat(5000));
  const markdown = (await new TextConverter(100).convert(path)).markdown;
  assert.match(markdown, /…\[truncated\]/);
  assert.ok(markdown.length < 500);
});

test("missing file is reported clearly", async (t) => {
  const dir = await workspace(t);
  await assert.rejects(() => convert(join(dir, "nope.md")), /FILE_NOT_FOUND/);
});

/* --------------------------------------------------------------- chain routing */
const skips: Converter = { name: "skips", backendType: "stdlib", convert: async () => { throw new ExternalConverterRequired(".pdf"); } };
const breaks: Converter = { name: "breaks", backendType: "stdlib", convert: async () => { throw new ConversionError("BACKEND_EXPLODED"); } };
const works: Converter = {
  name: "works",
  backendType: "stdlib",
  convert: async (): Promise<ConvertedDocument> => ({
    markdown: "# ok", metadata: {}, assets: [], converter: "works", version: "1",
    backendType: "stdlib", inputKind: "", ocr: false, fallbackDepth: 0, durationMs: 0, warnings: [],
  }),
};

test("chain skips inapplicable backends", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "a.md");
  await writeFile(path, "x");
  assert.equal((await new ConverterChain([skips, works]).convert(path)).converter, "works");
});

test("a broken backend is not reported as an unsupported format", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "a.md");
  await writeFile(path, "x");
  await assert.rejects(() => new ConverterChain([breaks, skips]).convert(path), /BACKEND_EXPLODED/);
});

test("a later success beats an earlier failure", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "a.md");
  await writeFile(path, "x");
  assert.equal((await new ConverterChain([breaks, works]).convert(path)).converter, "works");
});

test("an empty chain is rejected", () => {
  assert.throws(() => new ConverterChain([]), /CONVERTER_CHAIN_EMPTY/);
});

/* ------------------------------------------------------------ docling over http */
async function doclingStub(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const size = Buffer.concat(chunks).length;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ markdown: "# from docling", converter: "docling", metadata: { bytes: size } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("docling backend round trip carries the file body", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "scan.pdf");
  await writeFile(path, Buffer.from("%PDF-1.4 fake"));
  const stub = await doclingStub();
  t.after(() => new Promise<void>((done) => stub.server.close(() => done())));
  const doc = await new DoclingHttpConverter(stub.url).convert(path);
  assert.equal(doc.markdown, "# from docling");
  assert.equal(doc.converter, "docling");
  assert.ok((doc.metadata.bytes as number) > 0, "multipart body must carry the file");
});

test("docling connection failure surfaces as a conversion error", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "scan.pdf");
  await writeFile(path, Buffer.from("%PDF-1.4 fake"));
  await assert.rejects(() => new DoclingHttpConverter("http://127.0.0.1:1", 2000).convert(path), /DOCLING_HTTP/);
});

test("docling declines mesh resources before network I/O", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "model.glb");
  await writeFile(path, Buffer.from([0x67, 0x6c, 0x54, 0x46]));
  await assert.rejects(
    () => new DoclingHttpConverter("http://127.0.0.1:1", 2000).convert(path),
    (error: unknown) => error instanceof ExternalConverterRequired && error.message === "EXTERNAL_CONVERTER_REQUIRED:.glb",
  );
});

/* -------------------------------------------------------------------------- cli */
test("cli emits markdown and reports failures on stderr", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "note.md");
  await writeFile(path, "# Hello\n");

  const out: string[] = [];
  const err: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...a: unknown[]) => out.push(a.join(" "));
  console.error = (...a: unknown[]) => err.push(a.join(" "));
  try {
    assert.equal(await main([path]), 0);
    assert.match(out.join("\n"), /# Hello/);

    out.length = 0;
    assert.equal(await main([path, "--json"]), 0);
    assert.equal((JSON.parse(out[0]) as ConvertedDocument).converter, "deterministic-text");

    out.length = 0;
    assert.equal(await main(["imports/report.pdf-9f2c", "--detect"]), 0);
    assert.equal((JSON.parse(out[0]) as { kind: string }).kind, ".pdf");

    out.length = 0;
    // stdout must stay clean so `f2md *.md > out.md` is usable when one file is bad.
    assert.equal(await main([join(dir, "missing.md")]), 1);
    assert.equal(out.length, 0);
    assert.match(err.join("\n"), /FILE_NOT_FOUND/);
  } finally {
    console.log = realLog;
    console.error = realError;
  }
});

/* ------------------------------------------------------------------ provenance */
test("operational provenance is populated", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "a.txt");
  await writeFile(path, "x");
  const doc = await convert(path);
  assert.equal(doc.backendType, "stdlib");
  assert.equal(doc.inputKind, ".txt");
  assert.equal(doc.ocr, false);
  assert.ok(doc.durationMs >= 0);
  assert.deepEqual(doc.warnings, []);
});

test("fallbackDepth counts backends that declined", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "a.md");
  await writeFile(path, "x");
  const doc = await new ConverterChain([skips, skips, works]).convert(path);
  assert.equal(doc.fallbackDepth, 2, "depth must reveal a badly ordered chain");
});

test("truncation is reported as a warning", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "big.txt");
  await writeFile(path, "a".repeat(5000));
  const doc = await new TextConverter(100).convert(path);
  assert.ok(doc.warnings.some((w) => w.startsWith("TRUNCATED:100:5000")), JSON.stringify(doc.warnings));
});

test("each backend declares a valid backendType", () => {
  assert.equal(new TextConverter().backendType, "stdlib");
  assert.equal(new LocalToolConverter().backendType, "binary");
  assert.equal(new TurndownConverter().backendType, "node");
  assert.equal(new MammothConverter().backendType, "node");
  assert.equal(new DoclingHttpConverter().backendType, "http");
  for (const c of [new TextConverter(), new LocalToolConverter(), new TurndownConverter(), new DoclingHttpConverter()]) {
    assert.ok(BACKEND_TYPES.includes(c.backendType));
  }
});

/* -------------------------------------------------------------- node backends */
test("HTML becomes real Markdown, not a fenced code block", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "page.html");
  await writeFile(path, "<h1>Zone Build</h1><p>12.4 x 14.2 m</p><ul><li>liquid_handler_01</li></ul>");
  const doc = await convert(path);
  // Turndown must win over TextConverter, which also claims .html.
  assert.equal(doc.converter, "turndown");
  assert.equal(doc.backendType, "node");
  assert.match(doc.markdown, /^# Zone Build/);
  // Turndown escapes underscores in Markdown; that is correct output, not a defect.
  assert.match(doc.markdown, /-\s+liquid\\?_handler\\?_01/);
  assert.doesNotMatch(doc.markdown, /```/);
});

test("DOCX goes through mammoth then turndown", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "doc.docx");
  // A DOCX is a zip; mammoth must fail on a non-zip rather than silently produce nothing.
  await writeFile(path, Buffer.from("not really a docx"));
  await assert.rejects(() => new MammothConverter().convert(path), /MAMMOTH_FAILED|ConversionError/);
});

test("Node delegates document conversion to the canonical Python envelope", async (t) => {
  const dir = await workspace(t);
  const packageDir = join(dir, "python", "f2md");
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, "__init__.py"), "");
  await writeFile(
    join(packageDir, "cli.py"),
    "import json,pathlib,sys\n"
      + "quality={\"schema\":\"bioxfoundry.markdown-quality/v1\",\"status\":\"pass\",\"score\":100,\"sourceSha256\":\"0\"*64,\"metrics\":{},\"checks\":[]}\n"
      + "structure={\"schema\":\"bioxfoundry.document-structure/v1\",\"blocks\":[]}\n"
      + "ast={\"schema\":\"f2md.document-ast/v1\",\"artifacts\":[]}\n"
      + "if '--materialize-to' in sys.argv:\n"
      + " out=pathlib.Path(sys.argv[sys.argv.index('--materialize-to')+1]); store=pathlib.Path(str(out)[:-3]+'.artifacts'); store.mkdir(parents=True); (store/'table-preview.md').write_text('| A |\\n|---|\\n')\n"
      + "metadata={\"conversionQuality\":quality,\"structure\":structure,\"documentAst\":ast,\"ocrAudit\":{\"ocrRequested\":False,\"ocrActuallyUsed\":False,\"ocrEngine\":\"none\"}}\n"
      + "print(json.dumps({\"markdown\":\"# canonical\\n\",\"metadata\":metadata,\"assets\":[],\"converter\":\"python-canonical\",\"version\":\"1\",\"backendType\":\"python\",\"inputKind\":\".pdf\",\"ocr\":False,\"fallbackDepth\":0,\"durationMs\":0,\"warnings\":[]}))\n",
  );
  const source = join(dir, "source");
  const output = join(dir, "output");
  await mkdir(source);
  const path = join(source, "study.pdf");
  await writeFile(path, Buffer.from("%PDF fixture"));

  const converter = new PythonCanonicalConverter("python3", 5_000, join(dir, "python"));
  const document = await converter.convert(path);

  assert.equal(document.converter, "python-canonical");
  assert.equal(document.backendType, "python");
  assert.equal((document.metadata.conversionQuality as { status: string }).status, "pass");

  const tree = await convertTree(source, output, { chain: new ConverterChain([converter]) });
  assert.deepEqual(tree.byQuality, { pass: 1 });
  assert.match(await readFile(join(output, "study.pdf.md"), "utf8"), /qualityStatus: "pass"/);
  assert.equal(JSON.parse(await readFile(join(output, "study.pdf.structure.json"), "utf8")).schema,
    "bioxfoundry.document-structure/v1");
  assert.match(await readFile(join(output, "study.pdf.quality.mdqldsl"), "utf8"), /STATUS PASS/);
  assert.equal(JSON.parse(await readFile(join(output, "study.pdf.ast.json"), "utf8")).schema,
    "f2md.document-ast/v1");
  const version = await readFile(join(output, "VERSION"), "utf8");
  assert.match(version, /OUTPUT_FILES=1\n/);
  assert.match(version, /ASSET_FILES=1\n/);
});

/* ------------------------------------------------------------------- tree mode */
test("tree mode mirrors structure and keeps the original extension", async (t) => {
  const dir = await workspace(t);
  const src = join(dir, "src");
  const out = join(dir, "out");
  await mkdir(join(src, "sub"), { recursive: true });
  await writeFile(join(src, "note.md"), "# Hello\n");
  await writeFile(join(src, "sub", "page.html"), "<h1>Zone</h1>");
  await writeFile(join(src, "sub", "model.stl"), Buffer.from([0, 1, 2, 3]));

  const result = await convertTree(src, out, { onProgress: undefined });
  assert.equal(result.converted, 2);
  assert.equal(result.stubbed, 1, "a binary with no text layer must still produce a file");

  const note = await readFile(join(out, "note.md.md"), "utf8");
  assert.match(note, /^---\n/, "front matter must lead the file");
  assert.match(note, /converter: "deterministic-text"/);
  assert.match(note, /backendType: "stdlib"/);
  assert.match(note, /# Hello/);

  // The stub records why there is no text rather than omitting the file.
  const stub = await readFile(join(out, "sub", "model.stl.md"), "utf8");
  assert.match(stub, /converted: false/);
  assert.match(stub, /EXTERNAL_CONVERTER_REQUIRED/);

  const version = await readFile(join(out, "VERSION"), "utf8");
  assert.match(version, /FORMAT=bioxfoundry\.conversion-version\/v1/);
  assert.match(version, /ARTIFACT=markdown-mirror/);
  assert.match(version, /SOURCE_SNAPSHOT_SHA256=[a-f0-9]{64}/);
  assert.match(version, /OUTPUT_SNAPSHOT_SHA256=[a-f0-9]{64}/);

  const coverage = JSON.parse(await readFile(join(out, "source-coverage.json"), "utf8")) as {
    schema: string;
    summary: { discovered: number; terminal: number; byState: Record<string, number> };
  };
  assert.equal(coverage.schema, "bioxfoundry.source-coverage/v1");
  assert.equal(coverage.summary.discovered, 3);
  assert.equal(coverage.summary.terminal, 3);
  assert.equal(coverage.summary.byState.converted, 2);
  assert.equal(coverage.summary.byState.unsupported, 1);
  assert.match(await readFile(join(out, "source-coverage.dsl"), "utf8"), /RESULT COMPLETE/);
});

test("source coverage is byte-stable and a filtered source is explicitly excluded", async (t) => {
  const dir = await workspace(t);
  const src = join(dir, "src");
  const out = join(dir, "out");
  await mkdir(src, { recursive: true });
  await writeFile(join(src, "note.md"), "# One\n");
  await writeFile(join(src, "model.glb"), Buffer.from([0x67, 0x6c, 0x54, 0x46]));

  const first = await convertTree(src, out);
  const jsonPath = join(out, "source-coverage.json");
  const dslPath = join(out, "source-coverage.dsl");
  const firstJson = await readFile(jsonPath);
  const firstDsl = await readFile(dslPath);
  const before = JSON.parse(firstJson.toString("utf8")) as { records: Array<Record<string, string>> };
  assert.equal(first.coverageNoChange, false);

  const second = await convertTree(src, out);
  assert.equal(second.coverageNoChange, true);
  assert.deepEqual(await readFile(jsonPath), firstJson);
  assert.deepEqual(await readFile(dslPath), firstDsl);

  await writeFile(join(src, "note.md"), "# Two\n");
  const third = await convertTree(src, out);
  const after = JSON.parse(await readFile(jsonPath, "utf8")) as { records: Array<Record<string, string>> };
  const beforeByPath = new Map(before.records.map((record) => [record.path, record]));
  const afterByPath = new Map(after.records.map((record) => [record.path, record]));
  assert.equal(third.coverageNoChange, false);
  assert.notEqual(beforeByPath.get("note.md")?.sourceSha256, afterByPath.get("note.md")?.sourceSha256);
  assert.deepEqual(beforeByPath.get("model.glb"), afterByPath.get("model.glb"));

  const filteredOut = join(dir, "filtered");
  const filtered = await convertTree(src, filteredOut, { only: [".md"] });
  const filteredCoverage = JSON.parse(await readFile(join(filteredOut, "source-coverage.json"), "utf8")) as {
    summary: { discovered: number; terminal: number; byState: Record<string, number> };
    records: Array<Record<string, unknown>>;
  };
  assert.equal(filtered.skipped, 1);
  assert.equal(filteredCoverage.summary.discovered, filteredCoverage.summary.terminal);
  assert.equal(filteredCoverage.summary.byState["excluded-by-policy"], 1);
  assert.equal(filteredCoverage.records.find((record) => record.path === "model.glb")?.reasonCode, "KIND_NOT_SELECTED");
});

test("tree mode refuses to write inside its own source", async (t) => {
  const dir = await workspace(t);
  const src = join(dir, "src");
  await mkdir(src, { recursive: true });
  await writeFile(join(src, "a.md"), "x");
  // Otherwise the next run would re-ingest its own generated Markdown.
  await assert.rejects(() => convertTree(src, join(src, "out")), /OUTPUT_INSIDE_SOURCE/);
});

test("source is absolute even when called with a relative path", async (t) => {
  const dir = await workspace(t);
  const path = join(dir, "note.md");
  await writeFile(path, "# Hi\n");
  // A relative path cannot be resolved later from a different working directory.
  const doc = await convert(relative(process.cwd(), path));
  assert.equal(doc.metadata.source, path);
});

test("tree records both absolute and tree-relative source", async (t) => {
  const dir = await workspace(t);
  const src = join(dir, "src", "deep");
  await mkdir(src, { recursive: true });
  await writeFile(join(src, "a.md"), "# A\n");
  const out = join(dir, "out");
  await convertTree(join(dir, "src"), out);
  const text = await readFile(join(out, "deep", "a.md.md"), "utf8");
  assert.match(text, new RegExp(`source: "${join(src, "a.md").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(text, /sourceRelative: "deep\/a\.md"/);
});
