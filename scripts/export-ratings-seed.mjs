import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_PATH = join(ROOT, "work", "rating-audit", "rating-audit-199901-202607.sqlite");
const OUTPUT_DIR = join(ROOT, "public", "rating-seed");
const CHUNK_SIZE = 2000;

const database = new DatabaseSync(DATABASE_PATH, { readOnly: true });

const sources = [
  {
    table: "wrestlers",
    sql: `SELECT id, NULLIF(sumodb_id, 0), NULLIF(nsk_id, 0), shikona_jp, shikona_en,
      heya, birth_date, shusshin, CAST(height_cm * 10 AS INTEGER), CAST(weight_kg AS INTEGER),
      CAST(debut_basho_id AS INTEGER), intai_date FROM wrestlers ORDER BY id`,
  },
  {
    table: "basho",
    sql: "SELECT DISTINCT CAST(basho_id AS INTEGER) FROM banzuke_entries ORDER BY basho_id",
  },
  {
    table: "banzuke_entries",
    sql: `SELECT CAST(basho_id AS INTEGER), division, wrestler_id, side, rank, rank_value
      FROM banzuke_entries ORDER BY basho_id, division, rank_value, side`,
  },
  {
    table: "bouts",
    sql: `SELECT id, CAST(basho_id AS INTEGER), division, day, wrestler_a_id, wrestler_b_id,
      winner_id, kimarite, wrestler_a_elo_before, wrestler_b_elo_before,
      wrestler_a_elo_after, wrestler_b_elo_after FROM bouts ORDER BY basho_id, day, division, id`,
  },
  {
    table: "rating_snapshots",
    sql: `SELECT wrestler_id, CAST(basho_id AS INTEGER), division, elo, peak_elo,
      dohyo_score_tenths, bouts, wins, losses FROM rating_snapshots_actual
      ORDER BY basho_id, division, elo DESC`,
  },
  {
    table: "official_name_cache",
    sql: `SELECT nsk_id, shikona_jp,
      'https://www.sumo.or.jp/ResultRikishiData/profile/' || nsk_id || '/'
      FROM wrestlers WHERE nsk_id > 0 AND shikona_jp IS NOT NULL ORDER BY nsk_id`,
  },
];

await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });

const manifest = { generatedAt: new Date().toISOString(), chunkSize: CHUNK_SIZE, batches: [] };
for (const source of sources) {
  const rows = database.prepare(source.sql).all().map((row) => Object.values(row));
  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    const index = offset / CHUNK_SIZE;
    const file = `${source.table}-${String(index).padStart(4, "0")}.json.gz`;
    const chunk = rows.slice(offset, offset + CHUNK_SIZE);
    await writeFile(join(OUTPUT_DIR, file), gzipSync(JSON.stringify(chunk), { level: 9 }));
    manifest.batches.push({ file, table: source.table, rows: chunk.length });
  }
  console.log(`${source.table}: ${rows.length} rows`);
}
database.close();
await writeFile(join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Exported ${manifest.batches.length} resumable batches to ${OUTPUT_DIR}`);
