/**
 * The ClickHouse projection is only exercised when DT_SEARCH_BACKEND=clickhouse and a reachable
 * server exists, so these cover the two things that silently broke that path: the DateTime64
 * encoding rejected by JSONEachRow, and the credentials the official image now requires.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ClickHouseHttpProjection, clickHouseDateTime64 } from "../src/adapters/clickhouse.js";
import type { ResourceRecord } from "../src/core/types.js";

const resource: ResourceRecord = {
  schema: "subactor.resource/v1",
  id: "r",
  uri: "urn:r",
  logicalUri: "subactor://r",
  mediaType: "text/markdown",
  sha256: "a".repeat(64),
  size: 4,
  sourcePath: "doc.md",
  sourceRole: "project",
  derived: false,
  derivedFrom: [],
  createdAt: "2026-08-07T09:11:08.364Z",
};

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS");
  return { server, url: `http://127.0.0.1:${address.port}` };
}
async function stop(server: Server): Promise<void> {
  await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
}

test("DateTime64 values are encoded the way JSONEachRow accepts them", () => {
  // ClickHouse rejects the ISO 'T'/'Z' form with CANNOT_PARSE_INPUT_ASSERTION_FAILED.
  assert.equal(clickHouseDateTime64("2026-08-07T09:11:08.364Z"), "2026-08-07 09:11:08.364");
  assert.equal(clickHouseDateTime64("2026-08-07T11:11:08.364+02:00"), "2026-08-07 09:11:08.364");
  assert.equal(clickHouseDateTime64("2026-08-07T09:11:08Z"), "2026-08-07 09:11:08.000");
  assert.match(clickHouseDateTime64("2026-08-07"), /^2026-08-07 00:00:00\.000$/);
  assert.throws(() => clickHouseDateTime64("not a date"), /CLICKHOUSE_INVALID_DATETIME/);
});

test("upsert sends a parseable timestamp and no ISO separator", async () => {
  let body = "";
  const ch = await start((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      body = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200).end("");
    });
  });
  try {
    await new ClickHouseHttpProjection(ch.url, "p").upsert(resource, "hello");
    const row = JSON.parse(body.split("\n").at(-1) ?? "{}") as { created_at: string };
    assert.equal(row.created_at, "2026-08-07 09:11:08.364");
    assert.doesNotMatch(row.created_at, /[TZ]/);
  } finally {
    await stop(ch.server);
  }
});

test("credentials travel as headers, never in the URL", async () => {
  let seen: Record<string, string | string[] | undefined> = {};
  let path = "";
  const ch = await start((req, res) => {
    seen = req.headers;
    path = req.url ?? "";
    req.resume();
    req.on("end", () => res.writeHead(200).end('{"ok":1}\n'));
  });
  try {
    await new ClickHouseHttpProjection(ch.url, "p", "digital_twin", "secret").query("SELECT 1");
    assert.equal(seen["x-clickhouse-user"], "digital_twin");
    assert.equal(seen["x-clickhouse-key"], "secret");
    assert.doesNotMatch(path, /secret/, "credentials must not reach the query string or logs");
  } finally {
    await stop(ch.server);
  }
});

test("no credentials configured means no auth headers", async () => {
  let seen: Record<string, string | string[] | undefined> = {};
  const ch = await start((req, res) => {
    seen = req.headers;
    req.resume();
    req.on("end", () => res.writeHead(200).end('{"ok":1}\n'));
  });
  try {
    await new ClickHouseHttpProjection(ch.url, "p", "", "").query("SELECT 1");
    assert.equal(seen["x-clickhouse-user"], undefined);
    assert.equal(seen["x-clickhouse-key"], undefined);
  } finally {
    await stop(ch.server);
  }
});
