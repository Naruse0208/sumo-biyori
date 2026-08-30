import ratingsSeed from "../../data/ratings-latest.json";
import { GLICKO2_DEFAULTS, updateGlicko2, type GlickoResult, type GlickoState } from "./glicko2";
import type { OfficialPredictionResult } from "./prediction-service";

const DIVISIONS = [1, 2, 3, 4, 5, 6] as const;
const K_FACTOR = 20;

type CachedSnapshot = {
  bashoId?: number;
  officialBashoId?: number;
  day?: number;
  dayHead?: string;
};

type OfficialRikishi = {
  rikishi_id?: number;
  shikona?: string;
  shikona_eng?: string;
};

type OfficialBout = {
  judge?: number;
  technic_name?: string;
  east?: OfficialRikishi;
  west?: OfficialRikishi;
};

type OfficialDayPayload = {
  basho_id?: number;
  dayHead?: string;
  TorikumiData?: OfficialBout[];
};

type OfficialBanzukeRow = {
  rikishi_id?: number;
  shikona?: string;
  banzuke_name?: string;
  ew?: number;
  rank?: number;
  seat_order?: number;
  number?: number | string;
};

type OfficialBanzukePayload = { BanzukeTable?: OfficialBanzukeRow[] };
type WrestlerRow = { id: number; nsk_id: number | null; shikona_en: string };
type BanzukeRow = { wrestler_id: number; division: number };
type BoutRow = {
  id: string;
  day: number;
  division: number;
  wrestler_a_id: number;
  wrestler_b_id: number;
  winner_wrestler_id: number;
};
type PreviousRow = {
  wrestler_id: number;
  basho_id: number;
  elo: number;
  peak_elo: number;
  bouts: number;
  wins: number;
  losses: number;
  glicko_rating: number | null;
  glicko_rd_tenths: number | null;
  glicko_volatility_millionths: number | null;
};

type RatingState = {
  elo: number;
  peakElo: number;
  bouts: number;
  wins: number;
  losses: number;
  glicko: GlickoState;
};

type SeedRow = {
  id: number;
  elo: number;
  peakElo: number;
  bouts: number;
  wins: number;
  losses: number;
  glickoRating: number;
  glickoRdTenths: number;
  glickoVolatilityMillionths: number;
};

export type DailyRatingUpdateResult = {
  runId: string;
  bashoId: number;
  officialBashoId: number;
  sourceDay: number;
  completedDay: number;
  importedBouts: number;
  snapshots: number;
  officialResults: OfficialPredictionResult[];
};

function headers(referer: string) {
  return {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    Cookie: "mischeief=OK; and=mouse",
    Referer: referer,
    "User-Agent": "Mozilla/5.0 (compatible; SumoBiyori/1.0; +https://dohyo-biyori.uwaaaan.chatgpt.site/)",
    "X-Requested-With": "XMLHttpRequest",
  };
}

async function fetchDay(division: number, day: number): Promise<OfficialDayPayload> {
  const response = await fetch(`https://www.sumo.or.jp/ResultData/torikumiAjax/${division}/${day}/`, {
    cache: "no-store",
    headers: headers(`https://www.sumo.or.jp/ResultData/torikumi/${division}/${day}/`),
  });
  if (!response.ok) throw new Error(`Official results failed: division ${division}, day ${day}, ${response.status}`);
  return response.json() as Promise<OfficialDayPayload>;
}

async function fetchBanzuke(officialBashoId: number, division: number): Promise<OfficialBanzukeRow[]> {
  const response = await fetch(`https://www.sumo.or.jp/ResultBanzuke/tableAjax/${division}/1/`, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...headers("https://www.sumo.or.jp/ResultBanzuke/table/"),
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams({ kakuzuke_id: String(division), basho_id: String(officialBashoId), page: "1" }),
  });
  if (!response.ok) throw new Error(`Official banzuke failed: division ${division}, ${response.status}`);
  const payload = await response.json() as OfficialBanzukePayload;
  return Array.isArray(payload.BanzukeTable) ? payload.BanzukeTable : [];
}

function plainName(value?: string) {
  const raw = value ?? "";
  return raw.match(/alt=["']([^"']+)["']/i)?.[1]
    ?? (raw.replace(/<[^>]+>/g, "").trim() || "未確認");
}

function rankName(ja?: string) {
  const pairs: Array<[RegExp, string]> = [
    [/横綱/, "Yokozuna"], [/大関/, "Ozeki"], [/関脇/, "Sekiwake"], [/小結/, "Komusubi"],
    [/前頭/, "Maegashira"], [/十両/, "Juryo"], [/幕下/, "Makushita"], [/三段目/, "Sandanme"],
    [/序二段/, "Jonidan"], [/序ノ口/, "Jonokuchi"],
  ];
  return pairs.find(([pattern]) => pattern.test(ja ?? ""))?.[1] ?? "Unranked";
}

function formattedRank(row: OfficialBanzukeRow) {
  const name = rankName(row.banzuke_name);
  const number = Number(row.number ?? 0);
  const side = Number(row.ew) === 2 ? "West" : "East";
  return `${name}${number > 0 ? ` ${number}` : ""} ${side}`;
}

function internalId(nskId: number) {
  return 10_000_000 + nskId;
}

function isoDateFromDayHead(dayHead: string | undefined, bashoId: number) {
  const match = dayHead?.match(/(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  return `${Math.floor(bashoId / 100)}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function tokyoDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

async function batch(database: D1Database, statements: D1PreparedStatement[], size = 75) {
  for (let offset = 0; offset < statements.length; offset += size) {
    await database.batch(statements.slice(offset, offset + size));
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, operation: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index]);
    }
  }));
  return results;
}

function scoreField(values: number[]) {
  if (!values.length) return { mean: 1500, deviation: 1 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, deviation: Math.sqrt(variance) || 1 };
}

function scoreTenths(value: number, field: { mean: number; deviation: number }) {
  return Math.round((50 + (10 * (value - field.mean)) / field.deviation) * 10);
}

function expectedScore(first: number, second: number) {
  return 1 / (1 + 10 ** ((second - first) / 400));
}

const seedById = new Map<number, SeedRow>(
  ratingsSeed.divisions.flatMap((division) => division.ranking as SeedRow[]).map((row) => [row.id, row]),
);

function startingState(previous?: PreviousRow): RatingState {
  const seed = previous ? seedById.get(previous.wrestler_id) : undefined;
  const elo = previous?.elo ?? seed?.elo ?? 1500;
  return {
    elo,
    peakElo: previous?.peak_elo ?? seed?.peakElo ?? elo,
    bouts: previous?.bouts ?? seed?.bouts ?? 0,
    wins: previous?.wins ?? seed?.wins ?? 0,
    losses: previous?.losses ?? seed?.losses ?? 0,
    glicko: {
      rating: previous?.glicko_rating ?? seed?.glickoRating ?? elo,
      rd: (previous?.glicko_rd_tenths ?? seed?.glickoRdTenths ?? 3500) / 10,
      volatility: (previous?.glicko_volatility_millionths ?? seed?.glickoVolatilityMillionths ?? 60000) / 1_000_000,
    },
  };
}

export async function runDailyRatingUpdate(
  database: D1Database,
  snapshot: CachedSnapshot,
): Promise<DailyRatingUpdateResult> {
  const bashoId = Number(snapshot.bashoId ?? 0);
  const officialBashoId = Number(snapshot.officialBashoId ?? 0);
  const sourceDay = Number(snapshot.day ?? 0);
  if (bashoId < 195801 || officialBashoId <= 0 || sourceDay < 1 || sourceDay > 15) {
    throw new Error("The live cache does not contain normalized tournament identifiers");
  }

  const runId = crypto.randomUUID();
  await database.prepare(`INSERT INTO rating_update_runs
    (id, basho_id, official_basho_id, source_day, completed_day, status)
    VALUES (?, ?, ?, ?, 0, 'running')`).bind(runId, bashoId, officialBashoId, sourceDay).run();

  try {
    const [banzukeTables, dayTables] = await Promise.all([
      mapWithConcurrency([...DIVISIONS], 3, async (division) => ({ division, rows: await fetchBanzuke(officialBashoId, division) })),
      mapWithConcurrency(Array.from({ length: sourceDay }, (_, index) => index + 1).flatMap((day) =>
        DIVISIONS.map((division) => ({ day, division }))), 6,
      async ({ day, division }) => ({ day, division, payload: await fetchDay(division, day) })),
    ]);

    const nskIds = new Set<number>();
    const names = new Map<number, { ja: string; en: string }>();
    for (const { rows } of banzukeTables) {
      for (const row of rows) {
        const nskId = Number(row.rikishi_id ?? 0);
        if (!nskId) continue;
        nskIds.add(nskId);
        names.set(nskId, { ja: plainName(row.shikona), en: `nsk-${nskId}` });
      }
    }
    for (const { payload } of dayTables) {
      for (const bout of payload.TorikumiData ?? []) {
        for (const rikishi of [bout.east, bout.west]) {
          const nskId = Number(rikishi?.rikishi_id ?? 0);
          if (!nskId) continue;
          nskIds.add(nskId);
          const previous = names.get(nskId);
          names.set(nskId, {
            ja: plainName(rikishi?.shikona) || previous?.ja || `力士${nskId}`,
            en: rikishi?.shikona_eng?.trim() || previous?.en || `nsk-${nskId}`,
          });
        }
      }
    }

    const existing = await database.prepare("SELECT id, nsk_id, shikona_en FROM wrestlers WHERE nsk_id IS NOT NULL")
      .all<WrestlerRow>();
    const idByNsk = new Map((existing.results ?? []).map((row) => [Number(row.nsk_id), row.id]));
    const wrestlerStatements: D1PreparedStatement[] = [];
    for (const nskId of nskIds) {
      const id = idByNsk.get(nskId) ?? internalId(nskId);
      idByNsk.set(nskId, id);
      const name = names.get(nskId)!;
      wrestlerStatements.push(database.prepare(`INSERT INTO wrestlers
        (id, nsk_id, shikona_jp, shikona_en, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET nsk_id = excluded.nsk_id,
          shikona_jp = CASE WHEN excluded.shikona_jp <> '未確認' THEN excluded.shikona_jp ELSE wrestlers.shikona_jp END,
          shikona_en = CASE WHEN excluded.shikona_en NOT LIKE 'nsk-%' THEN excluded.shikona_en ELSE wrestlers.shikona_en END,
          updated_at = CURRENT_TIMESTAMP`).bind(id, nskId, name.ja, name.en));
      wrestlerStatements.push(database.prepare(`INSERT INTO official_name_cache
        (nsk_id, shikona_jp, profile_url, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(nsk_id) DO UPDATE SET shikona_jp = excluded.shikona_jp,
          profile_url = excluded.profile_url, updated_at = CURRENT_TIMESTAMP`)
        .bind(nskId, name.ja, `https://www.sumo.or.jp/ResultRikishiData/profile/${nskId}/`));
      wrestlerStatements.push(database.prepare(`INSERT INTO shikona_history
        (wrestler_id, shikona_jp, shikona_en, start_basho_id)
        SELECT ?, ?, ?, ? WHERE NOT EXISTS (
          SELECT 1 FROM shikona_history WHERE wrestler_id = ? AND shikona_jp = ? AND shikona_en = ?
        )`).bind(id, name.ja, name.en, bashoId, id, name.ja, name.en));
    }
    await batch(database, wrestlerStatements);
    const startDate = isoDateFromDayHead(dayTables.find((item) => item.day === 1)?.payload.dayHead, bashoId);
    const endDate = isoDateFromDayHead(dayTables.find((item) => item.day === 15)?.payload.dayHead, bashoId);
    await database.prepare(`INSERT INTO basho (id, start_date, end_date, source_url, retrieved_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET start_date = COALESCE(excluded.start_date, basho.start_date),
        end_date = COALESCE(excluded.end_date, basho.end_date), source_url = excluded.source_url,
        retrieved_at = CURRENT_TIMESTAMP`)
      .bind(bashoId, startDate, endDate, `https://www.sumo.or.jp/ResultData/torikumi/1/${sourceDay}/`).run();

    const banzukeStatements: D1PreparedStatement[] = [];
    for (const { division, rows } of banzukeTables) {
      for (const row of rows) {
        const nskId = Number(row.rikishi_id ?? 0);
        const wrestlerId = idByNsk.get(nskId);
        const side = Number(row.ew ?? 0);
        if (!wrestlerId || (side !== 1 && side !== 2)) continue;
        const rankValue = Number(row.rank ?? 999) * 10_000 + Number(row.seat_order ?? 0) * 100 + side;
        banzukeStatements.push(database.prepare(`INSERT OR REPLACE INTO banzuke_entries
          (basho_id, division, wrestler_id, side, rank, rank_value) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(bashoId, division, wrestlerId, side, formattedRank(row), rankValue));
      }
    }
    await batch(database, banzukeStatements);

    const officialResults: OfficialPredictionResult[] = [];
    const boutStatements: D1PreparedStatement[] = [];
    let completedDay = 0;
    for (let day = 1; day <= sourceDay; day += 1) {
      const tables = dayTables.filter((item) => item.day === day);
      let scheduled = 0;
      let completed = 0;
      for (const { division, payload } of tables) {
        for (const bout of payload.TorikumiData ?? []) {
          const eastNskId = Number(bout.east?.rikishi_id ?? 0);
          const westNskId = Number(bout.west?.rikishi_id ?? 0);
          const judge = Number(bout.judge ?? 0);
          if (!eastNskId || !westNskId) continue;
          scheduled += 1;
          if (judge !== 1 && judge !== 2) continue;
          completed += 1;
          const eastId = idByNsk.get(eastNskId)!;
          const westId = idByNsk.get(westNskId)!;
          const wrestlerAId = Math.min(eastId, westId);
          const wrestlerBId = Math.max(eastId, westId);
          const winnerId = judge === 1 ? eastId : westId;
          const id = `${bashoId}-${day}-${wrestlerAId}-${wrestlerBId}`;
          boutStatements.push(database.prepare(`INSERT INTO bouts
            (id, basho_id, division, day, wrestler_a_id, wrestler_b_id, winner_wrestler_id, kimarite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET division = excluded.division, day = excluded.day,
              wrestler_a_id = excluded.wrestler_a_id, wrestler_b_id = excluded.wrestler_b_id,
              winner_wrestler_id = excluded.winner_wrestler_id, kimarite = excluded.kimarite`)
            .bind(id, bashoId, division, day, wrestlerAId, wrestlerBId, winnerId, bout.technic_name ?? null));
          officialResults.push({ bashoId, day, division, eastNskId, westNskId, winnerNskId: judge === 1 ? eastNskId : westNskId });
        }
      }
      if (scheduled > 0 && scheduled === completed) completedDay = day;
      else if (completed > 0) completedDay = Math.max(completedDay, day - 1);
    }
    await batch(database, boutStatements);

    const previous = await database.prepare(`SELECT rs.* FROM rating_snapshots rs
      INNER JOIN (SELECT wrestler_id, MAX(basho_id) AS basho_id FROM rating_snapshots
        WHERE basho_id < ? GROUP BY wrestler_id) latest
      ON latest.wrestler_id = rs.wrestler_id AND latest.basho_id = rs.basho_id`)
      .bind(bashoId).all<PreviousRow>();
    const previousById = new Map((previous.results ?? []).map((row) => [row.wrestler_id, row]));
    const entries = await database.prepare("SELECT wrestler_id, division FROM banzuke_entries WHERE basho_id = ? ORDER BY division, rank_value")
      .bind(bashoId).all<BanzukeRow>();
    const currentBouts = await database.prepare(`SELECT id, day, division, wrestler_a_id, wrestler_b_id, winner_wrestler_id
      FROM bouts WHERE basho_id = ? AND winner_wrestler_id IS NOT NULL ORDER BY day, division, id`)
      .bind(bashoId).all<BoutRow>();

    const states = new Map<number, RatingState>();
    const getState = (id: number) => {
      let state = states.get(id);
      if (!state) {
        state = startingState(previousById.get(id));
        states.set(id, state);
      }
      return state;
    };
    for (const entry of entries.results ?? []) getState(entry.wrestler_id);
    const glickoBefore = new Map<number, GlickoState>();
    const results = new Map<number, GlickoResult[]>();
    for (const bout of currentBouts.results ?? []) {
      const first = getState(bout.wrestler_a_id);
      const second = getState(bout.wrestler_b_id);
      if (!glickoBefore.has(bout.wrestler_a_id)) glickoBefore.set(bout.wrestler_a_id, { ...first.glicko });
      if (!glickoBefore.has(bout.wrestler_b_id)) glickoBefore.set(bout.wrestler_b_id, { ...second.glicko });
      const firstWon = bout.winner_wrestler_id === bout.wrestler_a_id;
      const firstBefore = first.elo;
      const secondBefore = second.elo;
      const delta = Math.round(K_FACTOR * ((firstWon ? 1 : 0) - expectedScore(firstBefore, secondBefore)));
      first.elo += delta;
      second.elo -= delta;
      first.peakElo = Math.max(first.peakElo, first.elo);
      second.peakElo = Math.max(second.peakElo, second.elo);
      first.bouts += 1; second.bouts += 1;
      if (firstWon) { first.wins += 1; second.losses += 1; } else { second.wins += 1; first.losses += 1; }
      const firstGlicko = glickoBefore.get(bout.wrestler_a_id)!;
      const secondGlicko = glickoBefore.get(bout.wrestler_b_id)!;
      const add = (id: number, value: GlickoResult) => results.set(id, [...(results.get(id) ?? []), value]);
      add(bout.wrestler_a_id, { opponentRating: secondGlicko.rating, opponentRd: secondGlicko.rd, score: firstWon ? 1 : 0 });
      add(bout.wrestler_b_id, { opponentRating: firstGlicko.rating, opponentRd: firstGlicko.rd, score: firstWon ? 0 : 1 });
      boutStatements.push(database.prepare(`UPDATE bouts SET wrestler_a_elo_before = ?, wrestler_b_elo_before = ?,
        wrestler_a_elo_after = ?, wrestler_b_elo_after = ? WHERE id = ?`)
        .bind(firstBefore, secondBefore, first.elo, second.elo, bout.id));
    }
    await batch(database, boutStatements.slice(officialResults.length));
    for (const [id, state] of states) state.glicko = updateGlicko2(glickoBefore.get(id) ?? state.glicko, results.get(id) ?? []);

    const entryRows = entries.results ?? [];
    const eloField = scoreField(entryRows.map((entry) => getState(entry.wrestler_id).elo));
    const divisionFields = new Map<number, ReturnType<typeof scoreField>>();
    for (const division of DIVISIONS) {
      divisionFields.set(division, scoreField(entryRows.filter((entry) => entry.division === division).map((entry) => getState(entry.wrestler_id).glicko.rating)));
    }
    const sekitoriField = scoreField(entryRows.filter((entry) => entry.division <= 2).map((entry) => getState(entry.wrestler_id).glicko.rating));

    await database.prepare("DELETE FROM rating_snapshot_staging WHERE run_id = ?").bind(runId).run();
    const staging = entryRows.map((entry) => {
      const state = getState(entry.wrestler_id);
      return database.prepare(`INSERT INTO rating_snapshot_staging
        (run_id, wrestler_id, basho_id, division, elo, peak_elo, dohyo_score_tenths, bouts, wins, losses,
         glicko_rating, glicko_rd_tenths, glicko_volatility_millionths, sumo_hensachi_tenths, sekitori_hensachi_tenths)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(runId, entry.wrestler_id, bashoId, entry.division, state.elo, state.peakElo,
          scoreTenths(state.elo, eloField), state.bouts, state.wins, state.losses,
          Math.round(state.glicko.rating), Math.round(state.glicko.rd * 10), Math.round(state.glicko.volatility * 1_000_000),
          scoreTenths(state.glicko.rating, divisionFields.get(entry.division)!),
          entry.division <= 2 ? scoreTenths(state.glicko.rating, sekitoriField) : null);
    });
    await batch(database, staging);

    await database.batch([
      database.prepare("DELETE FROM rating_snapshots WHERE basho_id = ?").bind(bashoId),
      database.prepare(`INSERT INTO rating_snapshots
        (wrestler_id, basho_id, division, elo, peak_elo, dohyo_score_tenths, bouts, wins, losses,
         glicko_rating, glicko_rd_tenths, glicko_volatility_millionths, sumo_hensachi_tenths,
         sekitori_hensachi_tenths, provisional, updated_at)
        SELECT wrestler_id, basho_id, division, elo, peak_elo, dohyo_score_tenths, bouts, wins, losses,
          glicko_rating, glicko_rd_tenths, glicko_volatility_millionths, sumo_hensachi_tenths,
          sekitori_hensachi_tenths, ?, CURRENT_TIMESTAMP FROM rating_snapshot_staging WHERE run_id = ?`)
        .bind(completedDay < 15 ? 1 : 0, runId),
      database.prepare(`INSERT INTO rating_update_meta (key, value, updated_at) VALUES ('last_success', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
        .bind(JSON.stringify({ runId, bashoId, officialBashoId, sourceDay, completedDay, dateKey: tokyoDateKey() })),
      database.prepare(`UPDATE rating_update_runs SET status = 'complete', completed_day = ?,
        completed_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(completedDay, runId),
      database.prepare("DELETE FROM rating_snapshot_staging WHERE run_id = ?").bind(runId),
    ]);

    return {
      runId, bashoId, officialBashoId, sourceDay, completedDay,
      importedBouts: currentBouts.results?.length ?? 0,
      snapshots: entryRows.length,
      officialResults,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown daily rating update error";
    await database.prepare(`UPDATE rating_update_runs SET status = 'failed', error = ?,
      completed_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(message.slice(0, 1000), runId).run().catch(() => undefined);
    throw error;
  }
}
