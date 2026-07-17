import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASHO_ID = "199901";
const DIVISION = "Makuuchi";
const DAYS = 15;
const START_ELO = 1500;
const K_FACTOR = 20;
const API_ROOT = "https://sumo-api.com/api";
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "pilot-199901-makuuchi.json");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectedScore = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / 400));

async function fetchDay(day) {
  const url = `${API_ROOT}/basho/${BASHO_ID}/torikumi/${DIVISION}/${day}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Dohyo-Biyori research pilot (responsible sequential fetch)",
    },
  });
  if (!response.ok) throw new Error(`Day ${day} request failed: ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.torikumi)) throw new Error(`Day ${day} has no torikumi array`);
  return payload;
}

function getRikishi(ratings, id, shikona) {
  if (!ratings.has(id)) {
    ratings.set(id, {
      id,
      shikona,
      elo: START_ELO,
      peakElo: START_ELO,
      bouts: 0,
      wins: 0,
      losses: 0,
    });
  }
  const rikishi = ratings.get(id);
  if (shikona) rikishi.shikona = shikona;
  return rikishi;
}

async function main() {
  const payloads = [];
  for (let day = 1; day <= DAYS; day += 1) {
    payloads.push(await fetchDay(day));
    if (day < DAYS) await delay(250);
  }

  const bouts = payloads
    .flatMap((payload) => payload.torikumi)
    .sort((a, b) => a.day - b.day || a.matchNo - b.matchNo);
  const ratings = new Map();
  let ratedBouts = 0;

  for (const bout of bouts) {
    if (![bout.eastId, bout.westId].includes(bout.winnerId)) continue;
    const east = getRikishi(ratings, bout.eastId, bout.eastShikona);
    const west = getRikishi(ratings, bout.westId, bout.westShikona);
    const eastBefore = east.elo;
    const westBefore = west.elo;
    const eastActual = bout.winnerId === east.id ? 1 : 0;
    const eastDelta = Math.round(K_FACTOR * (eastActual - expectedScore(eastBefore, westBefore)));

    east.elo = eastBefore + eastDelta;
    west.elo = westBefore - eastDelta;
    east.peakElo = Math.max(east.peakElo, east.elo);
    west.peakElo = Math.max(west.peakElo, west.elo);
    east.bouts += 1;
    west.bouts += 1;
    if (eastActual) {
      east.wins += 1;
      west.losses += 1;
    } else {
      west.wins += 1;
      east.losses += 1;
    }
    ratedBouts += 1;
  }

  const rikishi = [...ratings.values()];
  const mean = rikishi.reduce((sum, item) => sum + item.elo, 0) / rikishi.length;
  const variance = rikishi.reduce((sum, item) => sum + (item.elo - mean) ** 2, 0) / rikishi.length;
  const standardDeviation = Math.sqrt(variance) || 1;
  const ranking = rikishi
    .map((item) => ({
      ...item,
      dohyoScore: Number((50 + (10 * (item.elo - mean)) / standardDeviation).toFixed(1)),
    }))
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins)
    .map((item, index) => ({ rank: index + 1, ...item }));

  const first = payloads[0];
  const report = {
    generatedAt: new Date().toISOString(),
    status: "pilot",
    source: {
      name: "Sumo API",
      guideUrl: "https://sumo-api.com/api-guide",
      bashoUrl: `${API_ROOT}/basho/${BASHO_ID}`,
    },
    scope: {
      bashoId: BASHO_ID,
      division: DIVISION,
      days: DAYS,
      location: first.location,
      startDate: first.startDate,
      endDate: first.endDate,
    },
    model: {
      name: "Elo pilot v1",
      startingElo: START_ELO,
      kFactor: K_FACTOR,
      dohyoScore: "50 + 10 × (Elo - field mean) / field standard deviation",
    },
    counts: {
      fetchedBouts: bouts.length,
      ratedBouts,
      wrestlers: rikishi.length,
    },
    field: {
      meanElo: Number(mean.toFixed(2)),
      standardDeviation: Number(standardDeviation.toFixed(2)),
    },
    ranking,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Saved ${ratedBouts} rated bouts for ${rikishi.length} wrestlers to ${OUTPUT}`);
  console.table(ranking.slice(0, 10).map(({ rank, shikona, elo, dohyoScore, wins, losses }) => ({ rank, shikona, elo, dohyoScore, record: `${wins}-${losses}` })));
}

await main();

