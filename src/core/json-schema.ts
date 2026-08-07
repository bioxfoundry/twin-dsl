/**
 * Minimal JSON Schema evaluator covering exactly the vocabulary used by `schemas/*.json`
 * (no `$ref`, no `$defs`). It exists so the published schemas and the hand-written runtime
 * validators can be checked against each other instead of drifting apart silently.
 *
 * This is a conformance tool, not a general-purpose validator: an unsupported keyword is
 * reported rather than ignored, so the schemas can never quietly outgrow it.
 */
export interface SchemaViolation {
  path: string;
  message: string;
}

const IGNORED = new Set(["$schema", "$id", "title", "description", "examples", "default"]);
const SUPPORTED = new Set([
  "type", "const", "enum", "required", "properties", "additionalProperties", "items",
  "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum",
  "exclusiveMinimum", "exclusiveMaximum", "uniqueItems", "pattern", "oneOf", "anyOf", "allOf",
]);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeOf(value) === type;
}

/** Returns every way `value` fails `schema`; an empty array means it validates. */
export function checkJsonSchema(schema: unknown, value: unknown, path = ""): SchemaViolation[] {
  if (schema === true) return [];
  if (schema === false) return [{ path, message: "schema forbids any value" }];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return [{ path, message: "invalid schema node" }];
  }
  const s = schema as Record<string, unknown>;
  const out: SchemaViolation[] = [];

  for (const keyword of Object.keys(s)) {
    if (!SUPPORTED.has(keyword) && !IGNORED.has(keyword)) {
      out.push({ path, message: `unsupported schema keyword: ${keyword}` });
    }
  }

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [String(s.type)];
    if (!types.some((type) => matchesType(value, type))) {
      out.push({ path, message: `expected ${types.join("|")}, got ${typeOf(value)}` });
      return out; // Further keywords would only produce noise once the type is wrong.
    }
  }
  if (s.const !== undefined && JSON.stringify(value) !== JSON.stringify(s.const)) {
    out.push({ path, message: `expected const ${JSON.stringify(s.const)}` });
  }
  if (Array.isArray(s.enum) && !s.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))) {
    out.push({ path, message: `value not in enum ${JSON.stringify(s.enum)}` });
  }

  if (typeof value === "string") {
    if (typeof s.minLength === "number" && value.length < s.minLength) out.push({ path, message: `shorter than minLength ${s.minLength}` });
    if (typeof s.maxLength === "number" && value.length > s.maxLength) out.push({ path, message: `longer than maxLength ${s.maxLength}` });
    if (typeof s.pattern === "string" && !new RegExp(s.pattern).test(value)) out.push({ path, message: `does not match ${s.pattern}` });
  }

  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) out.push({ path, message: `below minimum ${s.minimum}` });
    if (typeof s.maximum === "number" && value > s.maximum) out.push({ path, message: `above maximum ${s.maximum}` });
    if (typeof s.exclusiveMinimum === "number" && value <= s.exclusiveMinimum) out.push({ path, message: `not above exclusiveMinimum ${s.exclusiveMinimum}` });
    if (typeof s.exclusiveMaximum === "number" && value >= s.exclusiveMaximum) out.push({ path, message: `not below exclusiveMaximum ${s.exclusiveMaximum}` });
  }

  if (Array.isArray(value)) {
    if (typeof s.minItems === "number" && value.length < s.minItems) out.push({ path, message: `fewer than minItems ${s.minItems}` });
    if (typeof s.maxItems === "number" && value.length > s.maxItems) out.push({ path, message: `more than maxItems ${s.maxItems}` });
    if (s.uniqueItems === true) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) out.push({ path, message: "items are not unique" });
    }
    if (s.items !== undefined) {
      value.forEach((item, index) => out.push(...checkJsonSchema(s.items, item, `${path}[${index}]`)));
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (s.properties ?? {}) as Record<string, unknown>;
    if (Array.isArray(s.required)) {
      for (const key of s.required as string[]) {
        if (!(key in record)) out.push({ path: `${path}.${key}`, message: "required property missing" });
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in record) out.push(...checkJsonSchema(child, record[key], `${path}.${key}`));
    }
    if (s.additionalProperties !== undefined) {
      for (const key of Object.keys(record)) {
        if (key in properties) continue;
        if (s.additionalProperties === false) out.push({ path: `${path}.${key}`, message: "additional property not allowed" });
        else if (typeof s.additionalProperties === "object") out.push(...checkJsonSchema(s.additionalProperties, record[key], `${path}.${key}`));
      }
    }
  }

  if (Array.isArray(s.allOf)) {
    for (const branch of s.allOf) out.push(...checkJsonSchema(branch, value, path));
  }
  if (Array.isArray(s.anyOf) && !s.anyOf.some((branch) => checkJsonSchema(branch, value, path).length === 0)) {
    out.push({ path, message: "matches no anyOf branch" });
  }
  if (Array.isArray(s.oneOf)) {
    const matched = s.oneOf.filter((branch) => checkJsonSchema(branch, value, path).length === 0).length;
    if (matched !== 1) out.push({ path, message: `matched ${matched} oneOf branches, expected exactly 1` });
  }

  return out;
}

export function matchesJsonSchema(schema: unknown, value: unknown): boolean {
  return checkJsonSchema(schema, value).length === 0;
}
