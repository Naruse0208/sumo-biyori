import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_PATH = join(ROOT, "work", "rating-audit", "rating-audit-195801-202607.sqlite");
const ERA_PATH = join(ROOT, "data", "era-rankings.json");
const NAME_PATH = join(ROOT, "data", "rikishi-names.json");
const REPORT_PATH = join(ROOT, "work", "rating-audit", "era-name-enrichment.json");
const USER_AGENT = "Dohyo-Biyori historical rikishi name enrichment/1.0";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isAscii = (value) => /^[ -~]+$/.test(String(value ?? ""));

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    const retryAfter = Number(response.headers.get("retry-after") ?? 0) * 1_000;
    await delay(Math.max(retryAfter, Math.min(30_000, 2_000 * 2 ** (attempt - 1))));
    return fetchJson(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function searchUrl(name) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: name,
    language: "en",
    limit: "5",
    format: "json",
    origin: "*",
  });
  return `https://www.wikidata.org/w/api.php?${params}`;
}

function labelsUrl(ids) {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "labels",
    languages: "ja|en",
    format: "json",
    origin: "*",
  });
  return `https://www.wikidata.org/w/api.php?${params}`;
}

const era = JSON.parse(await readFile(ERA_PATH, "utf8"));
const namesDocument = JSON.parse(await readFile(NAME_PATH, "utf8"));
const candidates = era.ranking.filter((rikishi) => isAscii(rikishi.name));
const matches = [];
const unresolved = [];

for (const [index, rikishi] of candidates.entries()) {
  const payload = await fetchJson(searchUrl(rikishi.name));
  const match = (payload.search ?? []).find((result) =>
    /sumo|yokozuna|ōzeki|ozeki|rikishi/i.test(result.description ?? ""));
  if (match?.id) matches.push({ id: rikishi.id, sourceName: rikishi.name, wikidataId: match.id });
  else unresolved.push({ id: rikishi.id, sourceName: rikishi.name });
  if ((index + 1) % 20 === 0 || index === candidates.length - 1) {
    console.log(`Era-name search ${index + 1}/${candidates.length}`);
  }
  if (index < candidates.length - 1) await delay(1_500);
}

const labels = new Map();
for (let offset = 0; offset < matches.length; offset += 50) {
  const batch = matches.slice(offset, offset + 50);
  const payload = await fetchJson(labelsUrl(batch.map((match) => match.wikidataId)));
  for (const match of batch) {
    const value = payload.entities?.[match.wikidataId]?.labels?.ja?.value
      ?.replace(/[（(]力士[）)]$/u, "")
      .trim();
    if (value && !isAscii(value)) labels.set(match.id, { ...match, name: value });
    else unresolved.push({ id: match.id, sourceName: match.sourceName, wikidataId: match.wikidataId });
  }
  await delay(1_500);
}

const database = new DatabaseSync(DATABASE_PATH);
const updateName = database.prepare("UPDATE wrestlers SET shikona_jp = ? WHERE id = ?");
database.exec("BEGIN IMMEDIATE");
try {
  for (const [id, match] of labels) {
    updateName.run(match.name, id);
    namesDocument.names[String(id)] = match.name;
  }
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}
database.close();

namesDocument.generatedAt = new Date().toISOString();
namesDocument.source = `${namesDocument.source}; Wikidata verified historical top-120 labels`;
await writeFile(NAME_PATH, `${JSON.stringify(namesDocument, null, 2)}\n`, "utf8");
await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  candidates: candidates.length,
  resolved: [...labels.values()],
  unresolved,
}, null, 2)}\n`, "utf8");
console.log(`Historical Japanese names: ${labels.size}/${candidates.length}`);
