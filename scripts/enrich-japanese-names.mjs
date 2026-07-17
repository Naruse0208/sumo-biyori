import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_PATH = join(ROOT, "work", "rating-audit", "rating-audit-195801-202607.sqlite");
const OUTPUT_PATH = join(ROOT, "data", "rikishi-names.json");
const API_ROOT = "https://www.sumo-api.com/api";
const PAGE_SIZE = 1_000;
const MAX_DIVISION = Math.min(6, Math.max(1, Number(process.env.NAME_MAX_DIVISION ?? 6)));
const VERIFIED_FALLBACKS = new Map([
  [971, "北天佑勝彦"],
  [1023, "琴風豪規"],
  [1030, "貴ノ花利彰"],
  [1384, "信夫山治貞"],
  [1392, "時津山仁一"],
  [1400, "若前田英一朗"],
  [1513, "大豪久照"],
  [1888, "長谷川勝洋"],
  [3158, "琴勇輝"],
  [3247, "安美錦"],
  [3248, "嘉風"],
  [3249, "豪栄道"],
  [3748, "玉力道"],
  [3750, "武雄山"],
  [3853, "貴ノ浪"],
  [3854, "雅山"],
  [3855, "武双山"],
  [3857, "土佐ノ海"],
  [3858, "千代大海"],
  [3859, "武蔵丸"],
  [4226, "琴欧洲"],
  [4362, "十文字"],
  [4518, "露鵬"],
  [4995, "大日ノ出"],
  [4997, "若乃花"],
]);

const database = new DatabaseSync(DATABASE_PATH);
const candidates = database.prepare(`
  SELECT DISTINCT w.id, w.shikona_jp AS shikonaJp
  FROM wrestlers w
  JOIN banzuke_entries be ON be.wrestler_id = w.id
  WHERE be.division <= ?
  ORDER BY w.id
`).all(MAX_DIVISION);
const candidateIds = new Set(candidates.map((row) => Number(row.id)));
const updateName = database.prepare("UPDATE wrestlers SET shikona_jp = ? WHERE id = ?");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function cleanJapaneseName(value) {
  const cleaned = String(value ?? "")
    .replace(/[（(][ぁ-んァ-ヶー\s]+[）)]\s*$/u, "")
    .trim();
  return cleaned.split(/[\s　]+/u)[0] || null;
}

async function fetchJson(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Dohyo-Biyori Japanese-name enrichment (batched, cached)",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await delay(1_000 * 2 ** (attempt - 1));
      return fetchJson(url, attempt + 1);
    }
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  } catch (error) {
    if (attempt < 4) {
      await delay(1_000 * attempt);
      return fetchJson(url, attempt + 1);
    }
    throw error;
  }
}

let skip = 0;
let total = Number.POSITIVE_INFINITY;
let enriched = 0;
while (skip < total) {
  const payload = await fetchJson(`${API_ROOT}/rikishis?intai=true&limit=${PAGE_SIZE}&skip=${skip}`);
  total = Number(payload.total ?? 0);
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const wrestler of payload.records ?? []) {
      const id = Number(wrestler.id ?? 0);
      if (!candidateIds.has(id)) continue;
      const name = cleanJapaneseName(wrestler.shikonaJp);
      if (!name) continue;
      updateName.run(name, id);
      enriched += 1;
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  skip += PAGE_SIZE;
  console.log(`Japanese-name master ${Math.min(skip, total)}/${total} (${enriched} matched)`);
  if (skip < total) await delay(300);
}

for (const [id, name] of VERIFIED_FALLBACKS) {
  if (candidateIds.has(id)) updateName.run(name, id);
}

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
  source: "Sumo-API Japanese rikishi master (batched and cached)",
  names: Object.fromEntries(rows.map((row) => [String(row.id), row.shikonaJp])),
}, null, 2)}\n`, "utf8");
console.log(`Japanese-name map: ${rows.length}/${candidates.length}`);
