import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evaluation = JSON.parse(await readFile(new URL("../data/model-evaluation.json", import.meta.url), "utf8"));
const era = JSON.parse(await readFile(new URL("../data/era-rankings.json", import.meta.url), "utf8"));

test("holdout evaluation is temporal and contains enough bouts", () => {
  assert.equal(evaluation.scope.training, "1958–2019");
  assert.equal(evaluation.scope.holdout, "2020–2026");
  assert.ok(evaluation.scope.holdoutBouts > 80_000);
});

test("published v2 improves probabilistic holdout score over Elo", () => {
  assert.ok(evaluation.overall.holdout.dohyoV2.logLoss < evaluation.overall.holdout.elo.logLoss);
  assert.ok(evaluation.overall.holdout.dohyoV2.brier < evaluation.overall.holdout.elo.brier);
});

test("experimental v3 does not overclaim and remains competitive", () => {
  assert.equal(evaluation.v3.status, "experimental");
  assert.ok(evaluation.overall.holdout.dohyoV3.logLoss <= evaluation.overall.holdout.dohyoV2.logLoss);
});

test("published era ranking uses Japanese names", () => {
  assert.equal(era.status, "experimental");
  assert.ok(era.ranking.length >= 100);
  assert.equal(era.ranking.filter((rikishi) => /^[ -~]+$/.test(rikishi.name)).length, 0);
});
