import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIRECTORY = join(ROOT, "work", "rating-audit");
const OUTPUT_PATH = join(ROOT, "data", "featured-risers.json");
const NAME_PATH = join(ROOT, "data", "rikishi-names.json");

const databases = (await readdir(AUDIT_DIRECTORY))
  .filter((name) => /^rating-audit-.*\.sqlite$/.test(name))
  .sort();

const databaseName = databases.at(-1);
if (!databaseName) throw new Error("Rating audit database was not found");

const names = JSON.parse(await readFile(NAME_PATH, "utf8")).names;
const database = new DatabaseSync(join(AUDIT_DIRECTORY, databaseName), { readOnly: true });

try {
  const bashoIds = database.prepare(`
    SELECT DISTINCT CAST(basho_id AS INTEGER) AS bashoId
    FROM glicko_snapshots_actual
    WHERE division BETWEEN 1 AND 3
    ORDER BY bashoId DESC
    LIMIT 2
  `).all().map((row) => row.bashoId);

  const [latestBasho, previousBasho] = bashoIds;
  if (!latestBasho || !previousBasho) throw new Error("Two basho snapshots are required");

  const rows = database.prepare(`
    SELECT
      current.wrestler_id AS id,
      wrestler.nsk_id AS nskId,
      wrestler.shikona_jp AS shikonaJp,
      wrestler.shikona_en AS shikonaEn,
      wrestler.heya AS heya,
      banzuke.rank AS rank,
      current.division AS division,
      current.rating AS rating,
      current.rd_tenths AS rdTenths,
      previous.rating AS previousRating,
      current.rating - previous.rating AS delta
    FROM glicko_snapshots_actual current
    JOIN glicko_snapshots_actual previous
      ON previous.wrestler_id = current.wrestler_id
      AND CAST(previous.basho_id AS INTEGER) = ?
    JOIN wrestlers wrestler ON wrestler.id = current.wrestler_id
    JOIN banzuke_entries banzuke
      ON banzuke.wrestler_id = current.wrestler_id
      AND banzuke.basho_id = current.basho_id
      AND banzuke.division = current.division
    WHERE CAST(current.basho_id AS INTEGER) = ?
      AND current.division BETWEEN 1 AND 3
      AND current.rd_tenths <= 1200
      AND current.rating > previous.rating
    ORDER BY delta DESC, current.rating DESC
    LIMIT 5
  `).all(previousBasho, latestBasho);

  const output = {
    generatedAt: new Date().toISOString(),
    metric: "Glicko-2",
    latestBasho,
    previousBasho,
    rows: rows.map((row, index) => ({
      position: index + 1,
      id: row.id,
      nskId: row.nskId,
      name: row.shikonaJp?.trim() || names[String(row.id)] || row.shikonaEn,
      shikonaEn: row.shikonaEn,
      heya: row.heya,
      rank: row.rank,
      division: row.division,
      rating: row.rating,
      previousRating: row.previousRating,
      delta: row.delta,
      rdTenths: row.rdTenths,
      profileUrl: `/rikishi/${row.id}`,
    })),
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Featured risers: ${previousBasho} -> ${latestBasho} (${rows.length} wrestlers)`);
} finally {
  database.close();
}
