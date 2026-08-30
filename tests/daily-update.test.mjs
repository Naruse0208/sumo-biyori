import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { currentOrNextBashoId } from "../scripts/lib/rating-database.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("selects the next scheduled basho without a hard-coded end date", () => {
  assert.equal(currentOrNextBashoId(new Date("2026-08-30T00:00:00+09:00")), "202609");
  assert.equal(currentOrNextBashoId(new Date("2026-12-15T00:00:00+09:00")), "202701");
});

test("normalizes the official tournament id separately from YYYYMM", async () => {
  const source = await read("app/api/live-sumo/route.ts");
  assert.match(source, /officialBashoId/);
  assert.match(source, /normalizeCalendarBashoId/);
  assert.match(source, /loadBanzukeSidesFromDatabase\(bashoId\)/);
});

test("publishes recalculated ratings only after staging succeeds", async () => {
  const source = await read("app/lib/daily-rating-update.ts");
  assert.match(source, /rating_snapshot_staging/);
  assert.match(source, /DELETE FROM rating_snapshots WHERE basho_id/);
  assert.match(source, /INSERT INTO rating_snapshots[\s\S]*SELECT wrestler_id/);
  assert.match(source, /status = 'failed'/);
});

test("daily runner updates once and generates five highlights per sweep", async () => {
  const source = await read("scripts/run-daily-update.mjs");
  assert.match(source, /status\.dateKey !== clock\.date/);
  assert.match(source, /batchSize: 5/);
  assert.match(source, /05:00–10:59 JST/);
});

test("mutable import chunks use a versioned checkpoint", async () => {
  const source = await read("app/api/admin/import-ratings/route.ts");
  assert.match(source, /const batchId = `\$\{file\}:\$\{expectedRows\}`/);
  assert.match(source, /\.bind\(batchId, table, rows\.length\)/);
});
