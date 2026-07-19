import { env } from "cloudflare:workers";
import { readSharedLiveSumoCache } from "../../../../db/live-sumo-cache";
import {
  HIGHLIGHT_PROMPT_VERSION,
  HIGHLIGHT_SCHEMA_VERSION,
  boutHighlightId,
  generateBoutHighlightCopy,
  getAiHighlightSettings,
  type BoutHighlightFacts,
} from "../../../lib/ai-highlights";
import { calculateLivePrediction, type LivePrediction } from "../../../lib/prediction-service";

export const dynamic = "force-dynamic";

const SHARED_CACHE_KEY = "official-live-sumo-v1";
const DIVISION_NAMES: Record<number, string> = { 1: "幕内", 2: "十両", 3: "幕下" };

type RuntimeEnv = {
  DB: D1Database;
  AI_HIGHLIGHT_ADMIN_TOKEN?: string;
};

type CachedRikishi = {
  rikishi_id?: number;
  shikona?: string;
  shikona_eng?: string;
  banzuke_name?: string;
  won_number?: number;
  lost_number?: number;
};

type CachedBout = {
  east?: CachedRikishi;
  west?: CachedRikishi;
};

type CachedSnapshot = {
  bashoId?: number;
  day?: number;
  divisions?: Array<{
    id?: number;
    allBoutSources?: Array<{ bout?: CachedBout }>;
  }>;
};

type Candidate = {
  division: number;
  bout: CachedBout;
};

type GenerateRequest = {
  force?: boolean;
  batchSize?: number;
};

function runtime(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

function authorized(request: Request): boolean {
  const token = runtime().AI_HIGHLIGHT_ADMIN_TOKEN?.trim();
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

function kanjiRankNumber(rank: string | undefined): number {
  if (!rank) return 999;
  if (rank.includes("筆頭")) return 1;
  const text = rank.match(/([一二三四五六七八九十]+)枚目/)?.[1];
  if (!text) return 999;
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!text.includes("十")) return digits[text] ?? 999;
  const [tens, ones] = text.split("十");
  return (tens ? digits[tens] ?? 0 : 1) * 10 + (ones ? digits[ones] ?? 0 : 0);
}

function validBout(bout: CachedBout): boolean {
  return Number(bout.east?.rikishi_id ?? 0) > 0 && Number(bout.west?.rikishi_id ?? 0) > 0;
}

function selectCandidates(snapshot: CachedSnapshot): Candidate[] {
  const candidates: Candidate[] = [];
  for (const division of snapshot.divisions ?? []) {
    const id = Number(division.id ?? 0);
    if (id !== 1 && id !== 2 && id !== 3) continue;
    const bouts = (division.allBoutSources ?? [])
      .flatMap(({ bout }) => bout && validBout(bout) ? [bout] : []);
    if (id === 3) {
      bouts.sort((left, right) => {
        const leftRank = Math.min(kanjiRankNumber(left.east?.banzuke_name), kanjiRankNumber(left.west?.banzuke_name));
        const rightRank = Math.min(kanjiRankNumber(right.east?.banzuke_name), kanjiRankNumber(right.west?.banzuke_name));
        return leftRank - rightRank;
      });
      candidates.push(...bouts.slice(0, 5).map((bout) => ({ division: id, bout })));
    } else {
      candidates.push(...bouts.map((bout) => ({ division: id, bout })));
    }
  }
  return candidates;
}

function numberFromRecord(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function buildFacts(
  snapshot: CachedSnapshot,
  candidate: Candidate,
  prediction: LivePrediction,
): BoutHighlightFacts {
  const eastSource = candidate.bout.east!;
  const westSource = candidate.bout.west!;
  const explanation = prediction.explanation;
  return {
    schemaVersion: "1",
    bashoId: Number(snapshot.bashoId),
    day: Number(snapshot.day),
    division: { id: candidate.division, nameJa: DIVISION_NAMES[candidate.division] },
    east: {
      nskId: Number(eastSource.rikishi_id),
      nameJa: prediction.east.name || eastSource.shikona || "",
      nameEn: prediction.east.nameEn || eastSource.shikona_eng || "",
      rankJa: eastSource.banzuke_name || "",
      wins: Number(eastSource.won_number ?? 0),
      losses: Number(eastSource.lost_number ?? 0),
      elo: prediction.east.elo,
      glicko2: prediction.east.glickoRating,
      glickoRd: prediction.east.glickoRd,
      heightCm: prediction.east.heightMm === null ? null : prediction.east.heightMm / 10,
      weightKg: prediction.east.weightKg,
    },
    west: {
      nskId: Number(westSource.rikishi_id),
      nameJa: prediction.west.name || westSource.shikona || "",
      nameEn: prediction.west.nameEn || westSource.shikona_eng || "",
      rankJa: westSource.banzuke_name || "",
      wins: Number(westSource.won_number ?? 0),
      losses: Number(westSource.lost_number ?? 0),
      elo: prediction.west.elo,
      glicko2: prediction.west.glickoRating,
      glickoRd: prediction.west.glickoRd,
      heightCm: prediction.west.heightMm === null ? null : prediction.west.heightMm / 10,
      weightKg: prediction.west.weightKg,
    },
    matchup: {
      eastWinProbability: prediction.east.probability,
      westWinProbability: prediction.west.probability,
      confidence: prediction.confidence,
      headToHeadBouts: numberFromRecord(explanation, "headToHeadBouts"),
      eastHeadToHeadWins: numberFromRecord(explanation, "eastHeadToHeadWins"),
      westHeadToHeadWins: numberFromRecord(explanation, "westHeadToHeadWins"),
    },
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as GenerateRequest;
  const shared = await readSharedLiveSumoCache(SHARED_CACHE_KEY);
  if (!shared?.payload) return Response.json({ error: "Live sumo cache is empty" }, { status: 409 });
  const snapshot = JSON.parse(shared.payload) as CachedSnapshot;
  if (!snapshot.bashoId || !snapshot.day || !Array.isArray(snapshot.divisions)) {
    return Response.json({ error: "Live sumo cache is invalid" }, { status: 409 });
  }

  const settings = getAiHighlightSettings();
  const database = runtime().DB;
  const candidates = selectCandidates(snapshot);
  const batchSize = Math.max(1, Math.min(10, Math.trunc(Number(body.batchSize ?? 5)) || 5));
  const candidateIds = candidates.map((candidate) => boutHighlightId(
    snapshot.bashoId!,
    snapshot.day!,
    candidate.division,
    Number(candidate.bout.east?.rikishi_id ?? 0),
    Number(candidate.bout.west?.rikishi_id ?? 0),
  ));
  const cachedIds = new Set<string>();
  if (!body.force && candidateIds.length > 0) {
    const placeholders = candidateIds.map(() => "?").join(", ");
    const cached = await database.prepare(`SELECT id FROM bout_highlights
      WHERE id IN (${placeholders}) AND provider = ? AND model = ?
        AND prompt_version = ? AND schema_version = ?`)
      .bind(...candidateIds, settings.provider, settings.model, HIGHLIGHT_PROMPT_VERSION, HIGHLIGHT_SCHEMA_VERSION)
      .all<{ id: string }>();
    for (const row of cached.results ?? []) cachedIds.add(row.id);
  }
  const pending = candidates.filter((_, index) => !cachedIds.has(candidateIds[index]));
  const work = pending.slice(0, batchSize);
  const summary = {
    provider: settings.provider,
    model: settings.model,
    total: candidates.length,
    queued: pending.length,
    batchSize,
    generated: 0,
    skipped: candidates.length - pending.length,
    failed: 0,
  };
  const errors: Array<{ id: string; message: string }> = [];

  for (const candidate of work) {
    const eastNskId = Number(candidate.bout.east?.rikishi_id ?? 0);
    const westNskId = Number(candidate.bout.west?.rikishi_id ?? 0);
    const id = boutHighlightId(snapshot.bashoId, snapshot.day, candidate.division, eastNskId, westNskId);
    try {
      const prediction = await calculateLivePrediction(request, eastNskId, westNskId);
      if (!prediction) throw new Error("Rating facts are unavailable");
      const facts = buildFacts(snapshot, candidate, prediction);
      const factsHash = await sha256(JSON.stringify(facts));
      const copy = await generateBoutHighlightCopy(facts, settings);
      await database.prepare(`INSERT INTO bout_highlights
        (id, basho_id, day, division, east_nsk_id, west_nsk_id, facts_hash, provider, model,
         prompt_version, schema_version, payload, generated_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          facts_hash = excluded.facts_hash, provider = excluded.provider, model = excluded.model,
          prompt_version = excluded.prompt_version, schema_version = excluded.schema_version,
          payload = excluded.payload, generated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`)
        .bind(id, snapshot.bashoId, snapshot.day, candidate.division, eastNskId, westNskId,
          factsHash, settings.provider, settings.model, HIGHLIGHT_PROMPT_VERSION,
          HIGHLIGHT_SCHEMA_VERSION, JSON.stringify(copy))
        .run();
      summary.generated += 1;
    } catch (error) {
      summary.failed += 1;
      errors.push({ id, message: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  return Response.json({
    ...summary,
    remaining: Math.max(0, pending.length - summary.generated),
    errors: errors.slice(0, 10),
  });
}
