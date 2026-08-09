import test from "node:test";
import assert from "node:assert/strict";
import { applyPatchDsl, parsePatchDsl, patchDslGbnf, patchEnvelopeSchema, renderPatchContext } from "../src/llm/patch-dsl.js";
import { canonicalJson, sha256 } from "../src/core/canonical.js";

function patch(base:unknown,...operations:string[]):string{return[
  'PATCHDSL "subactor.patch-dsl/v1"',
  'TARGET "scene"',
  `BASE_SHA256 "${sha256(canonicalJson(base))}"`,
  ...operations,
  'END_PATCH',
].join('\n');}

test('patchDSL is bound to target and baseline before deterministic application',()=>{
  const base={document:{id:'scene-1',bindings:[{id:'a'}]}};
  const changed=applyPatchDsl(base,patch(base,'SET "/document/id" "scene-2"'),{target:'scene',allowedRoots:['/document']}) as typeof base;
  assert.equal(changed.document.id,'scene-2');
  assert.equal(base.document.id,'scene-1','application does not mutate the baseline');
  assert.throws(()=>applyPatchDsl({document:{}},patch(base,'SET "/document/id" "x"'),{target:'scene',allowedRoots:['/document']}),/BASE_HASH_MISMATCH/);
  assert.throws(()=>applyPatchDsl(base,patch(base,'SET "/document/id" "x"'),{target:'twin',allowedRoots:['/document']}),/TARGET_MISMATCH/);
});

test('patchDSL refuses prose, unsafe pointers and paths outside the capability',()=>{
  const base={document:{id:'scene-1'},authority:{approved:false}};
  assert.throws(()=>parsePatchDsl('Here is your patch'),/PATCH_HEADER_INVALID/);
  assert.throws(()=>applyPatchDsl(base,patch(base,'SET "/authority/approved" true'),{target:'scene',allowedRoots:['/document']}),/PATH_FORBIDDEN/);
  assert.throws(()=>applyPatchDsl(base,patch(base,'SET "/document/__proto__/approved" true'),{target:'scene',allowedRoots:['/document']}),/POINTER_UNSAFE/);
});

test('every LLM context carries target schema, patch schema and GGML GBNF',()=>{
  assert.equal((patchEnvelopeSchema.properties as any).patchDsl.type,'string');
  assert.match(patchDslGbnf,/root ::= header target base operation\+ end/);
  const context=renderPatchContext({target:'math',request:'gate',base:{},context:{source:'urn:test'},allowedRoots:['/dsl']});
  assert.match(context,/LLM_CONTEXT/);assert.match(context,/BASE_SHA256/);assert.match(context,/ALLOWED_ROOTS_JSON/);
});
