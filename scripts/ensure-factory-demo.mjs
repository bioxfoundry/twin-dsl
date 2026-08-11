#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureFactoryDemo } from "../dist/src/project/factory-demo.js";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = resolve(sourceRoot, process.argv[2] ?? ".factory-demo/project");
const expectedRoot = resolve(sourceRoot, ".factory-demo/project");

process.stdout.write(`${JSON.stringify(await ensureFactoryDemo(demoRoot, expectedRoot))}\n`);
