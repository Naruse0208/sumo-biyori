import { env } from "cloudflare:workers";
import { readSharedLiveSumoCache } from "../../../../db/live-sumo-cache";
import {
  HIGHLIGHT_PROMPT_VERSION,
  HIGHLIGHT_SCHEMA_VERSION,
  boutHighlightId,
  createFallbackHighlightCopy,
  generateBoutHighlightBatch,
  getAiHighlightSettings,
  type BoutHighlightFacts,
} from "../../../lib/ai-highlights";
import { calculateLivePrediction, type LivePrediction } from "../../../lib/prediction-service";

export const dynamic = "force-dynamic";

const SHARED_CACHE_KEY = "official-live-sumo-v1";
const DIVISION_NAMES: Record<number, string> = {
  1: "幕内",
  2: "十両",
  3: "幕下",
  4: "三段目",
  5: "序二段",
  6: "序ノ口",
};
const GENERATION_ORDER = [6, 5, 4, 3, 2, 1] as const;

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

type CachedBout = { east?: CachedRikishi; west?: CachedRikishi };

type CachedSnapshot = {
  bashoId?: number;
  day?: number;
  divisions?: Array<{
    id?: number;
    allBoutSources?: Array<{ bout?: CachedBout }>;
  }>;
};

type Candidate = { division: number; bout: CachedBout };
type GenerateRequest = { force?: boolean; batchSize?: number };
type PreparedCandidate = Candidate & { id: string; facts: BoutHighlightFacts; factsHash: string };
type StoredHighlight = {
  id: string;
  facts_hash: string;
  provider: string;
  model: string;
  prompt_version: string;
  schema_version: string;
  status: string;
};

function runtime(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

function authorized(request: Request): boolean {
  const token = runtime().AI_HIGHLIGHT_ADMIN_TOKEN?.trim();
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

function validBout(bout: CachedBout): boolean {
  return Number(bout.east?.rikishi_id ?? 0) > 0 && Number(bout.west?.rikishi_id ?? 0) > 0;
}

function selectCandidates(snapshot: CachedSnapshot): Candidate[] {
  const divisions = new Map((snapshot.divisions ?? []).map((division) => [Number(division.id), division]));
  const candidates: Candidate[] = [];
  for (const divisionId of GENERATION_ORDER) {
    const bouts = (divisions.get(divisionId)?.allBoutSources ?? [])
      .flatMap(({ bout }) => bout && validBout(bout) ? [bout] : []);
    const selected = divisionId >= 3 ? bouts.slice(-5) : bouts;
    candidates.push(...selected.map((bout) => ({ division: divisionId, bout })));
  }
  return candidates;
}

function numberFromRecord(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function basicFacts(snapshot: CachedSnapshot, candidate: Candidate): BoutHighlightFacts {
  const east = candidate.bout.east!;
  const west = candidate.bout.west!;
  return {
    schemaVersion: "1",
    bashoId: Number(snapshot.bashoId),
    day: Number(snapshot.day),
    division: { id: candidate.division, nameJa: DIVISION_NAMES[candidate.division] },
    east: {
      nskId: Number(east.rikishi_id), nameJa: east.shikona || "", nameEn: east.shikona_eng || "",
      rankJa: east.banzuke_name || "", wins: Number(east.won_number ?? 0), losses: Number(east.lost_number ?? 0),
      elo: 1500, glicko2: 1500, glickoRd: 350, heightCm: null, weightKg: null,
    },
    west: {
      nskId: Number(west.rikishi_id), nameJa: west.shikona || "", nameEn: west.shikona_eng || "",
      rankJa: west.banzuke_name || "", wins: Number(west.won_number ?? 0), losses: Number(west.lost_number ?? 0),
      elo: 1500, glicko2: 1500, glickoRd: 350, heightCm: null, weightKg: null,
    },
    matchup: {
      eastWinProbability: 50, westWinProbability: 50, confidence: "low",
      headToHeadBouts: 0, eastHeadToHeadWins: 0, westHeadToHeadWins: 0,
    },
  };
}

function buildFacts(snapshot: CachedSnapshot, candidate: Candidate, prediction: LivePrediction): BoutHighlightFacts {
  const facts = basicFacts(snapshot, candidate);
  const explanation = prediction.explanation;
  return {
    ...facts,
    east: {
      ...facts.east,
      nameJa: prediction.east.name || facts.east.nameJa,
      nameEn: prediction.east.nameEn || facts.east.nameEn,
      elo: prediction.east.elo,
      glicko2: prediction.east.glickoRating,
      glickoRd: prediction.east.glickoRd,
      heightCm: prediction.east.heightMm === null ? null : prediction.east.heightMm / 10,
      weightKg: prediction.east.weightKg,
    },
    west: {
      ...facts.west,
      nameJa: prediction.west.name || facts.west.nameJa,
      nameEn: prediction.west.nameEn || facts.west.nameEn,
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isCurrent(row: StoredHighlight | undefined, item: PreparedCandidate) {
  return Boolean(row && row.id === item.id
    && row.prompt_version === HIGHLIGHT_PROMPT_VERSION && row.schema_version === HIGHLIGHT_SCHEMA_VERSION
    && (row.status === "generated" || row.status === "fallback_final"));
}

async function upsertCopies(
  database: D1Database,
  items: PreparedCandidate[],
  provider: string,
  model: string,
  status: "fallback_pending" | "generated",
  copies: Map<string, ReturnType<typeof createFallbackHighlightCopy>>,
) {
  if (items.length === 0) return;
  const statements = items.map((item) => database.prepare(`INSERT INTO bout_highlights
    (id, basho_id, day, division, east_nsk_id, west_nsk_id, facts_hash, provider, model,
     prompt_version, schema_version, status, fallback_reason, payload, generated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET facts_hash = excluded.facts_hash, provider = excluded.provider,
      model = excluded.model, prompt_version = excluded.prompt_version, schema_version = excluded.schema_version,
      status = excluded.status, fallback_reason = NULL, payload = excluded.payload,
      generated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`)
    .bind(item.id, item.facts.bashoId, item.facts.day, item.division, item.facts.east.nskId,
      item.facts.west.nskId, item.factsHash, provider, model, HIGHLIGHT_PROMPT_VERSION,
      HIGHLIGHT_SCHEMA_VERSION, status, JSON.stringify(copies.get(item.id))));
  await database.batch(statements);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as GenerateRequest;
  const shared = await readSharedLiveSumoCache(SHARED_CACHE_KEY);
  if (!shared?.payload) return Response.json({ status: "waiting", reason: "live_cache_empty" }, { status: 409 });
  const snapshot = JSON.parse(shared.payload) as CachedSnapshot;
  const availableDivisions = new Set((snapshot.divisions ?? []).map((division) => Number(division.id)));
  if (!snapshot.bashoId || !snapshot.day || GENERATION_ORDER.some((id) => !availableDivisions.has(id))) {
    return Response.json({ status: "waiting", reason: "daily_card_incomplete" }, { status: 409 });
  }

  const settings = getAiHighlightSettings();
  const database = runtime().DB;
  const candidates = selectCandidates(snapshot);
  const prepared: PreparedCandidate[] = [];
  for (const candidate of candidates) {
    const eastNskId = Number(candidate.bout.east?.rikishi_id);
    const westNskId = Number(candidate.bout.west?.rikishi_id);
    const id = boutHighlightId(snapshot.bashoId, snapshot.day, candidate.division, eastNskId, westNskId);
    const prediction = await calculateLivePrediction(request, eastNskId, westNskId).catch(() => null);
    const facts = prediction ? buildFacts(snapshot, candidate, prediction) : basicFacts(snapshot, candidate);
    prepared.push({ ...candidate, id, facts, factsHash: await sha256(JSON.stringify(facts)) });
  }

  const stored = new Map<string, StoredHighlight>();
  if (prepared.length > 0) {
    const placeholders = prepared.map(() => "?").join(", ");
    const result = await database.prepare(`SELECT id, facts_hash, provider, model, prompt_version, schema_version, status
      FROM bout_highlights WHERE id IN (${placeholders})`).bind(...prepared.map((item) => item.id)).all<StoredHighlight>();
    for (const row of result.results ?? []) stored.set(row.id, row);
  }
  const pending = prepared.filter((item) => body.force || !isCurrent(stored.get(item.id), item));

  const fallbackCopies = new Map(pending.map((item) => [item.id, createFallbackHighlightCopy(item.facts)]));
  await upsertCopies(database, pending, settings.provider, settings.model, "fallback_pending", fallbackCopies);

  const batchSize = Math.max(1, Math.min(5, Math.trunc(Number(body.batchSize ?? 5)) || 5));
  const work = pending.slice(0, batchSize);
  let generated = 0;
  let usedFallback = 0;
  if (work.length > 0) {
    let generatedCopies: Map<string, ReturnType<typeof createFallbackHighlightCopy>> | null = null;
    for (let attempt = 0; attempt < 2 && !generatedCopies; attempt += 1) {
      generatedCopies = await generateBoutHighlightBatch(
        work.map((item) => ({ id: item.id, facts: item.facts })), settings,
      ).catch(() => null);
    }
    if (generatedCopies) {
      await upsertCopies(database, work, settings.provider, settings.model, "generated", generatedCopies);
      generated = work.length;
    } else {
      const statements = work.map((item) => database.prepare(`UPDATE bout_highlights
        SET status = 'fallback_final', fallback_reason = 'provider_unavailable', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).bind(item.id));
      await database.batch(statements);
      usedFallback = work.length;
    }
  }

  return Response.json({
    status: "ok",
    provider: settings.provider,
    model: settings.model,
    total: prepared.length,
    generated,
    fallback: usedFallback,
    skipped: prepared.length - pending.length,
    remaining: Math.max(0, pending.length - work.length),
    batchSize,
  });
}
