import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_PATH = join(ROOT, "work", "rating-audit", "rating-audit-199901-202607.sqlite");
const OUTPUT_PATH = join(ROOT, "data", "rikishi-names.json");
const CONCURRENCY = 4;
const REQUEST_DELAY_MS = 250;
const MAX_DIVISION = Math.min(6, Math.max(1, Number(process.env.NAME_MAX_DIVISION ?? 6)));

const database = new DatabaseSync(DATABASE_PATH);
const candidates = database.prepare(`
  SELECT DISTINCT w.id, w.sumodb_id AS sumodbId, w.shikona_jp AS shikonaJp
  FROM wrestlers w
  JOIN banzuke_entries be ON be.wrestler_id = w.id
  WHERE w.sumodb_id > 0 AND be.division <= ?
  ORDER BY w.id
`).all(MAX_DIVISION);
const updateName = database.prepare("UPDATE wrestlers SET shikona_jp = ? WHERE id = ?");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchJapaneseName(sumodbId, attempt = 1) {
  const response = await fetch(`https://sumodb.sumogames.de/Rikishi.aspx?r=${sumodbId}&l=j`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.7",
      "User-Agent": "Dohyo-Biyori Japanese-name enrichment (sequential, cached)",
    },
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await delay(1_000 * 2 ** (attempt - 1));
    return fetchJapaneseName(sumodbId, attempt + 1);
  }
  if (!response.ok) return null;
  const html = await response.text();
  const title = html.match(/<title>\s*([^<]+?)\s*力士情報/i)?.[1]?.trim();
  if (!title && attempt < 4) {
    await delay(600 * attempt);
    return fetchJapaneseName(sumodbId, attempt + 1);
  }
  if (!title) return null;
  return decodeHtml(title).split(/[\s　]+/)[0]?.trim() || null;
}

const pending = candidates.filter((row) => !row.shikonaJp);
let cursor = 0;
let completed = candidates.length - pending.length;
let enriched = 0;

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
  while (cursor < pending.length) {
    const index = cursor;
    cursor += 1;
    const wrestler = pending[index];
    await delay(REQUEST_DELAY_MS);
    try {
      const name = await fetchJapaneseName(wrestler.sumodbId);
      if (name) {
        updateName.run(name, wrestler.id);
        enriched += 1;
      }
    } catch (error) {
      console.warn(`Name ${wrestler.id}/${wrestler.sumodbId} skipped: ${error instanceof Error ? error.message : error}`);
    }
    completed += 1;
    if (completed % 100 === 0 || completed === candidates.length) {
      console.log(`Japanese names ${completed}/${candidates.length} (${enriched} newly enriched)`);
    }
  }
}));

const rows = database.prepare(`
  SELECT DISTINCT w.id, w.shikona_jp AS shikonaJp
  FROM wrestlers w
  JOIN banzuke_entries be ON be.wrestler_id = w.id
  WHERE w.shikona_jp IS NOT NULL
  ORDER BY w.id
`).all();
database.close();

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "SumoDB Japanese rikishi profiles",
  names: Object.fromEntries(rows.map((row) => [String(row.id), row.shikonaJp])),
}, null, 2)}\n`, "utf8");
console.log(`Japanese-name map: ${rows.length}/${candidates.length}`);
