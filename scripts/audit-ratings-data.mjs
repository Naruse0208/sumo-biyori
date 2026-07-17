import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const START_BASHO = "199901";
const END_BASHO = "202607";
const API_ROOT = "https://sumo-api.com/api";
const REQUEST_DELAY_MS = 250;
const DIVISIONS = ["Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi"];
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "work", "rating-audit");
const DATABASE_PATH = join(OUTPUT_DIR, `rating-audit-${START_BASHO}-${END_BASHO}.sqlite`);
const REPORT_PATH = join(OUTPUT_DIR, `rating-audit-${START_BASHO}-${END_BASHO}.json`);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

function bashoIdsBetween(start, end) {
  const ids = [];
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  for (let year = startYear; year <= endYear; year += 1) {
    for (const month of [1, 3, 5, 7, 9, 11]) {
      const id = `${year}${String(month).padStart(2, "0")}`;
      if (id >= start && id <= end) ids.push(id);
    }
  }
  return ids;
}

async function fetchJson(url, options = {}, attempt = 1) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": "Dohyo-Biyori rating data audit (sequential, resumable)",
      ...options.headers,
    },
  });
  if (response.ok) return response.json();
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    await delay(1_000 * 2 ** (attempt - 1));
    return fetchJson(url, options, attempt + 1);
  }
  const error = new Error(`${url} returned ${response.status}`);
  error.status = response.status;
  throw error;
}

function setupDatabase(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;

    CREATE TABLE IF NOT EXISTS audit_fetch (
      basho_id TEXT NOT NULL,
      division INTEGER NOT NULL,
      status INTEGER NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (basho_id, division)
    );

    CREATE TABLE IF NOT EXISTS wrestlers (
      id INTEGER PRIMARY KEY,
      sumodb_id INTEGER,
      nsk_id INTEGER,
      shikona_en TEXT NOT NULL,
      heya TEXT,
      birth_date TEXT,
      shusshin TEXT,
      height_cm REAL,
      weight_kg REAL,
      debut_basho_id TEXT,
      intai_date TEXT
    );

    CREATE TABLE IF NOT EXISTS banzuke_entries (
      basho_id TEXT NOT NULL,
      division INTEGER NOT NULL,
      wrestler_id INTEGER NOT NULL,
      side INTEGER NOT NULL,
      rank_value INTEGER,
      rank TEXT NOT NULL,
      shikona_en TEXT NOT NULL,
      PRIMARY KEY (basho_id, division, wrestler_id)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS bouts (
      id TEXT PRIMARY KEY,
      basho_id TEXT NOT NULL,
      division INTEGER NOT NULL,
      day INTEGER NOT NULL,
      wrestler_a_id INTEGER NOT NULL,
      wrestler_b_id INTEGER NOT NULL,
      winner_id INTEGER NOT NULL,
      kimarite TEXT
    ) WITHOUT ROWID;
  `);
}

async function loadWrestlers(database) {
  const first = await fetchJson(`${API_ROOT}/rikishis?intai=true&limit=1000&skip=0`);
  const pages = Math.ceil(first.total / 1000);
  const insert = database.prepare(`
    INSERT OR REPLACE INTO wrestlers (
      id, sumodb_id, nsk_id, shikona_en, heya, birth_date, shusshin,
      height_cm, weight_kg, debut_basho_id, intai_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const saveRecords = (records) => inTransaction(database, () => {
    for (const wrestler of records) {
      insert.run(
        wrestler.id,
        wrestler.sumodbId ?? null,
        wrestler.nskId ?? null,
        wrestler.shikonaEn ?? "",
        wrestler.heya ?? null,
        wrestler.birthDate ?? null,
        wrestler.shusshin ?? null,
        wrestler.height ?? null,
        wrestler.weight ?? null,
        wrestler.debut ?? null,
        wrestler.intai ?? null,
      );
    }
  });

  saveRecords(first.records ?? []);
  for (let page = 1; page < pages; page += 1) {
    await delay(REQUEST_DELAY_MS);
    const payload = await fetchJson(`${API_ROOT}/rikishis?intai=true&limit=1000&skip=${page * 1000}`);
    saveRecords(payload.records ?? []);
    console.log(`Wrestler master ${Math.min((page + 1) * 1000, first.total)}/${first.total}`);
  }
  return first.total;
}

function saveBanzuke(database, bashoId, divisionIndex, payload) {
  const insertBanzuke = database.prepare(`
    INSERT OR REPLACE INTO banzuke_entries (
      basho_id, division, wrestler_id, side, rank_value, rank, shikona_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBout = database.prepare(`
    INSERT OR IGNORE INTO bouts (
      id, basho_id, division, day, wrestler_a_id, wrestler_b_id, winner_id, kimarite
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const markFetched = database.prepare(`
    INSERT OR REPLACE INTO audit_fetch (basho_id, division, status) VALUES (?, ?, ?)
  `);

  inTransaction(database, () => {
    for (const wrestler of [...(payload.east ?? []), ...(payload.west ?? [])]) {
      const wrestlerId = Number(wrestler.rikishiID ?? 0);
      if (!wrestlerId) continue;
      insertBanzuke.run(
        bashoId,
        divisionIndex,
        wrestlerId,
        wrestler.side === "East" ? 1 : 2,
        wrestler.rankValue ?? null,
        wrestler.rank ?? "",
        wrestler.shikonaEn ?? "",
      );

      for (const [recordIndex, record] of (wrestler.record ?? []).entries()) {
        const opponentId = Number(record.opponentID ?? 0);
        if (!opponentId || !["win", "loss"].includes(record.result)) continue;
        const wrestlerAId = Math.min(wrestlerId, opponentId);
        const wrestlerBId = Math.max(wrestlerId, opponentId);
        const day = recordIndex + 1;
        const winnerId = record.result === "win" ? wrestlerId : opponentId;
        insertBout.run(
          `${bashoId}-${day}-${wrestlerAId}-${wrestlerBId}`,
          bashoId,
          divisionIndex,
          day,
          wrestlerAId,
          wrestlerBId,
          winnerId,
          record.kimarite || null,
        );
      }
    }
    markFetched.run(bashoId, divisionIndex, 200);
  });
}

function createSizeModel(database) {
  database.exec(`
    DROP TABLE IF EXISTS rating_snapshot_size_model;
    CREATE TABLE rating_snapshot_size_model (
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
    INSERT OR IGNORE INTO rating_snapshot_size_model
      SELECT wrestler_id, basho_id, division, 1500, 1500, 500, 0, 0, 0
      FROM banzuke_entries;

    CREATE INDEX IF NOT EXISTS banzuke_basho_division_idx
      ON banzuke_entries (basho_id, division, rank_value);
    CREATE INDEX IF NOT EXISTS banzuke_wrestler_idx
      ON banzuke_entries (wrestler_id, basho_id);
    CREATE INDEX IF NOT EXISTS bouts_order_idx
      ON bouts (basho_id, division, day);
    CREATE INDEX IF NOT EXISTS bouts_wrestler_a_idx
      ON bouts (wrestler_a_id, basho_id, day);
    CREATE INDEX IF NOT EXISTS bouts_wrestler_b_idx
      ON bouts (wrestler_b_id, basho_id, day);
    CREATE INDEX IF NOT EXISTS rating_leaderboard_idx
      ON rating_snapshot_size_model (basho_id, division, elo);
    CREATE INDEX IF NOT EXISTS rating_wrestler_idx
      ON rating_snapshot_size_model (wrestler_id, basho_id);
  `);
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.exec("VACUUM");
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const database = new DatabaseSync(DATABASE_PATH);
  setupDatabase(database);

  const wrestlerTotal = await loadWrestlers(database);
  const bashoIds = bashoIdsBetween(START_BASHO, END_BASHO);
  const alreadyFetched = database.prepare("SELECT COUNT(*) AS count FROM audit_fetch WHERE status = 200").get().count;
  const totalRequests = bashoIds.length * DIVISIONS.length;
  let completed = Number(alreadyFetched);

  for (const bashoId of bashoIds) {
    for (const [divisionOffset, division] of DIVISIONS.entries()) {
      const divisionIndex = divisionOffset + 1;
      const checkpoint = database
        .prepare("SELECT status FROM audit_fetch WHERE basho_id = ? AND division = ?")
        .get(bashoId, divisionIndex);
      if (checkpoint?.status === 200) continue;

      await delay(REQUEST_DELAY_MS);
      const url = `${API_ROOT}/basho/${bashoId}/banzuke/${division}`;
      try {
        const payload = await fetchJson(url);
        saveBanzuke(database, bashoId, divisionIndex, payload);
      } catch (error) {
        if (error.status === 404) {
          database
            .prepare("INSERT OR REPLACE INTO audit_fetch (basho_id, division, status) VALUES (?, ?, ?)")
            .run(bashoId, divisionIndex, 404);
        } else {
          throw error;
        }
      }
      completed += 1;
    }
    console.log(`Banzuke audit ${completed}/${totalRequests} (${bashoId})`);
  }

  createSizeModel(database);
  const counts = {
    wrestlers: database.prepare("SELECT COUNT(*) AS count FROM wrestlers").get().count,
    wrestlersInScope: database.prepare(`
      SELECT COUNT(DISTINCT wrestler_id) AS count FROM banzuke_entries
    `).get().count,
    basho: database.prepare("SELECT COUNT(DISTINCT basho_id) AS count FROM banzuke_entries").get().count,
    banzukeEntries: database.prepare("SELECT COUNT(*) AS count FROM banzuke_entries").get().count,
    bouts: database.prepare("SELECT COUNT(*) AS count FROM bouts").get().count,
    ratingSnapshotsModeled: database.prepare("SELECT COUNT(*) AS count FROM rating_snapshot_size_model").get().count,
  };
  database.close();

  const databaseBytes = (await stat(DATABASE_PATH)).size;
  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      name: "Sumo API",
      guideUrl: "https://sumo-api.com/api-guide",
      coverageClaim: "1958 to present",
    },
    scope: {
      startBasho: START_BASHO,
      endBasho: END_BASHO,
      plannedBasho: bashoIds.length,
      divisions: DIVISIONS,
    },
    counts: { ...counts, sourceWrestlerTotal: wrestlerTotal },
    storageModel: {
      sqliteBytes: databaseBytes,
      sqliteMiB: Number((databaseBytes / 1024 / 1024).toFixed(2)),
      includesIndexes: true,
      includesOneRatingSnapshotPerBanzukeEntry: true,
      excludesRawHtmlAndImages: true,
    },
    caveats: [
      "Bouts are deduplicated from banzuke day records; playoff bouts are not included in this audit.",
      "The size model stores compact normalized records and production-style indexes.",
      "Kanji shikona coverage requires NSK ID enrichment and targeted fallback sources.",
    ],
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Audit report: ${REPORT_PATH}`);
  console.log(`SQLite model: ${DATABASE_PATH}`);
}

await main();
