import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes the model scorecard and era lab routes", async () => {
  const [rate, validation, era] = await Promise.all([
    readFile(new URL("app/rate/page.tsx", root), "utf8"),
    readFile(new URL("app/rate/validation/page.tsx", root), "utf8"),
    readFile(new URL("app/rate/era/page.tsx", root), "utf8"),
  ]);

  assert.match(rate, /href="\/rate\/validation"/);
  assert.match(rate, /href="\/rate\/era"/);
  assert.match(validation, /og-model-lab\.png/);
  assert.match(validation, /未学習/);
  assert.match(era, /その場所の幕内平均から、どれほど抜けていたか/);
});

test("keeps prediction recording and result resolution wired", async () => {
  const [prediction, resolver, schema] = await Promise.all([
    readFile(new URL("app/api/prediction/route.ts", root), "utf8"),
    readFile(new URL("app/api/prediction/resolve/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(prediction, /predictionRecords/);
  assert.match(prediction, /onConflictDoNothing/);
  assert.match(resolver, /resolvedAt/);
  assert.match(schema, /prediction_records/);
});

test("production bundle and social card exist", async () => {
  await Promise.all([
    access(new URL("dist/server/index.js", root)),
    access(new URL("dist/.openai/hosting.json", root)),
    access(new URL("public/og-model-lab.png", root)),
  ]);
});
