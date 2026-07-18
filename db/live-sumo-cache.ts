import { env } from "cloudflare:workers";

export type SharedLiveSumoCache = {
  payload: string | null;
  updatedAtMs: number;
};

function getD1() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable");
  return env.DB;
}

export async function readSharedLiveSumoCache(
  cacheKey: string,
): Promise<SharedLiveSumoCache | null> {
  const row = await getD1()
    .prepare("SELECT payload, updated_at_ms AS updatedAtMs FROM live_sumo_cache WHERE cache_key = ?")
    .bind(cacheKey)
    .first<{ payload: string | null; updatedAtMs: number }>();
  return row
    ? { payload: row.payload, updatedAtMs: Number(row.updatedAtMs ?? 0) }
    : null;
}

export async function claimSharedLiveSumoRefresh(
  cacheKey: string,
  nowMs: number,
  leaseMs: number,
): Promise<string | null> {
  const db = getD1();
  await db
    .prepare("INSERT OR IGNORE INTO live_sumo_cache (cache_key, updated_at_ms, lease_until_ms) VALUES (?, 0, 0)")
    .bind(cacheKey)
    .run();

  const token = crypto.randomUUID();
  const result = await db
    .prepare("UPDATE live_sumo_cache SET lease_until_ms = ?, lease_token = ? WHERE cache_key = ? AND lease_until_ms < ?")
    .bind(nowMs + leaseMs, token, cacheKey, nowMs)
    .run();
  return Number(result.meta.changes ?? 0) > 0 ? token : null;
}

export async function saveSharedLiveSumoCache(
  cacheKey: string,
  token: string,
  payload: string,
  updatedAtMs: number,
): Promise<boolean> {
  const result = await getD1()
    .prepare("UPDATE live_sumo_cache SET payload = ?, updated_at_ms = ?, lease_until_ms = 0, lease_token = NULL WHERE cache_key = ? AND lease_token = ?")
    .bind(payload, updatedAtMs, cacheKey, token)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function releaseSharedLiveSumoRefresh(cacheKey: string, token: string): Promise<void> {
  await getD1()
    .prepare("UPDATE live_sumo_cache SET lease_until_ms = 0, lease_token = NULL WHERE cache_key = ? AND lease_token = ?")
    .bind(cacheKey, token)
    .run();
}
