import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RUNTIME_PACKAGE_VERSION } from "../src/core/generation.js";

test("runtime trace version matches package.json", async () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const packageDocument = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version?: string };

  assert.equal(RUNTIME_PACKAGE_VERSION, packageDocument.version);
});
