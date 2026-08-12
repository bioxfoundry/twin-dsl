#!/usr/bin/env node
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "error", "catalog.json");
const outputDir = join(root, "error");
const bootstrap = process.argv.includes("--bootstrap");
const write = bootstrap || process.argv.includes("--write");
const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".html"]);
const CODE = /^(?:[A-Z][A-Z0-9_-]{2,}|[a-z][a-z0-9_-]{2,})$/;
const CODE_CARRIER_FILES = new Set([
  "src/geometry/build-contract.ts",
  "src/runtime/presentation-evidence.ts",
  "src/scene/blueprint.ts",
  "src/scene/physical-evidence.ts",
]);
const NON_ERROR_TOKENS = new Set([
  "END_PRESENTATION_EVIDENCE",
  "PRESENTATION_CAMERA",
  "PRESENTATION_CAPTURE",
  "PRESENTATION_EVIDENCE",
  "PRESENTATION_RENDERER",
]);

async function exists(path) {
  try { await readFile(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function sourceFiles() {
  const roots = [join(root, "src"), join(root, "scripts"), join(root, "public")];
  const packages = join(root, "js");
  try {
    for (const entry of await readdir(packages, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(packages, entry.name, "src"));
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const files = [];
  const walk = async (directory) => {
    try {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  };
  for (const directory of roots) await walk(directory);
  for (const name of ["Makefile", "app.doql.less"]) {
    const path = join(root, name);
    if (await exists(path)) files.push(path);
  }
  return files.sort();
}

function add(found, code, file, surface) {
  if (!CODE.test(code) || NON_ERROR_TOKENS.has(code) || code.endsWith("_") || (!code.includes("_") && !code.includes("-"))) return;
  const current = found.get(code) ?? { sources: new Set(), surfaces: new Set() };
  current.sources.add(relative(root, file));
  current.surfaces.add(surface);
  found.set(code, current);
}

async function scanErrors() {
  const found = new Map();
  const unstructured = [];
  for (const file of await sourceFiles()) {
    const body = await readFile(file, "utf8");
    const patterns = [
      { surface: "exception", expression: /new Error\s*\(\s*[`"']([A-Z][A-Z0-9_]{2,})/g },
      { surface: "exception", expression: /\bfail\s*\(\s*[`"']([A-Z][A-Z0-9_]{2,})/g },
      { surface: "response", expression: /(?:error|errorCode|unavailableReason)\s*:\s*[`"']([A-Za-z][A-Za-z0-9_-]{2,})/g },
      { surface: "response", expression: /\bsendError\s*\(\s*[^,]+,\s*[^,]+,\s*[`"']([A-Za-z][A-Za-z0-9_-]{2,})/g },
      { surface: "diagnostic", expression: /(?:code)\s*:\s*[`"']([A-Z][A-Z0-9_]{2,})/g },
      { surface: "diagnostic", expression: /\bprocessFinding\s*\(\s*[`"']([A-Z][A-Z0-9_]{2,})/g },
      { surface: "diagnostic", expression: /const\s+[A-Z][A-Z0-9_]*ERROR[A-Z0-9_]*\s*=\s*[`"']([A-Z][A-Z0-9_]{2,})/g },
      { surface: "operator", expression: /echo\s+["'][^"']*?([A-Z][A-Z0-9_]{2,}):/g },
    ];
    for (const { surface, expression } of patterns) {
      for (const match of body.matchAll(expression)) add(found, match[1], file, surface);
    }
    const local = relative(root, file);
    for (const match of body.matchAll(/new Error\s*\(\s*([`"'])([^`"'\r\n]*)\1/g)) {
      const literal = match[2];
      const stable = /^([A-Z][A-Z0-9_]{2,})(?=:|$)/.test(literal);
      const delegated = literal.startsWith("${error}:") || literal.startsWith("${code}_");
      const finiteFamily = literal.startsWith("BAD_${") || literal.startsWith("SOURCE_COVERAGE_${");
      if (!stable && !delegated && !finiteFamily) {
        const line = body.slice(0, match.index).split("\n").length;
        unstructured.push(`${local}:${line}:${literal.slice(0, 80)}`);
      }
    }
    if (CODE_CARRIER_FILES.has(local)) {
      for (const match of body.matchAll(/[`"']([A-Z][A-Z0-9_]{2,})(?::[^`"']*)?[`"']/g)) {
        add(found, match[1], file, "diagnostic");
      }
    }
    // Validators append record indexes to stable codes through template literals.  Retain the
    // code prefix in the catalog instead of making an indexed validation error undocumented.
    for (const match of body.matchAll(/`([A-Z][A-Z0-9_]{2,})(?=[:$])/g)) {
      add(found, match[1], file, "exception");
    }
    if (local === "src/runtime/project-integrity.ts") {
      for (const match of body.matchAll(/\badd\("([A-Z][A-Z0-9_]{2,})"/g)) add(found, match[1], file, "diagnostic");
    }
    if (local === "scripts/verify-web-models.mjs" || local === "scripts/install-web-models.mjs") {
      for (const match of body.matchAll(/\bfail\("([A-Z][A-Z0-9_]{2,})"/g)) add(found, match[1], file, "exception");
    }
    if (local === "src/runtime/source-coverage.ts") {
      for (const match of body.matchAll(/\binvalid\("([A-Z][A-Z0-9_]+)"\)/g)) {
        add(found, `SOURCE_COVERAGE_${match[1]}`, file, "exception");
      }
    }
    if (local === "src/dsl/dql.ts") {
      for (const match of body.matchAll(/positiveInt\([^,]+,'([A-Z][A-Z0-9_]+)'/g)) {
        add(found, `BAD_${match[1]}`, file, "exception");
      }
    }
    if (local === "src/dsl/math.ts") {
      for (const match of body.matchAll(/\['([A-Z]+)','(?:eq|gte|lte|gt|lt)'\]/g)) {
        add(found, `BAD_${match[1]}`, file, "exception");
      }
    }
  }
  if (unstructured.length) throw new Error(`ERROR_LITERAL_UNSTANDARDIZED:${unstructured.join("|")}`);
  return found;
}

const SUFFIXES = [
  "UNKNOWN_KEY", "NOT_CONFIGURED", "NOT_AVAILABLE", "NOT_GROUNDED", "NOT_FOUND",
  "OUTSIDE_PROJECT", "TOO_LARGE", "ALREADY_RUNNING", "ALREADY_STARTED", "IN_PROGRESS",
  "HASH_MISMATCH", "REVISION_MISMATCH", "VERSION_MISMATCH", "MISMATCH", "DRIFT", "CONTRADICTORY",
  "DUPLICATE", "READ_ONLY", "FORBIDDEN", "UNSAFE_PATH", "REQUIRED", "MISSING", "INVALID",
  "REJECTED", "FAILED", "FAILURE", "LIMIT", "HTTP", "EXIT",
];

function words(value) {
  return value.toLowerCase().split("_").filter(Boolean).join(" ");
}

function title(code) {
  const value = words(code);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function splitCode(code) {
  const normalized = code.toUpperCase();
  const suffix = SUFFIXES.find((candidate) => normalized === candidate || normalized.endsWith(`_${candidate}`));
  const subject = suffix ? code.slice(0, -(suffix.length + 1)) : code;
  return { suffix, subject: words(subject || code) };
}

function subsystem(code) {
  const prefixes = [
    "SCENE_BLUEPRINT", "PHYSICAL_EVIDENCE", "SOURCE_COVERAGE", "GEOMETRY_DEPENDENCY",
    "GEOMETRY_BUILD", "PRESENTATION_EVIDENCE", "MUTATION_APPLY", "MUTATION_GRANT",
    "LIVING_PROJECT", "DASHBOARD", "OPENROUTER", "TODO2CODE", "TWIN_PROBES",
    "OBSERVATION", "IMPROVEMENT", "PROJECT", "ARCHIVE", "SCENE", "TWIN", "PATCH",
  ];
  const normalized = code.toUpperCase();
  return words(prefixes.find((prefix) => normalized.startsWith(prefix)) ?? code.split("_")[0]);
}

function semantics(code) {
  const normalized = code.toUpperCase();
  const { suffix, subject } = splitCode(code);
  if (["HTTP", "EXIT", "NOT_AVAILABLE", "NOT_CONFIGURED"].includes(suffix)) return {
    errorClass: "availability", retryable: true,
    meaning: `The ${subject} dependency or operation was unavailable at the runtime boundary.`,
    causes: ["the service or executable is not running", "configuration, network access or the selected adapter is unavailable"],
    impact: "The requested stage cannot complete, but persisted accepted artifacts remain unchanged.",
    resolution: "Inspect the detail following the code, verify service/tool health and configuration, then retry when the dependency is available.",
  };
  if (["FORBIDDEN", "UNSAFE_PATH", "READ_ONLY", "REJECTED"].includes(suffix) || /AUTHORITY|APPROVAL|GRANT|POLICY/.test(normalized)) return {
    errorClass: "policy", retryable: false,
    meaning: `The ${subject} operation was refused by an explicit safety or authority boundary.`,
    causes: ["the requested action is outside the allowed policy", "required approval, grounding or mutation authority is absent"],
    impact: "The operation is not applied; existing accepted state is preserved.",
    resolution: "Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.",
  };
  if (["MISMATCH", "HASH_MISMATCH", "REVISION_MISMATCH", "VERSION_MISMATCH", "DRIFT", "DUPLICATE", "CONTRADICTORY", "NOT_GROUNDED"].includes(suffix)) return {
    errorClass: "integrity", retryable: false,
    meaning: `The ${subject} evidence is internally inconsistent or does not match its bound identity.`,
    causes: ["artifacts from different revisions were combined", "an identity, digest, path or relationship is duplicated or inconsistent"],
    impact: "The runtime cannot prove that the candidate describes one coherent project state.",
    resolution: "Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.",
  };
  if (["IN_PROGRESS", "ALREADY_RUNNING", "ALREADY_STARTED", "LIMIT", "TOO_LARGE"].includes(suffix) || /LEASE_HELD/.test(normalized)) return {
    errorClass: "state", retryable: true,
    meaning: `The ${subject} operation cannot proceed in the current bounded runtime state.`,
    causes: ["another writer or operation is active", "a configured size, time or concurrency budget was reached"],
    impact: "The current request is delayed or refused without replacing accepted state.",
    resolution: "Wait for the active operation to finish or reduce the bounded input; change limits only through an explicit reviewed configuration.",
  };
  if (["INVALID", "REQUIRED", "MISSING", "NOT_FOUND", "UNKNOWN_KEY"].includes(suffix) || normalized.startsWith("BAD_")) return {
    errorClass: "configuration", retryable: false,
    meaning: `The ${subject} input does not satisfy the required deterministic contract.`,
    causes: ["a required field or resource is missing", "a value, key, type, identifier or schema version is invalid"],
    impact: "Validation stops before the malformed input can mutate or publish runtime state.",
    resolution: "Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.",
  };
  return {
    errorClass: "state", retryable: false,
    meaning: `The runtime stopped because it detected the ${words(code)} condition.`,
    causes: ["the named runtime invariant was not satisfied", "an upstream stage supplied incomplete or inconsistent state"],
    impact: "The affected operation does not complete and must not be reported as successful.",
    resolution: "Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.",
  };
}

function initialEntry(code) {
  const semantic = semantics(code);
  return {
    code,
    title: title(code),
    subsystem: subsystem(code),
    defaultSeverity: /NOTICE|WARNING/.test(code.toUpperCase()) ? "warning" : "error",
    ...semantic,
  };
}

function markdownList(values) {
  return values.map((value) => `- ${value}`).join("\n");
}

function page(entry, occurrence) {
  return `---
schema: bioxfoundry.error-page/v1
code: ${entry.code}
source: error/catalog.json
generated: true
---

# ${entry.code} — ${entry.title}

- Subsystem: \`${entry.subsystem}\`
- Severity: \`${entry.defaultSeverity}\`
- Error class: \`${entry.errorClass}\`
- Retryable: \`${entry.retryable}\`
- Surfaces: ${[...occurrence.surfaces].sort().map((value) => `\`${value}\``).join(", ")}

## Meaning

${entry.meaning}

## Likely causes

${markdownList(entry.causes)}

## Impact

${entry.impact}

## Resolution

${entry.resolution}

## Emitted by

${markdownList([...occurrence.sources].sort().map((value) => `\`${value}\``))}
`;
}

function index(entries) {
  return `# Runtime error catalog

\`catalog.json\` is the semantic source of truth. The Markdown pages are
deterministic projections enriched with source locations discovered by
\`scripts/error-catalog.mjs\`. Do not edit generated pages directly.

| Code | Subsystem | Class | Retryable |
| --- | --- | --- | --- |
${entries.map((entry) => `| [${entry.code}](./${entry.code}.md) | ${entry.subsystem} | ${entry.errorClass} | ${entry.retryable} |`).join("\n")}
`;
}

async function loadCatalog() {
  try { return JSON.parse(await readFile(catalogPath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return { schema: "bioxfoundry.error-catalog/v1", entries: [] }; throw error; }
}

async function markdownFiles() {
  try { return (await readdir(outputDir)).filter((name) => name.endsWith(".md")).sort(); }
  catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}

const found = await scanErrors();
let catalog = await loadCatalog();
if (bootstrap) {
  const existing = new Map((catalog.entries ?? []).map((entry) => [entry.code, entry]));
  catalog = {
    schema: "bioxfoundry.error-catalog/v1",
    entries: [...found.keys()].sort().map((code) => existing.get(code) ?? initialEntry(code)),
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
}

if (catalog.schema !== "bioxfoundry.error-catalog/v1" || !Array.isArray(catalog.entries)) {
  throw new Error("ERROR_CATALOG_INVALID");
}
const registered = new Map();
for (const entry of catalog.entries) {
  if (!CODE.test(entry.code)) throw new Error(`ERROR_CATALOG_CODE_INVALID:${entry.code}`);
  if (registered.has(entry.code)) throw new Error(`ERROR_CATALOG_CODE_DUPLICATE:${entry.code}`);
  for (const field of ["title", "subsystem", "defaultSeverity", "errorClass", "meaning", "impact", "resolution"]) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) throw new Error(`ERROR_CATALOG_FIELD_INVALID:${entry.code}:${field}`);
  }
  if (!Array.isArray(entry.causes) || entry.causes.length === 0 || entry.causes.some((cause) => typeof cause !== "string" || !cause.trim())) {
    throw new Error(`ERROR_CATALOG_FIELD_INVALID:${entry.code}:causes`);
  }
  if (typeof entry.retryable !== "boolean") throw new Error(`ERROR_CATALOG_FIELD_INVALID:${entry.code}:retryable`);
  registered.set(entry.code, entry);
}

const undocumented = [...found.keys()].filter((code) => !registered.has(code)).sort();
const orphaned = [...registered.keys()].filter((code) => !found.has(code)).sort();
if (undocumented.length || orphaned.length) {
  process.stderr.write(JSON.stringify({ error: "ERROR_CATALOG_COVERAGE", undocumented, orphaned }, null, 2) + "\n");
  process.exit(1);
}

const entries = [...registered.values()].sort((left, right) => left.code.localeCompare(right.code));
const expected = new Map([["README.md", index(entries)]]);
for (const entry of entries) expected.set(`${entry.code}.md`, page(entry, found.get(entry.code)));

if (write) {
  await mkdir(outputDir, { recursive: true });
  for (const name of await markdownFiles()) {
    if (expected.has(name)) continue;
    const content = await readFile(join(outputDir, name), "utf8");
    if (content.includes("generated: true")) await unlink(join(outputDir, name));
  }
  for (const [name, content] of expected) await writeFile(join(outputDir, name), content);
}

const actual = await markdownFiles();
const missing = [...expected.keys()].filter((name) => !actual.includes(name)).sort();
const unexpected = actual.filter((name) => !expected.has(name)).sort();
const changed = [];
for (const [name, content] of expected) {
  try { if (await readFile(join(outputDir, name), "utf8") !== content) changed.push(name); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
if (missing.length || unexpected.length || changed.length) {
  process.stderr.write(JSON.stringify({ error: "ERROR_DOCS_DRIFT", missing, unexpected, changed }, null, 2) + "\n");
  process.exit(1);
}

process.stdout.write(JSON.stringify({ schema: catalog.schema, codes: entries.length, pages: expected.size, status: "ok" }) + "\n");
