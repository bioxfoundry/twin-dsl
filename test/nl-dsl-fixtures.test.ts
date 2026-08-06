import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NlDslCompiler } from "../src/llm/nl-dsl-compiler.js";
import type { DslKind } from "../src/core/types.js";

test('deterministic fixtures validate NL -> every DSL boundary',async()=>{
  const compiler=new NlDslCompiler(),text=await readFile('examples/nl-to-dsl/request.md','utf8');
  for(const kind of ['intent','resource','query','dql','tree','math','twin','scene'] as DslKind[]){const fixture=JSON.parse(await readFile(`examples/nl-to-dsl/${kind}.fixture.json`,'utf8'));const result=await compiler.compile({kind,text,mode:'deterministic',deterministicValue:fixture});assert.equal(result.kind,kind);assert.equal(result.canonicalHash.length,64);assert.equal(result.audit.effectiveMode,'deterministic');}
});
