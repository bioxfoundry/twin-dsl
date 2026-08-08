import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { analyzeZipFile, materializeArchiveGeometry } from "../src/ingestion/archive-project.js";
import { scanSources } from "../src/ingestion/scanner.js";

const run = promisify(execFile);

async function fixtureZip(root: string): Promise<string> {
  const path = join(root,"project.zip");
  const script = [
    "import sys,zipfile",
    "p=sys.argv[1]",
    "z=zipfile.ZipFile(p,'w')",
    "z.writestr('device/README.md','# Device\\n')",
    "z.writestr('device/export/device_assembly.obj','v 0 0 0\\nv 1 0 0\\nv 0 1 0\\nvn 0 0 1\\nf 1//1 2//1 3//1\\n')",
    "z.writestr('../escape.stl',b'unsafe')",
    "z.close()",
  ].join(";");
  await run("python3",["-c",script,path]);
  return path;
}

test("archive scanner indexes above legacy list limit and rejects zip-slip metadata", async () => {
  const root=await mkdtemp(join(tmpdir(),"archive-project-")),archive=await fixtureZip(root);
  const old=process.env.DT_MAX_ARCHIVE_FILES;process.env.DT_MAX_ARCHIVE_FILES="1";
  try {
    const scanned=await scanSources([{path:archive,role:"archive",logicalRoot:"subactor://fixture/archive"}]);
    assert.equal(scanned.archiveAnalyses.length,1);
    assert.equal(scanned.archiveAnalyses[0].coverage.entries,3);
    assert.equal(scanned.archiveAnalyses[0].coverage.unsafeEntries,1);
    assert.ok(scanned.resources.some((resource)=>resource.labels?.includes("archive-analysis")));
    assert.ok(!scanned.resources.some((resource)=>resource.sourcePath.includes("escape.stl")));
    assert.ok(scanned.warnings.some((warning)=>warning.includes("ARCHIVE_FINDING_SUMMARY:ARCHIVE_UNSAFE_PATH:1:")));
  } finally {
    if(old===undefined)delete process.env.DT_MAX_ARCHIVE_FILES;else process.env.DT_MAX_ARCHIVE_FILES=old;
  }
});

test("archive materializer writes only selected safe geometry with actual content hash", async () => {
  const root=await mkdtemp(join(tmpdir(),"archive-materialize-")),archive=await fixtureZip(root),out=join(root,"out");
  const analysis=await analyzeZipFile(archive),receipt=await materializeArchiveGeometry(analysis,out);
  assert.equal(receipt.coverage.materialized,1);
  const entry=receipt.entries.find((candidate)=>candidate.entryPath.endsWith("device_assembly.obj"));
  assert.equal(entry?.status,"materialized");
  const bytes=await readFile(entry!.outputPath!);
  assert.equal(entry?.sha256,createHash("sha256").update(bytes).digest("hex"));
  assert.ok(!receipt.entries.some((candidate)=>candidate.entryPath.includes("escape")));
});

test("directory scanner excludes dashboard transport logs from autonomous source snapshots", async () => {
  const root=await mkdtemp(join(tmpdir(),"scanner-runtime-log-"));
  await mkdir(join(root,"logs"));
  await writeFile(join(root,"logs","dashboard-7445.log"),'{"event":"iteration:complete"}\n');
  await writeFile(join(root,"logs","runtime.jsonl"),'{"metric":"temperature","value":37}\n');

  const scanned=await scanSources([{path:root,role:"runtime",logicalRoot:"subactor://fixture/runtime"}]);
  assert.ok(!scanned.resources.some((resource)=>resource.sourcePath.endsWith("dashboard-7445.log")));
  assert.ok(scanned.resources.some((resource)=>resource.sourcePath.endsWith("runtime.jsonl")));
});

test("archive scanner ingests selected embedded C/C++ sources as evidence text", async () => {
  const root=await mkdtemp(join(tmpdir(),"archive-source-")),archive=join(root,"firmware.zip");
  await run("python3",["-c",[
    "import sys,zipfile", "z=zipfile.ZipFile(sys.argv[1],'w')",
    "z.writestr('firmware/config.h','#define STEPS_PER_MM 80\\n')",
    "z.writestr('firmware/main.cpp','#include \\\"config.h\\\"\\n')", "z.close()",
  ].join(";"),archive]);
  const scanned=await scanSources([{path:archive,role:"archive",logicalRoot:"subactor://fixture/firmware"}]);
  assert.ok([...scanned.texts.values()].some((text)=>text.includes("STEPS_PER_MM")));
  assert.ok(!scanned.warnings.some((warning)=>warning.includes("ARCHIVE_SELECTED_TEXT_NOT_TEXT")));
});
