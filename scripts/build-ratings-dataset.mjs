import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { GLICKO2_DEFAULTS, updateGlicko2 } from "./lib/glicko2.mjs";

const START_ELO = 1500;
const K_FACTOR = 20;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = join(ROOT, "work", "rating-audit");
const DATABASE_PATH = join(AUDIT_DIR, "rating-audit-199901-202607.sqlite");
const AUDIT_REPORT_PATH = join(AUDIT_DIR, "rating-audit-199901-202607.json");
const OUTPUT_PATH = join(ROOT, "data", "ratings-latest.json");
const MODEL_ASSET_DIR = join(ROOT, "public", "rating-model-v2");
const DIVISION_NAMES = ["幕内", "十両", "幕下", "三段目", "序二段", "序ノ口"];
const OFFICIAL_BANZUKE_URL = "https://www.sumo.or.jp/ResultBanzuke/tableAjax";
const HISTORY_SHARDS = 32;

const expectedScore = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / 400));

function inTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function ensureColumns(database) {
  const wrestlerColumns = new Set(database.prepare("PRAGMA table_info(wrestlers)").all().map((column) => column.name));
  if (!wrestlerColumns.has("shikona_jp")) database.exec("ALTER TABLE wrestlers ADD COLUMN shikona_jp TEXT");
  const columns = new Set(database.prepare("PRAGMA table_info(bouts)").all().map((column) => column.name));
  for (const column of [
    "wrestler_a_elo_before",
    "wrestler_b_elo_before",
    "wrestler_a_elo_after",
    "wrestler_b_elo_after",
  ]) {
    if (!columns.has(column)) database.exec(`ALTER TABLE bouts ADD COLUMN ${column} INTEGER`);
  }
}

async function fetchOfficialNames(bashoId) {
  const names = new Map();
  for (let division = 1; division <= 6; division += 1) {
    const response = await fetch(`${OFFICIAL_BANZUKE_URL}/${division}/1/`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Cookie: "and=mouse",
        Referer: "https://www.sumo.or.jp/ResultBanzuke/table/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({ kakuzuke_id: String(division), basho_id: String(bashoId), page: "1" }),
    });
    if (!response.ok) throw new Error(`Official banzuke ${division} returned ${response.status}`);
    const payload = await response.json();
    for (const wrestler of payload.BanzukeTable ?? []) {
      const nskId = Number(wrestler.rikishi_id ?? 0);
      const shikonaJp = wrestler.shikona?.trim().split(/\s+/)[0]?.replace(/[（(].*$/, "");
      if (nskId && shikonaJp) names.set(nskId, shikonaJp);
    }
    if (division < 6) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return names;
}

function setupRatingTables(database) {
  database.exec(`
    DROP TABLE IF EXISTS rating_snapshots_actual;
    CREATE TABLE rating_snapshots_actual (
      wrestler_id INTEGER NOT NULL,
      basho_id TEXT NOT NULL,
      division INTEGER NOT NULL,
      elo INTEGER NOT NULL,
      peak_elo INTEGER NOT NULL,
      dohyo_score_tenths INTEGER NOT NULL,
      bouts INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      PRIMARY KEY (wrestler_id, basho_id)
    ) WITHOUT ROWID;

    DROP TABLE IF EXISTS glicko_snapshots_actual;
    CREATE TABLE glicko_snapshots_actual (
      wrestler_id INTEGER NOT NULL,
      basho_id TEXT NOT NULL,
      division INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      rd_tenths INTEGER NOT NULL,
      volatility_millionths INTEGER NOT NULL,
      sumo_hensachi_tenths INTEGER NOT NULL,
      sekitori_hensachi_tenths INTEGER,
      PRIMARY KEY (wrestler_id, basho_id)
    ) WITHOUT ROWID;
    CREATE INDEX glicko_snapshots_leaderboard_idx
      ON glicko_snapshots_actual (basho_id, division, rating DESC);

    DROP TABLE IF EXISTS rating_meta;
    CREATE TABLE rating_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;
  `);
}

function getRikishi(ratings, id) {
  if (!ratings.has(id)) {
    ratings.set(id, {
      elo: START_ELO,
      peakElo: START_ELO,
      bouts: 0,
      wins: 0,
      losses: 0,
    });
  }
  return ratings.get(id);
}

function getGlicko(ratings, id) {
  if (!ratings.has(id)) {
    ratings.set(id, {
      rating: GLICKO2_DEFAULTS.rating,
      rd: GLICKO2_DEFAULTS.rd,
      volatility: GLICKO2_DEFAULTS.volatility,
    });
  }
  return ratings.get(id);
}

function scoreField(entries, ratingForEntry) {
  const activeRatings = entries.map(ratingForEntry);
  const mean = activeRatings.reduce((sum, elo) => sum + elo, 0) / Math.max(activeRatings.length, 1);
  const variance = activeRatings.reduce((sum, elo) => sum + (elo - mean) ** 2, 0) / Math.max(activeRatings.length, 1);
  return { mean, standardDeviation: Math.sqrt(variance) || 1 };
}

function scoreTenths(rating, field) {
  return Math.round(500 + (100 * (rating - field.mean)) / field.standardDeviation);
}

async function writeModelAssets(database, bashoIds) {
  await rm(MODEL_ASSET_DIR, { recursive: true, force: true });
  await mkdir(MODEL_ASSET_DIR, { recursive: true });
  const rowsForBasho = database.prepare(`
    SELECT wrestler_id, division, rating, rd_tenths, volatility_millionths,
      sumo_hensachi_tenths, sekitori_hensachi_tenths
    FROM glicko_snapshots_actual
    WHERE basho_id = ?
    ORDER BY division, rating DESC
  `);
  for (const bashoId of bashoIds) {
    const rows = rowsForBasho.all(bashoId).map((row) => [
      row.wrestler_id,
      row.division,
      row.rating,
      row.rd_tenths,
      row.volatility_millionths,
      row.sumo_hensachi_tenths,
      row.sekitori_hensachi_tenths,
    ]);
    await writeFile(
      join(MODEL_ASSET_DIR, `basho-${bashoId}.json.gz`),
      gzipSync(JSON.stringify(rows), { level: 9 }),
    );
  }

  const historyShards = Array.from({ length: HISTORY_SHARDS }, () => new Map());
  const historyRows = database.prepare(`
    SELECT wrestler_id, basho_id, division, rating, rd_tenths,
      volatility_millionths, sumo_hensachi_tenths, sekitori_hensachi_tenths
    FROM glicko_snapshots_actual
    ORDER BY wrestler_id, basho_id
  `).iterate();
  for (const row of historyRows) {
    const shard = historyShards[Math.abs(row.wrestler_id) % HISTORY_SHARDS];
    if (!shard.has(row.wrestler_id)) shard.set(row.wrestler_id, []);
    shard.get(row.wrestler_id).push([
      Number(row.basho_id),
      row.division,
      row.rating,
      row.rd_tenths,
      row.volatility_millionths,
      row.sumo_hensachi_tenths,
      row.sekitori_hensachi_tenths,
    ]);
  }
  for (const [index, shard] of historyShards.entries()) {
    await writeFile(
      join(MODEL_ASSET_DIR, `history-${String(index).padStart(2, "0")}.json.gz`),
      gzipSync(JSON.stringify([...shard]), { level: 9 }),
    );
  }
  await writeFile(join(MODEL_ASSET_DIR, "manifest.json"), `${JSON.stringify({
    version: "glicko2-basho-v1",
    generatedAt: new Date().toISOString(),
    firstBasho: Number(bashoIds[0]),
    latestBasho: Number(bashoIds.at(-1)),
    bashoFiles: bashoIds.length,
    historyShards: HISTORY_SHARDS,
    parameters: {
      initialRating: GLICKO2_DEFAULTS.rating,
      initialRd: GLICKO2_DEFAULTS.rd,
      initialVolatility: GLICKO2_DEFAULTS.volatility,
      tau: GLICKO2_DEFAULTS.tau,
      ratingPeriod: "one basho",
    },
  }, null, 2)}\n`, "utf8");
}

async function main() {
  const database = new DatabaseSync(DATABASE_PATH);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
  ensureColumns(database);
  setupRatingTables(database);

  const bashoIds = database
    .prepare("SELECT DISTINCT basho_id FROM banzuke_entries ORDER BY basho_id")
    .all()
    .map((row) => row.basho_id);
  const ratings = new Map();
  let glickoRatings = new Map();
  const boutsForBasho = database.prepare(`
    SELECT id, day, division, wrestler_a_id, wrestler_b_id, winner_id
    FROM bouts
    WHERE basho_id = ?
    ORDER BY day, division, id
  `);
  const entriesForBasho = database.prepare(`
    SELECT wrestler_id, division
    FROM banzuke_entries
    WHERE basho_id = ?
    ORDER BY division, rank_value, side
  `);
  const updateBout = database.prepare(`
    UPDATE bouts SET
      wrestler_a_elo_before = ?, wrestler_b_elo_before = ?,
      wrestler_a_elo_after = ?, wrestler_b_elo_after = ?
    WHERE id = ?
  `);
  const insertSnapshot = database.prepare(`
    INSERT INTO rating_snapshots_actual (
      wrestler_id, basho_id, division, elo, peak_elo, dohyo_score_tenths,
      bouts, wins, losses
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertGlickoSnapshot = database.prepare(`
    INSERT INTO glicko_snapshots_actual (
      wrestler_id, basho_id, division, rating, rd_tenths,
      volatility_millionths, sumo_hensachi_tenths, sekitori_hensachi_tenths
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let ratedBouts = 0;
  for (const [bashoIndex, bashoId] of bashoIds.entries()) {
    const bouts = boutsForBasho.all(bashoId);
    const entries = entriesForBasho.all(bashoId);
    for (const entry of entries) getGlicko(glickoRatings, entry.wrestler_id);
    const glickoResults = new Map();
    const addGlickoResult = (wrestlerId, opponentId, score) => {
      if (!glickoResults.has(wrestlerId)) glickoResults.set(wrestlerId, []);
      const opponent = getGlicko(glickoRatings, opponentId);
      glickoResults.get(wrestlerId).push({
        opponentRating: opponent.rating,
        opponentRd: opponent.rd,
        score,
      });
    };
    for (const bout of bouts) {
      getGlicko(glickoRatings, bout.wrestler_a_id);
      getGlicko(glickoRatings, bout.wrestler_b_id);
      const aWon = bout.winner_id === bout.wrestler_a_id;
      addGlickoResult(bout.wrestler_a_id, bout.wrestler_b_id, aWon ? 1 : 0);
      addGlickoResult(bout.wrestler_b_id, bout.wrestler_a_id, aWon ? 0 : 1);
    }
    const nextGlickoRatings = new Map();
    for (const [wrestlerId, state] of glickoRatings) {
      const next = updateGlicko2(state, glickoResults.get(wrestlerId) ?? []);
      nextGlickoRatings.set(wrestlerId, {
        ...next,
        rd: Math.min(next.rd, GLICKO2_DEFAULTS.rd),
      });
    }
    glickoRatings = nextGlickoRatings;
    inTransaction(database, () => {
      for (const bout of bouts) {
        const wrestlerA = getRikishi(ratings, bout.wrestler_a_id);
        const wrestlerB = getRikishi(ratings, bout.wrestler_b_id);
        const aBefore = wrestlerA.elo;
        const bBefore = wrestlerB.elo;
        const aActual = bout.winner_id === bout.wrestler_a_id ? 1 : 0;
        const delta = Math.round(K_FACTOR * (aActual - expectedScore(aBefore, bBefore)));
        wrestlerA.elo = aBefore + delta;
        wrestlerB.elo = bBefore - delta;
        wrestlerA.peakElo = Math.max(wrestlerA.peakElo, wrestlerA.elo);
        wrestlerB.peakElo = Math.max(wrestlerB.peakElo, wrestlerB.elo);
        wrestlerA.bouts += 1;
        wrestlerB.bouts += 1;
        if (aActual) {
          wrestlerA.wins += 1;
          wrestlerB.losses += 1;
        } else {
          wrestlerB.wins += 1;
          wrestlerA.losses += 1;
        }
        updateBout.run(aBefore, bBefore, wrestlerA.elo, wrestlerB.elo, bout.id);
        ratedBouts += 1;
      }

      const field = scoreField(entries, (entry) => getRikishi(ratings, entry.wrestler_id).elo);
      const divisionFields = new Map();
      for (let division = 1; division <= 6; division += 1) {
        const divisionEntries = entries.filter((entry) => entry.division === division);
        divisionFields.set(division, scoreField(
          divisionEntries,
          (entry) => getGlicko(glickoRatings, entry.wrestler_id).rating,
        ));
      }
      const sekitoriEntries = entries.filter((entry) => entry.division <= 2);
      const sekitoriField = scoreField(
        sekitoriEntries,
        (entry) => getGlicko(glickoRatings, entry.wrestler_id).rating,
      );
      for (const entry of entries) {
        const wrestler = getRikishi(ratings, entry.wrestler_id);
        const dohyoScoreTenths = scoreTenths(wrestler.elo, field);
        const glicko = getGlicko(glickoRatings, entry.wrestler_id);
        const sumoHensachiTenths = scoreTenths(glicko.rating, divisionFields.get(entry.division));
        const sekitoriHensachiTenths = entry.division <= 2
          ? scoreTenths(glicko.rating, sekitoriField)
          : null;
        insertSnapshot.run(
          entry.wrestler_id,
          bashoId,
          entry.division,
          wrestler.elo,
          wrestler.peakElo,
          dohyoScoreTenths,
          wrestler.bouts,
          wrestler.wins,
          wrestler.losses,
        );
        insertGlickoSnapshot.run(
          entry.wrestler_id,
          bashoId,
          entry.division,
          Math.round(glicko.rating),
          Math.round(glicko.rd * 10),
          Math.round(glicko.volatility * 1_000_000),
          sumoHensachiTenths,
          sekitoriHensachiTenths,
        );
      }
    });
    if ((bashoIndex + 1) % 12 === 0 || bashoIndex === bashoIds.length - 1) {
      console.log(`Elo ${bashoIndex + 1}/${bashoIds.length} basho (${bashoId})`);
    }
  }

  const latestBashoId = bashoIds.at(-1);
  const latestEntries = database.prepare(`
    SELECT
      rs.wrestler_id AS id,
      w.nsk_id AS nskId,
      w.sumodb_id AS sumodbId,
      w.shikona_en AS shikonaEn,
      w.heya,
      be.rank AS banzukeRank,
      be.side,
      rs.division,
      rs.elo,
      rs.peak_elo AS peakElo,
      rs.dohyo_score_tenths AS dohyoScoreTenths,
      gs.rating AS glickoRating,
      gs.rd_tenths AS glickoRdTenths,
      gs.volatility_millionths AS glickoVolatilityMillionths,
      gs.sumo_hensachi_tenths AS sumoHensachiTenths,
      gs.sekitori_hensachi_tenths AS sekitoriHensachiTenths,
      rs.bouts,
      rs.wins,
      rs.losses
    FROM rating_snapshots_actual rs
    JOIN glicko_snapshots_actual gs
      ON gs.basho_id = rs.basho_id
      AND gs.wrestler_id = rs.wrestler_id
    JOIN wrestlers w ON w.id = rs.wrestler_id
    JOIN banzuke_entries be
      ON be.basho_id = rs.basho_id
      AND be.division = rs.division
      AND be.wrestler_id = rs.wrestler_id
    WHERE rs.basho_id = ?
    ORDER BY rs.division, rs.elo DESC, rs.wins DESC
  `).all(latestBashoId);

  let officialNames = new Map();
  try {
    officialNames = await fetchOfficialNames(latestBashoId);
    const updateJapaneseName = database.prepare("UPDATE wrestlers SET shikona_jp = ? WHERE nsk_id = ?");
    inTransaction(database, () => {
      for (const [nskId, shikonaJp] of officialNames) updateJapaneseName.run(shikonaJp, nskId);
    });
  } catch (error) {
    console.warn(`Official Japanese-name enrichment skipped: ${error instanceof Error ? error.message : error}`);
  }

  const divisions = DIVISION_NAMES.map((name, index) => ({
    id: index + 1,
    name,
    ranking: latestEntries
      .filter((entry) => entry.division === index + 1)
      .map((entry, rankIndex) => ({
        position: rankIndex + 1,
        ...entry,
        shikonaJp: officialNames.get(entry.nskId) ?? null,
        profileUrl: entry.nskId
          ? `https://www.sumo.or.jp/ResultRikishiData/profile/${entry.nskId}/`
          : null,
      })),
  }));

  const snapshotCount = database.prepare("SELECT COUNT(*) AS count FROM rating_snapshots_actual").get().count;
  const glickoSnapshotCount = database.prepare("SELECT COUNT(*) AS count FROM glicko_snapshots_actual").get().count;
  database.prepare("INSERT INTO rating_meta (key, value) VALUES (?, ?)").run("model", "Elo v1");
  database.prepare("INSERT INTO rating_meta (key, value) VALUES (?, ?)").run("starting_elo", String(START_ELO));
  database.prepare("INSERT INTO rating_meta (key, value) VALUES (?, ?)").run("k_factor", String(K_FACTOR));
  database.prepare("INSERT INTO rating_meta (key, value) VALUES (?, ?)").run("latest_basho_id", latestBashoId);
  database.prepare("INSERT INTO rating_meta (key, value) VALUES (?, ?)").run("glicko_model", "Glicko-2 basho v1");
  database.prepare("INSERT INTO rating_meta (key, value) VALUES (?, ?)").run("glicko_tau", String(GLICKO2_DEFAULTS.tau));
  database.prepare("INSERT INTO rating_meta (key, value) VALUES (?, ?)").run("glicko_initial_rd", String(GLICKO2_DEFAULTS.rd));
  database.prepare("INSERT INTO rating_meta (key, value) VALUES (?, ?)").run("glicko_initial_volatility", String(GLICKO2_DEFAULTS.volatility));
  await writeModelAssets(database, bashoIds);
  database.exec("DROP TABLE IF EXISTS rating_snapshot_size_model");
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.exec("VACUUM");
  database.close();

  const databaseBytes = (await stat(DATABASE_PATH)).size;
  const auditReport = JSON.parse(await (await import("node:fs/promises")).readFile(AUDIT_REPORT_PATH, "utf8"));
  const output = {
    generatedAt: new Date().toISOString(),
    status: "full-history-v2",
    scope: {
      startBasho: bashoIds[0],
      latestBasho: latestBashoId,
      basho: bashoIds.length,
      divisions: 6,
    },
    model: {
      name: "Elo v1",
      startingElo: START_ELO,
      kFactor: K_FACTOR,
      dohyoScore: "50 + 10 × (Elo - same-basho field mean) / field standard deviation",
      glicko2: {
        initialRating: GLICKO2_DEFAULTS.rating,
        initialRd: GLICKO2_DEFAULTS.rd,
        initialVolatility: GLICKO2_DEFAULTS.volatility,
        tau: GLICKO2_DEFAULTS.tau,
        ratingPeriod: "one basho",
      },
      sumoHensachi: "50 + 10 × (Glicko-2 rating - same-basho same-division mean) / standard deviation",
    },
    counts: {
      sourceWrestlers: auditReport.counts.sourceWrestlerTotal,
      wrestlersInScope: auditReport.counts.wrestlersInScope,
      ratedBouts,
      ratingSnapshots: Number(snapshotCount),
      glickoSnapshots: Number(glickoSnapshotCount),
    },
    storage: {
      sqliteBytes: databaseBytes,
      sqliteMiB: Number((databaseBytes / 1024 / 1024).toFixed(2)),
      targetMiB: 500,
    },
    divisions,
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    latestBashoId,
    ratedBouts,
    ratingSnapshots: Number(snapshotCount),
    glickoSnapshots: Number(glickoSnapshotCount),
    sqliteMiB: output.storage.sqliteMiB,
    leaders: divisions.map((division) => ({ division: division.name, leader: division.ranking[0] })),
  }, null, 2));
  console.log(`Latest ratings: ${OUTPUT_PATH}`);
}

await main();
