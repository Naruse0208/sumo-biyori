import assert from "node:assert/strict";
import test from "node:test";
import { symmetricGlickoProbability, updateGlicko2 } from "../scripts/lib/glicko2.mjs";

test("matches the worked Glicko-2 example", () => {
  const result = updateGlicko2(
    { rating: 1500, rd: 200, volatility: 0.06 },
    [
      { opponentRating: 1400, opponentRd: 30, score: 1 },
      { opponentRating: 1550, opponentRd: 100, score: 0 },
      { opponentRating: 1700, opponentRd: 300, score: 0 },
    ],
    { tau: 0.5 },
  );
  assert.ok(Math.abs(result.rating - 1464.06) < 0.02);
  assert.ok(Math.abs(result.rd - 151.52) < 0.02);
  assert.ok(Math.abs(result.volatility - 0.059996) < 0.00001);
});

test("inactivity preserves the mean and expands uncertainty", () => {
  const before = { rating: 1640, rd: 70, volatility: 0.06 };
  const after = updateGlicko2(before, []);
  assert.equal(after.rating, before.rating);
  assert.equal(after.volatility, before.volatility);
  assert.ok(after.rd > before.rd);
});

test("symmetric prediction complements when the wrestlers are swapped", () => {
  const east = { rating: 1810, rd: 80 };
  const west = { rating: 1690, rd: 120 };
  const first = symmetricGlickoProbability(east, west);
  const swapped = symmetricGlickoProbability(west, east);
  assert.ok(Math.abs(first + swapped - 1) < 1e-12);
  assert.ok(first > 0.5);
});
