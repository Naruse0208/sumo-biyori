import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes a prominent shared navigation for all rating lab routes", async () => {
  const [rate, validation, era, labNavigation] = await Promise.all([
    readFile(new URL("app/rate/page.tsx", root), "utf8"),
    readFile(new URL("app/rate/validation/page.tsx", root), "utf8"),
    readFile(new URL("app/rate/era/page.tsx", root), "utf8"),
    readFile(new URL("app/rate/rate-lab-nav.tsx", root), "utf8"),
  ]);

  assert.match(rate, /<RateLabNav active="ranking" \/>/);
  assert.match(validation, /<RateLabNav active="validation" \/>/);
  assert.match(era, /<RateLabNav active="era" \/>/);
  assert.match(labNavigation, /href: "\/rate"/);
  assert.match(labNavigation, /href: "\/rate\/validation"/);
  assert.match(labNavigation, /href: "\/rate\/era"/);
  assert.match(validation, /og-model-lab\.png/);
  assert.match(validation, /未学習/);
  assert.match(era, /その場所の幕内平均から、どれほど抜けていたか/);
});

test("keeps prediction writes server-only and official-result driven", async () => {
  const [prediction, predictionService, liveRoute, liveClient, schema, migration] = await Promise.all([
    readFile(new URL("app/api/prediction/route.ts", root), "utf8"),
    readFile(new URL("app/lib/prediction-service.ts", root), "utf8"),
    readFile(new URL("app/api/live-sumo/route.ts", root), "utf8"),
    readFile(new URL("app/components/LiveSumo.tsx", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0004_quiet_sabretooth.sql", root), "utf8"),
  ]);

  assert.doesNotMatch(prediction, /predictionRecords|\.insert\(|\.update\(/);
  assert.match(predictionService, /syncOfficialPredictionRecords/);
  assert.match(predictionService, /isNull\(predictionRecords\.winnerNskId\)/);
  assert.match(liveRoute, /syncOfficialPredictionRecords/);
  assert.match(liveRoute, /claimSharedLiveSumoRefresh/);
  assert.doesNotMatch(liveClient, /prediction\/resolve|表示確認まで/);
  assert.match(schema, /prediction_records/);
  assert.match(schema, /live_sumo_cache/);
  assert.match(migration, /CREATE TABLE `live_sumo_cache`/);
});

test("loads full-basho rating deltas without exceeding D1 bind limits", async () => {
  const ratingsRoute = await readFile(new URL("app/api/ratings/route.ts", root), "utf8");

  assert.doesNotMatch(ratingsRoute, /inArray\(ratingSnapshots\.wrestlerId/);
  assert.match(ratingsRoute, /where\(eq\(ratingSnapshots\.bashoId, previousBashoId\)\)/);
});

test("keeps the home result rows simple, clickable, and profile-safe", async () => {
  const [home, liveSumo, header, comparePage, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/components/LiveSumo.tsx", root), "utf8"),
    readFile(new URL("app/components/SiteHeader.tsx", root), "utf8"),
    readFile(new URL("app/rate/compare/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.doesNotMatch(home, /土俵の美学|SUMO CULTURE|brand-crest/);
  assert.doesNotMatch(header, /brand-crest/);
  assert.match(liveSumo, /<h2>番付<\/h2>/);
  assert.doesNotMatch(liveSumo, /幕内番付|BANZUKE/);
  assert.match(liveSumo, /leftNsk=.*rightNsk=/);
  assert.match(liveSumo, /closest\("a, button"\)/);
  assert.match(liveSumo, /"終了"/);
  assert.match(comparePage, /optionFromNskId/);
  assert.match(styles, /\.live-timestamp-inline \{ display: flex;/);
  assert.match(styles, /grid-template-columns: \.95fr 2\.23fr/);
});

test("production bundle and social card exist", async () => {
  await Promise.all([
    access(new URL("dist/server/index.js", root)),
    access(new URL("dist/.openai/hosting.json", root)),
    access(new URL("public/og-model-lab.png", root)),
  ]);
});
