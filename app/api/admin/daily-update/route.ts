import { env } from "cloudflare:workers";
import { readSharedLiveSumoCache } from "../../../../db/live-sumo-cache";
import { normalizeCalendarBashoId } from "../../../lib/basho-id";
import { runDailyRatingUpdate } from "../../../lib/daily-rating-update";
import { syncOfficialPredictionRecords } from "../../../lib/prediction-service";

export const dynamic = "force-dynamic";
const SHARED_CACHE_KEY = "official-live-sumo-v1";

type RuntimeEnv = {
  DB: D1Database;
  DAILY_UPDATE_TOKEN?: string;
};

type CachedSnapshot = {
  bashoId?: number;
  officialBashoId?: number;
  day?: number;
  dayHead?: string;
};

function runtime() {
  return env as unknown as RuntimeEnv;
}

function authorized(request: Request) {
  const token = runtime().DAILY_UPDATE_TOKEN?.trim();
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const row = await runtime().DB.prepare("SELECT value, updated_at FROM rating_update_meta WHERE key = 'last_success'")
    .first<{ value: string; updated_at: string }>();
  return Response.json(row ? { ...JSON.parse(row.value), updatedAt: row.updated_at } : { status: "never-run" });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const shared = await readSharedLiveSumoCache(SHARED_CACHE_KEY);
  if (!shared?.payload) return Response.json({ error: "Live cache is empty" }, { status: 409 });
  const raw = JSON.parse(shared.payload) as CachedSnapshot;
  const normalized = normalizeCalendarBashoId(raw.bashoId, raw.dayHead);
  const snapshot = {
    ...raw,
    bashoId: raw.bashoId && raw.bashoId >= 195801 ? raw.bashoId : normalized.bashoId,
    officialBashoId: raw.officialBashoId ?? normalized.officialBashoId,
  };
  try {
    const result = await runDailyRatingUpdate(runtime().DB, snapshot);
    await syncOfficialPredictionRecords(request, result.officialResults, []);
    return Response.json({ status: "complete", ...result, officialResults: result.officialResults.length });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Daily update failed",
    }, { status: 503 });
  }
}
