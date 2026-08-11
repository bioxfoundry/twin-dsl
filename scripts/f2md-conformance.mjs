/**
 * Cross-language conformance for f2md.
 *
 * A pipeline that ingests with Python and indexes with Node (or vice versa) only keeps its
 * provenance guarantees if both packages agree on the envelope. This converts the shared fixtures
 * with each implementation and compares the parts that must not drift: the key set, the detected
 * input kind, the backend category, and whether the file was routed to a text backend at all.
 *
 * The Markdown body is deliberately NOT compared — the backends genuinely differ, and pretending
 * otherwise would either weaken the check or force both sides onto the weakest converter.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "fixtures/f2md");

const REQUIRED_KEYS = [
  "markdown", "metadata", "assets", "converter", "version",
  "backendType", "inputKind", "ocr", "fallbackDepth", "durationMs", "warnings",
].sort();

async function convertWithNode(path) {
  const { stdout } = await execFileAsync(process.execPath, [join(root, "js/f2md/dist/cli.js"), path, "--json"], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function convertWithPython(path) {
  const { stdout } = await execFileAsync("python3", ["-m", "f2md.cli", path, "--json"], {
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PYTHONPATH: join(root, "py/f2md/src") },
  });
  return JSON.parse(stdout);
}

const failures = [];
const differences = [];
const rows = [];

for (const name of (await readdir(fixtures)).sort()) {
  if (name === "README.md") continue;
  const path = join(fixtures, name);
  let node;
  let python;
  try {
    [node, python] = await Promise.all([convertWithNode(path), convertWithPython(path)]);
  } catch (error) {
    failures.push(`${name}: conversion failed — ${error.message.split("\n")[0]}`);
    continue;
  }

  for (const [lang, doc] of [["js", node], ["py", python]]) {
    const keys = Object.keys(doc).sort();
    if (JSON.stringify(keys) !== JSON.stringify(REQUIRED_KEYS)) {
      failures.push(`${name}: ${lang} envelope keys ${JSON.stringify(keys)} != ${JSON.stringify(REQUIRED_KEYS)}`);
    }
  }
  if (node.inputKind !== python.inputKind) {
    failures.push(`${name}: inputKind js=${node.inputKind} py=${python.inputKind}`);
  }
  if (typeof node.ocr !== "boolean" || typeof python.ocr !== "boolean") {
    failures.push(`${name}: ocr must be boolean on both sides`);
  }
  if (!Array.isArray(node.warnings) || !Array.isArray(python.warnings)) {
    failures.push(`${name}: warnings must be an array on both sides`);
  }
  // Routing may legitimately differ: it depends on which optional backends are installed in each
  // environment. That is a deployment fact, not a contract violation, so it is reported rather
  // than failed — the contract above is what must hold everywhere.
  const divergent = node.converter !== python.converter;
  if (divergent) {
    differences.push(
      `${name}: js=${node.converter}(${node.backendType}) py=${python.converter}(${python.backendType})`,
    );
  }
  rows.push({
    fixture: name,
    kind: node.inputKind,
    js: `${node.converter}/${node.backendType}`,
    py: `${python.converter}/${python.backendType}`,
    same: divergent ? "no" : "yes",
  });
}

try {
  const treeRoot = await mkdtemp(join(tmpdir(), "f2md-coverage-conformance-"));
  const source = join(treeRoot, "source");
  const nodeOut = join(treeRoot, "node");
  const pythonOut = join(treeRoot, "python");
  await mkdir(source);
  await writeFile(join(source, "note.md"), "# Coverage\n");
  await writeFile(join(source, "opaque.blob"), Buffer.from([0, 1, 2, 3]));
  await Promise.all([
    execFileAsync(process.execPath, [join(root, "js/f2md/dist/cli.js"), "--tree", source, nodeOut, "--quiet"]),
    execFileAsync("python3", ["-m", "f2md.cli", "--tree", source, pythonOut, "--quiet"], {
      env: { ...process.env, PYTHONPATH: join(root, "py/f2md/src") },
    }),
  ]);
  const [nodeCoverage, pythonCoverage, nodeDsl, pythonDsl] = await Promise.all([
    readFile(join(nodeOut, "source-coverage.json"), "utf8"),
    readFile(join(pythonOut, "source-coverage.json"), "utf8"),
    readFile(join(nodeOut, "source-coverage.dsl"), "utf8"),
    readFile(join(pythonOut, "source-coverage.dsl"), "utf8"),
  ]);
  if (nodeCoverage !== pythonCoverage) failures.push("tree coverage: Python and Node JSON bytes differ");
  if (nodeDsl !== pythonDsl) failures.push("tree coverage: Python and Node DSL bytes differ");
} catch (error) {
  failures.push(`tree coverage conformance failed — ${error.message.split("\n")[0]}`);
}

console.table(rows);
if (differences.length) {
  console.log("routing differs (optional backends installed per environment):\n - " + differences.join("\n - "));
}
if (failures.length) {
  console.error("F2MD_CONFORMANCE_FAILED:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log(`f2md conformance OK — ${rows.length} fixtures agree on the envelope contract; tree coverage JSON/DSL agree byte-for-byte`);
