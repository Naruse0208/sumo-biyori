import { env } from "cloudflare:workers";

const HISTORY_SHARDS = 32;
const BASHO_CACHE_LIMIT = 12;
const HISTORY_CACHE_LIMIT = 4;

type RuntimeEnv = { ASSETS?: Fetcher };
type RawMetric = [number, number, number, number, number, number, number | null];
type RawHistoryPoint = [number, number, number, number, number, number, number | null];
type RawHistoryShard = [number, RawHistoryPoint[]][];

export type RatingModelMetric = {
  wrestlerId: number;
  division: number;
  glickoRating: number;
  glickoRdTenths: number;
  glickoVolatilityMillionths: number;
  sumoHensachiTenths: number;
  sekitoriHensachiTenths: number | null;
};

export type RatingModelHistoryPoint = Omit<RatingModelMetric, "wrestlerId"> & {
  bashoId: number;
};

const bashoCache = new Map<number, Promise<Map<number, RatingModelMetric>>>();
const historyCache = new Map<number, Promise<Map<number, RatingModelHistoryPoint[]>>>();

function boundedSet<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}

async function loadGzipJson<T>(request: Request, pathname: string): Promise<T | null> {
  const assets = (env as unknown as RuntimeEnv).ASSETS;
  if (!assets) return null;
  try {
    const response = await assets.fetch(new Request(new URL(pathname, request.url)));
    if (!response.ok || !response.body) return null;
    const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(decompressed).json() as T;
  } catch {
    return null;
  }
}

export async function loadBashoModelMetrics(request: Request, bashoId: number) {
  let pending = bashoCache.get(bashoId);
  if (!pending) {
    pending = loadGzipJson<RawMetric[]>(request, `/rating-model-v2/basho-${bashoId}.json.gz`)
      .then((rows) => new Map((rows ?? []).map((row) => [row[0], {
        wrestlerId: row[0],
        division: row[1],
        glickoRating: row[2],
        glickoRdTenths: row[3],
        glickoVolatilityMillionths: row[4],
        sumoHensachiTenths: row[5],
        sekitoriHensachiTenths: row[6],
      }])));
    boundedSet(bashoCache, bashoId, pending, BASHO_CACHE_LIMIT);
  }
  return pending;
}

async function loadHistoryShard(request: Request, shardId: number) {
  let pending = historyCache.get(shardId);
  if (!pending) {
    pending = loadGzipJson<RawHistoryShard>(
      request,
      `/rating-model-v2/history-${String(shardId).padStart(2, "0")}.json.gz`,
    ).then((rows) => new Map((rows ?? []).map(([wrestlerId, history]) => [
      wrestlerId,
      history.map((point) => ({
        bashoId: point[0],
        division: point[1],
        glickoRating: point[2],
        glickoRdTenths: point[3],
        glickoVolatilityMillionths: point[4],
        sumoHensachiTenths: point[5],
        sekitoriHensachiTenths: point[6],
      })),
    ])));
    boundedSet(historyCache, shardId, pending, HISTORY_CACHE_LIMIT);
  }
  return pending;
}

export async function loadRikishiModelHistory(request: Request, wrestlerId: number) {
  const shardId = Math.abs(wrestlerId) % HISTORY_SHARDS;
  const shard = await loadHistoryShard(request, shardId);
  return shard.get(wrestlerId) ?? [];
}
