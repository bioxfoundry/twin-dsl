#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { resolve } from "node:path";

function projectId(source) {
  const match = source.match(/^PROJECT\s+([^\s]+)\s*$/m);
  if (!match) throw new Error("DASHBOARD_PROJECT_ID_MISSING");
  return match[1];
}

function tcpOpen(host, port) {
  return new Promise((done) => {
    const socket = createConnection({ host, port });
    const finish = (value) => {
      socket.destroy();
      done(value);
    };
    socket.setTimeout(750);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function main() {
  const [configArg, portArg = "7331", host = "127.0.0.1"] = process.argv.slice(2);
  if (!configArg) throw new Error("usage: dashboard-port-check <project.projectdsl> [port] [host]");
  const port = Number(portArg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`DASHBOARD_PORT_INVALID:${portArg}`);
  const expectedProject = projectId(await readFile(resolve(configArg), "utf8"));
  const expectedTwin = `${expectedProject}-twin`;
  const url = `http://${host}:${port}/`;

  try {
    const response = await fetch(`${url}api/state`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) {
      const state = await response.json();
      const actualTwin = state?.active?.twin?.id ?? state?.twin?.id ?? "unknown";
      if (actualTwin === expectedTwin) {
        console.log(`DASHBOARD_PORT_REUSE:${url}:${actualTwin}`);
        return;
      }
      throw new Error(`DASHBOARD_PORT_CONFLICT:${host}:${port}:expected=${expectedTwin}:actual=${actualTwin}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("DASHBOARD_PORT_CONFLICT:")) throw error;
  }

  if (await tcpOpen(host, port)) throw new Error(`DASHBOARD_PORT_CONFLICT:${host}:${port}:expected=${expectedTwin}:actual=non-dashboard-service`);
  console.log(`DASHBOARD_PORT_FREE:${url}:${expectedTwin}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
