import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { GLICKO2_DEFAULTS, updateGlicko2 } from "./lib/glicko2.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_PATH = join(ROOT, "work", "rating-audit", "rating-audit-199901-202607.sqlite");
const EVALUATION_PATH = join(ROOT, "data", "model-evaluation.json");
const ERA_PATH = join(ROOT, "data", "era-rankings.json");
const NAME_PATH = join(ROOT, "data", "rikishi-names.json");
const RATINGS_PATH = join(ROOT, "data", "ratings-latest.json");
const TRAIN_END_BASHO = 201911;
const TEST_START_BASHO = 202001;
const H2H_COEFFICIENT = 1.78;
const H2H_PRIOR_BOUTS = 8;
const V3_L2 = 0.02;
const V3_EPOCHS = 90;
const V3_LEARNING_RATE = 0.18;
const MODEL_IDS = ["elo", "glicko2", "dohyoV2", "dohyoV3"];
const DIVISION_NAMES = ["幕内", "十両", "幕下", "三段目", "序二段", "序ノ口"];

const database = new DatabaseSync(DATABASE_PATH);
database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const logistic = (value) => 1 / (1 + Math.exp(-value));
const logit = (probability) => Math.log(probability / (1 - probability));
const clampProbability = (probability) => clamp(probability, 0.01, 0.99);
const eloProbability = (first, second) => 1 / (1 + 10 ** ((second - first) / 400));

function glickoProbability(first, second) {
  const scale = 173.7178;
  const ratingDifference = (first.rating - second.rating) / scale;
  const combinedPhi = Math.sqrt(first.rd ** 2 + second.rd ** 2) / scale;
  const attenuation = 1 / Math.sqrt(1 + (3 * combinedPhi ** 2) / Math.PI ** 2);
  return logistic(attenuation * ratingDifference);
}

function getGlicko(states, wrestlerId) {
  if (!states.has(wrestlerId)) states.set(wrestlerId, {
    rating: GLICKO2_DEFAULTS.rating,
    rd: GLICKO2_DEFAULTS.rd,
    volatility: GLICKO2_DEFAULTS.volatility,
  });
  return states.get(wrestlerId);
}

function styleCategory(kimarite) {
  const value = String(kimarite ?? "").toLowerCase();
  if (/^(oshi|tsuki|okuri|hataki|hiki)/.test(value)) return "push";
  if (/^(yori|tsuri|kimi|abise)/.test(value)) return "belt";
  if (/(nage|gake|sukui|katasukashi|kirikaeshi|utchari)/.test(value)) return "throw";
  return "other";
}

function getStyle(states, wrestlerId) {
  if (!states.has(wrestlerId)) states.set(wrestlerId, {
    push: 0,
    belt: 0,
    throw: 0,
    other: 0,
  });
  return states.get(wrestlerId);
}

function styleShares(state) {
  const total = state.push + state.belt + state.throw + state.other + 8;
  return {
    push: (state.push + 2) / total,
    belt: (state.belt + 2) / total,
    throw: (state.throw + 2) / total,
    other: (state.other + 2) / total,
  };
}

function addGlickoResult(results, wrestlerId, opponentState, score) {
  if (!results.has(wrestlerId)) results.set(wrestlerId, []);
  results.get(wrestlerId).push({
    opponentRating: opponentState.rating,
    opponentRd: opponentState.rd,
    score,
  });
}

function modelMetrics(rows, probabilityKey) {
  let brier = 0;
  let logLoss = 0;
  let correct = 0;
  let upsets = 0;
  for (const row of rows) {
    const probability = clampProbability(row[probabilityKey]);
    const error = probability - row.actual;
    brier += error ** 2;
    logLoss -= row.actual * Math.log(probability) + (1 - row.actual) * Math.log(1 - probability);
    correct += (probability >= 0.5) === Boolean(row.actual) ? 1 : 0;
    upsets += (probability >= 0.5) !== Boolean(row.actual) ? 1 : 0;
  }
  const count = Math.max(rows.length, 1);
  return {
    bouts: rows.length,
    accuracy: Number((correct / count).toFixed(4)),
    brier: Number((brier / count).toFixed(6)),
    logLoss: Number((logLoss / count).toFixed(6)),
    upsetRate: Number((upsets / count).toFixed(4)),
  };
}

function summarizeModels(rows) {
  return Object.fromEntries(MODEL_IDS.map((modelId) => [modelId, modelMetrics(rows, `${modelId}Probability`)]));
}

function calibration(rows, probabilityKey) {
  return Array.from({ length: 10 }, (_, index) => {
    const minimum = index / 10;
    const maximum = (index + 1) / 10;
    const bucket = rows.filter((row) => {
      const probability = row[probabilityKey];
      return probability >= minimum && (index === 9 ? probability <= maximum : probability < maximum);
    });
    const count = bucket.length || 1;
    return {
      bucket: `${index * 10}–${(index + 1) * 10}%`,
      bouts: bucket.length,
      predicted: Number((bucket.reduce((sum, row) => sum + row[probabilityKey], 0) / count).toFixed(4)),
      actual: Number((bucket.reduce((sum, row) => sum + row.actual, 0) / count).toFixed(4)),
    };
  });
}

function fitV3(rows) {
  const training = rows.filter((row) => row.bashoId <= TRAIN_END_BASHO);
  const weights = Array.from({ length: 5 }, () => 0);
  for (let epoch = 0; epoch < V3_EPOCHS; epoch += 1) {
    const gradient = Array.from({ length: weights.length }, () => 0);
    for (const row of training) {
      const probability = logistic(logit(row.dohyoV2Probability) + row.features.reduce(
        (sum, feature, index) => sum + feature * weights[index],
        0,
      ));
      const error = probability - row.actual;
      for (let index = 0; index < weights.length; index += 1) {
        gradient[index] += error * row.features[index];
      }
    }
    for (let index = 0; index < weights.length; index += 1) {
      gradient[index] = gradient[index] / training.length + V3_L2 * weights[index];
      weights[index] -= V3_LEARNING_RATE * gradient[index];
    }
  }
  return weights;
}

function fitCalibrationSlope(rows, rawProbabilityKey) {
  const training = rows.filter((row) => row.bashoId <= TRAIN_END_BASHO);
  let slope = 1;
  for (let epoch = 0; epoch < 120; epoch += 1) {
    let gradient = 0;
    for (const row of training) {
      const rawLogit = logit(clampProbability(row[rawProbabilityKey]));
      const probability = logistic(slope * rawLogit);
      gradient += (probability - row.actual) * rawLogit;
    }
    slope = clamp(slope - 0.3 * gradient / training.length, 0.2, 2);
  }
  return slope;
}

const wrestlers = new Map(database.prepare(`
  SELECT id, sumodb_id AS sumodbId, nsk_id AS nskId, shikona_jp AS shikonaJp,
    shikona_en AS shikonaEn, height_cm AS heightCm, weight_kg AS weightKg
  FROM wrestlers
`).all().map((row) => [row.id, row]));
const bashoIds = database.prepare("SELECT DISTINCT basho_id FROM bouts ORDER BY basho_id").all().map((row) => Number(row.basho_id));
const boutsForBasho = database.prepare(`
  SELECT id, CAST(basho_id AS INTEGER) AS bashoId, division, day,
    wrestler_a_id AS wrestlerAId, wrestler_b_id AS wrestlerBId, winner_id AS winnerId,
    kimarite, wrestler_a_elo_before AS wrestlerAEloBefore,
    wrestler_b_elo_before AS wrestlerBEloBefore
  FROM bouts
  WHERE basho_id = ?
  ORDER BY day, division, id
`);

let glickoStates = new Map();
const pairStates = new Map();
const styleStates = new Map();
const rows = [];
let kimariteKnown = 0;
let bodyKnown = 0;

for (const [bashoIndex, bashoId] of bashoIds.entries()) {
  const bouts = boutsForBasho.all(String(bashoId));
  const glickoResults = new Map();
  for (const bout of bouts) {
    const wrestlerA = wrestlers.get(bout.wrestlerAId);
    const wrestlerB = wrestlers.get(bout.wrestlerBId);
    const glickoA = getGlicko(glickoStates, bout.wrestlerAId);
    const glickoB = getGlicko(glickoStates, bout.wrestlerBId);
    const eloA = Number(bout.wrestlerAEloBefore ?? GLICKO2_DEFAULTS.rating);
    const eloB = Number(bout.wrestlerBEloBefore ?? GLICKO2_DEFAULTS.rating);
    const actual = bout.winnerId === bout.wrestlerAId ? 1 : 0;
    const eloRaw = eloProbability(eloA, eloB);
    const glickoRaw = glickoProbability(glickoA, glickoB);
    const pairKey = `${Math.min(bout.wrestlerAId, bout.wrestlerBId)}:${Math.max(bout.wrestlerAId, bout.wrestlerBId)}`;
    const pair = pairStates.get(pairKey) ?? { residualForLowId: 0, bouts: 0 };
    const aIsLowId = bout.wrestlerAId < bout.wrestlerBId;
    const matchupResidual = (aIsLowId ? pair.residualForLowId : -pair.residualForLowId) / (pair.bouts + H2H_PRIOR_BOUTS);
    const dohyoV2Probability = clampProbability(logistic(logit(glickoRaw) + H2H_COEFFICIENT * matchupResidual));
    const styleA = styleShares(getStyle(styleStates, bout.wrestlerAId));
    const styleB = styleShares(getStyle(styleStates, bout.wrestlerBId));
    const hasBody = wrestlerA?.heightCm != null && wrestlerA?.weightKg != null
      && wrestlerB?.heightCm != null && wrestlerB?.weightKg != null;
    bodyKnown += hasBody ? 1 : 0;
    kimariteKnown += bout.kimarite ? 1 : 0;
    const features = [
      hasBody ? clamp((wrestlerA.weightKg - wrestlerB.weightKg) / 40, -2.5, 2.5) : 0,
      hasBody ? clamp((wrestlerA.heightCm - wrestlerB.heightCm) / 15, -2.5, 2.5) : 0,
      styleA.push - styleB.push,
      styleA.belt - styleB.belt,
      styleA.throw - styleB.throw,
    ];
    rows.push({
      boutId: bout.id,
      bashoId,
      year: Math.floor(bashoId / 100),
      division: bout.division,
      day: bout.day,
      actual,
      eloProbability: eloRaw,
      glicko2RawProbability: glickoRaw,
      dohyoV2RawProbability: dohyoV2Probability,
      features,
    });

    const lowExpected = aIsLowId ? eloRaw : 1 - eloRaw;
    const lowActual = aIsLowId ? actual : 1 - actual;
    pair.residualForLowId += lowActual - lowExpected;
    pair.bouts += 1;
    pairStates.set(pairKey, pair);

    const winnerStyle = getStyle(styleStates, bout.winnerId);
    winnerStyle[styleCategory(bout.kimarite)] += 1;
    addGlickoResult(glickoResults, bout.wrestlerAId, glickoB, actual);
    addGlickoResult(glickoResults, bout.wrestlerBId, glickoA, 1 - actual);
  }

  const nextStates = new Map();
  for (const [wrestlerId, state] of glickoStates) {
    const next = updateGlicko2(state, glickoResults.get(wrestlerId) ?? []);
    nextStates.set(wrestlerId, { ...next, rd: Math.min(next.rd, GLICKO2_DEFAULTS.rd) });
  }
  glickoStates = nextStates;
  if ((bashoIndex + 1) % 24 === 0 || bashoIndex === bashoIds.length - 1) {
    console.log(`Model lab ${bashoIndex + 1}/${bashoIds.length} basho (${bashoId})`);
  }
}

const glickoCalibrationSlope = fitCalibrationSlope(rows, "glicko2RawProbability");
const v2CalibrationSlope = fitCalibrationSlope(rows, "dohyoV2RawProbability");
for (const row of rows) {
  row.glicko2Probability = clampProbability(logistic(glickoCalibrationSlope * logit(row.glicko2RawProbability)));
  row.dohyoV2Probability = clampProbability(logistic(v2CalibrationSlope * logit(row.dohyoV2RawProbability)));
}
const v3Weights = fitV3(rows);
for (const row of rows) {
  row.dohyoV3Probability = clampProbability(logistic(
    logit(row.dohyoV2Probability)
    + row.features.reduce((sum, feature, index) => sum + feature * v3Weights[index], 0),
  ));
}

database.exec(`
  DROP TABLE IF EXISTS prediction_backtests_actual;
  CREATE TABLE prediction_backtests_actual (
    bout_id TEXT PRIMARY KEY,
    basho_id INTEGER NOT NULL,
    division INTEGER NOT NULL,
    day INTEGER NOT NULL,
    actual_a INTEGER NOT NULL,
    elo_a_bp INTEGER NOT NULL,
    glicko_a_bp INTEGER NOT NULL,
    dohyo_v2_a_bp INTEGER NOT NULL,
    dohyo_v3_a_bp INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX prediction_backtests_basho_idx
    ON prediction_backtests_actual (basho_id, division, day);
`);
const insertBacktest = database.prepare(`
  INSERT INTO prediction_backtests_actual (
    bout_id, basho_id, division, day, actual_a,
    elo_a_bp, glicko_a_bp, dohyo_v2_a_bp, dohyo_v3_a_bp
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
database.exec("BEGIN");
for (const row of rows) insertBacktest.run(
  row.boutId,
  row.bashoId,
  row.division,
  row.day,
  row.actual,
  Math.round(row.eloProbability * 10_000),
  Math.round(row.glicko2Probability * 10_000),
  Math.round(row.dohyoV2Probability * 10_000),
  Math.round(row.dohyoV3Probability * 10_000),
);
database.exec("COMMIT");

const trainingRows = rows.filter((row) => row.bashoId <= TRAIN_END_BASHO);
const testRows = rows.filter((row) => row.bashoId >= TEST_START_BASHO);
const modelLabels = {
  elo: { label: "Elo", description: "一番ごとのレート差だけを使う基準線" },
  glicko2: { label: "Glicko-2", description: "場所前の地力と推定幅を使う" },
  dohyoV2: { label: "土俵日和 v2", description: "Glicko-2に縮小した直接対戦相性を加える" },
  dohyoV3: { label: "土俵日和 v3実験", description: "v2に体格差と過去の決まり手傾向を加える" },
};
const byDivision = DIVISION_NAMES.map((name, index) => {
  const division = index + 1;
  return { division, name, models: summarizeModels(testRows.filter((row) => row.division === division)) };
});
const years = [...new Set(testRows.map((row) => row.year))];
const byYear = years.map((year) => ({
  year,
  models: summarizeModels(testRows.filter((row) => row.year === year)),
}));
const byBasho = bashoIds.map((bashoId) => ({
  bashoId,
  models: summarizeModels(rows.filter((row) => row.bashoId === bashoId)),
}));
const names = JSON.parse(await readFile(NAME_PATH, "utf8")).names;
const inScopeWrestlerIds = database.prepare("SELECT DISTINCT wrestler_id AS id FROM banzuke_entries").all().map((row) => row.id);
const mappedNames = inScopeWrestlerIds.filter((id) => wrestlers.get(id)?.shikonaJp || names[String(id)]).length;
const currentStyles = Object.fromEntries([...styleStates].map(([id, state]) => {
  const shares = styleShares(state);
  return [String(id), [
    Number(shares.push.toFixed(4)),
    Number(shares.belt.toFixed(4)),
    Number(shares.throw.toFixed(4)),
    Number(shares.other.toFixed(4)),
    state.push + state.belt + state.throw + state.other,
  ]];
}));
const evaluation = {
  generatedAt: new Date().toISOString(),
  scope: {
    firstBasho: bashoIds[0],
    latestBasho: bashoIds.at(-1),
    totalBouts: rows.length,
    training: `1999–${Math.floor(TRAIN_END_BASHO / 100)}`,
    holdout: `${Math.floor(TEST_START_BASHO / 100)}–${Math.floor(bashoIds.at(-1) / 100)}`,
    holdoutBouts: testRows.length,
  },
  models: modelLabels,
  overall: {
    training: summarizeModels(trainingRows),
    holdout: summarizeModels(testRows),
    all: summarizeModels(rows),
  },
  byDivision,
  byYear,
  byBasho,
  calibration: Object.fromEntries(MODEL_IDS.map((modelId) => [modelId, calibration(testRows, `${modelId}Probability`)])),
  v3: {
    status: "experimental",
    featureNames: ["体重差", "身長差", "押し相撲傾向差", "四つ相撲傾向差", "投げ傾向差"],
    weights: v3Weights.map((value) => Number(value.toFixed(6))),
    regularization: V3_L2,
    trainingEndBasho: TRAIN_END_BASHO,
    caveat: "体格値には時点履歴がないため、v3は研究表示。正式予測はv2を継続する。",
  },
  calibrationSlopes: {
    glicko2: Number(glickoCalibrationSlope.toFixed(6)),
    dohyoV2: Number(v2CalibrationSlope.toFixed(6)),
  },
  dataQuality: {
    bodyCoverage: Number((bodyKnown / rows.length).toFixed(4)),
    kimariteCoverage: Number((kimariteKnown / rows.length).toFixed(4)),
    japaneseNameCoverage: Number((mappedNames / inScopeWrestlerIds.length).toFixed(4)),
    japaneseNames: mappedNames,
    wrestlers: inScopeWrestlerIds.length,
  },
  currentStyles,
};

const eraRows = database.prepare(`
  SELECT gs.wrestler_id AS id, CAST(gs.basho_id AS INTEGER) AS bashoId,
    gs.rating AS glickoRating, gs.sumo_hensachi_tenths AS hensachiTenths,
    rs.elo AS elo, w.nsk_id AS nskId, w.shikona_jp AS shikonaJp, w.shikona_en AS shikonaEn
  FROM glicko_snapshots_actual gs
  JOIN rating_snapshots_actual rs
    ON rs.wrestler_id = gs.wrestler_id AND rs.basho_id = gs.basho_id
  JOIN wrestlers w ON w.id = gs.wrestler_id
  WHERE gs.division = 1
  ORDER BY gs.wrestler_id, gs.basho_id
`).all();
const eraByWrestler = new Map();
for (const row of eraRows) {
  if (!eraByWrestler.has(row.id)) eraByWrestler.set(row.id, []);
  eraByWrestler.get(row.id).push(row);
}
const eraRanking = [];
for (const [id, history] of eraByWrestler) {
  if (history.length < 6) continue;
  const sorted = [...history].sort((a, b) => b.hensachiTenths - a.hensachiTenths);
  const peak = sorted[0];
  const topSix = sorted.slice(0, 6);
  const sustained = topSix.reduce((sum, row) => sum + row.hensachiTenths / 10, 0) / topSix.length;
  const peakHensachi = peak.hensachiTenths / 10;
  const eraIndex = 0.4 * peakHensachi + 0.6 * sustained;
  const source = history[0];
  eraRanking.push({
    id,
    nskId: source.nskId,
    name: source.shikonaJp || names[String(id)] || source.shikonaEn,
    eraIndex: Number(eraIndex.toFixed(1)),
    peakHensachi: Number(peakHensachi.toFixed(1)),
    sustainedHensachi: Number(sustained.toFixed(1)),
    peakBasho: peak.bashoId,
    peakGlicko: Math.max(...history.map((row) => row.glickoRating)),
    peakElo: Math.max(...history.map((row) => row.elo)),
    makuuchiBasho: history.length,
    firstBasho: history[0].bashoId,
    lastBasho: history.at(-1).bashoId,
  });
}
eraRanking.sort((a, b) => b.eraIndex - a.eraIndex || b.peakHensachi - a.peakHensachi);
const eraOutput = {
  generatedAt: new Date().toISOString(),
  status: "experimental",
  scope: "1999年以降・幕内在位6場所以上",
  formula: "歴代指数 = 最高相撲偏差値 × 40% + 上位6場所平均 × 60%",
  caveat: "同時代での傑出度を比べる実験値。1999年以前の取組は未収録。",
  ranking: eraRanking.slice(0, 120).map((row, index) => ({ position: index + 1, ...row })),
};

await mkdir(dirname(EVALUATION_PATH), { recursive: true });
await writeFile(EVALUATION_PATH, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(ERA_PATH, `${JSON.stringify(eraOutput, null, 2)}\n`, "utf8");
database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
database.close();

const ratingsLatest = JSON.parse(await readFile(RATINGS_PATH, "utf8"));
const databaseStats = await stat(DATABASE_PATH);
ratingsLatest.storage = {
  ...(ratingsLatest.storage ?? {}),
  sqliteBytes: databaseStats.size,
  sqliteMiB: Number((databaseStats.size / 1024 / 1024).toFixed(2)),
  predictionBacktests: rows.length,
};
await writeFile(RATINGS_PATH, `${JSON.stringify(ratingsLatest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  rows: rows.length,
  holdoutRows: testRows.length,
  weights: evaluation.v3.weights,
  holdout: evaluation.overall.holdout,
  dataQuality: evaluation.dataQuality,
  eraLeaders: eraOutput.ranking.slice(0, 10),
}, null, 2));
