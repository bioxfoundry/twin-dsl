"""Strict patchDSL boundary shared by every hosted-LLM path in f2md."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, List

PATCH_ENVELOPE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "schema": {"const": "subactor.patch-envelope/v1"},
        "patchDsl": {"type": "string", "minLength": 100, "maxLength": 500000},
    },
    "required": ["schema", "patchDsl"],
    "additionalProperties": False,
}

PATCH_DSL_GBNF = r'''root ::= "PATCHDSL \"subactor.patch-dsl/v1\"" newline "TARGET " json-string newline "BASE_SHA256 \"" hex64 "\"" newline operation+ "END_PATCH" newline?
operation ::= ("SET " json-string " " json-value | "REMOVE " json-string) newline
json-value ::= object | array | json-string | number | "true" | "false" | "null"
object ::= "{" ws (json-string ws ":" ws json-value (ws "," ws json-string ws ":" ws json-value)*)? ws "}"
array ::= "[" ws (json-value (ws "," ws json-value)*)? ws "]"
json-string ::= "\"" ([^"\\] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\""
number ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)? ([eE] [+-]? [0-9]+)?
hex64 ::= [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f] [0-9a-f]
ws ::= [ \t]*
newline ::= "\n"'''


def base_hash(base: Any) -> str:
    canonical = json.dumps(base, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _encoded(name: str, value: Any) -> str:
    return f"{name} {json.dumps(json.dumps(value, ensure_ascii=False, separators=(',', ':')))}"


def patch_messages(target: str, request: Any, base: Dict[str, Any], allowed_fields: List[str], target_schema: Dict[str, Any]) -> List[Dict[str, str]]:
    system = "\n".join([
        f'LLM_POLICY {json.dumps("subactor.llm-policy/v1")}',
        f"TARGET {json.dumps(target)}",
        _encoded("TARGET_SCHEMA_JSON", target_schema),
        _encoded("PATCH_ENVELOPE_SCHEMA_JSON", PATCH_ENVELOPE_SCHEMA),
        _encoded("PATCH_GBNF", PATCH_DSL_GBNF),
        f'RULE {json.dumps("Return only a JSON patch envelope; patchDsl must match PATCH_GBNF.")}',
        f'RULE {json.dumps("Never return prose or a completed artifact outside patchDsl.")}',
        "END_POLICY",
    ])
    user = "\n".join([
        f'LLM_CONTEXT {json.dumps("subactor.llm-context/v1")}',
        f"TARGET {json.dumps(target)}",
        f"BASE_SHA256 {json.dumps(base_hash(base))}",
        _encoded("BASE_JSON", base),
        _encoded("ALLOWED_FIELDS_JSON", allowed_fields),
        _encoded("REQUEST_JSON", request),
        "END_CONTEXT",
    ])
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def apply_patch_envelope(value: Any, target: str, base: Dict[str, Any], allowed_fields: List[str]) -> Dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"schema", "patchDsl"} or value.get("schema") != "subactor.patch-envelope/v1" or not isinstance(value.get("patchDsl"), str):
        raise ValueError("PATCH_ENVELOPE_INVALID")
    lines = value["patchDsl"].rstrip("\n").split("\n")
    if lines[0:1] != ['PATCHDSL "subactor.patch-dsl/v1"'] or lines[-1:] != ["END_PATCH"]:
        raise ValueError("PATCH_DSL_BOUNDARY_INVALID")
    if len(lines) < 5 or len(lines) > 132 or lines[1] != f"TARGET {json.dumps(target)}" or lines[2] != f"BASE_SHA256 {json.dumps(base_hash(base))}":
        raise ValueError("PATCH_DSL_BINDING_INVALID")
    result = json.loads(json.dumps(base))
    for line in lines[3:-1]:
        match = re.fullmatch(r'(SET|REMOVE) ("(?:[^"\\]|\\.)*")(?: ([\s\S]+))?', line)
        if not match or (match.group(1) == "SET") != (match.group(3) is not None):
            raise ValueError("PATCH_OPERATION_INVALID")
        path = json.loads(match.group(2))
        if not isinstance(path, str) or not re.fullmatch(r"/[A-Za-z][A-Za-z0-9_]*", path):
            raise ValueError("PATCH_PATH_INVALID")
        field = path[1:]
        if field not in allowed_fields:
            raise ValueError(f"PATCH_PATH_FORBIDDEN:{path}")
        if match.group(1) == "SET":
            result[field] = json.loads(match.group(3))
        else:
            result.pop(field, None)
    return result
