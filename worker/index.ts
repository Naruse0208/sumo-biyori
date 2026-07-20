/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RATINGS_IMPORT_TOKEN?: string;
  AI_PROVIDER?: "gemini" | "openai";
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AI_HIGHLIGHT_ADMIN_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const HIGHLIGHT_BATCH_SIZE = 5;
const HIGHLIGHT_RETRY_MS = 10 * 60 * 1000;
const HIGHLIGHT_FAILURE_RETRY_MS = 10 * 60 * 1000;
const HIGHLIGHT_COMPLETE_SLEEP_MS = 18 * 60 * 60 * 1000;

function tokyoClock(now: Date): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { dateKey: `${read("year")}-${read("month")}-${read("day")}`, hour: Number(read("hour")) };
}

async function generateDailyHighlights(request: Request, env: Env): Promise<void> {
  const adminToken = env.AI_HIGHLIGHT_ADMIN_TOKEN?.trim();
  if (!adminToken) return;
  const now = Date.now();
  const clock = tokyoClock(new Date(now));
  if (clock.hour < 5) return;

  const cacheKey = `ai-highlight-sweep-v2:${clock.dateKey}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO live_sumo_cache (cache_key, updated_at_ms, lease_until_ms) VALUES (?, 0, 0)",
  ).bind(cacheKey).run();
  const leaseToken = crypto.randomUUID();
  const claim = await env.DB.prepare(
    "UPDATE live_sumo_cache SET lease_until_ms = ?, lease_token = ? WHERE cache_key = ? AND lease_until_ms < ?",
  ).bind(now + HIGHLIGHT_RETRY_MS, leaseToken, cacheKey, now).run();
  if (Number(claim.meta.changes ?? 0) === 0) return;

  let nextAttemptAt = now + HIGHLIGHT_FAILURE_RETRY_MS;
  let payload = JSON.stringify({ status: "waiting" });
  try {
    const internalRequest = new Request(new URL("/api/admin/generate-highlights", request.url), {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ batchSize: HIGHLIGHT_BATCH_SIZE }),
    });
    const response = await handler.fetch(internalRequest, env, {
      waitUntil() {},
      passThroughOnException() {},
    });
    const result = await response.json().catch(() => ({})) as { remaining?: number; error?: string };
    if (!response.ok) throw new Error(result.error || `Highlight generation failed (${response.status})`);
    const remaining = Math.max(0, Number(result.remaining ?? 0));
    nextAttemptAt = now + (remaining > 0 ? HIGHLIGHT_RETRY_MS : HIGHLIGHT_COMPLETE_SLEEP_MS);
    payload = JSON.stringify({ status: remaining > 0 ? "partial" : "complete", remaining });
  } catch {
    payload = JSON.stringify({ status: "waiting" });
  }

  await env.DB.prepare(
    "UPDATE live_sumo_cache SET payload = ?, updated_at_ms = ?, lease_until_ms = ?, lease_token = NULL WHERE cache_key = ? AND lease_token = ?",
  ).bind(payload, Date.now(), nextAttemptAt, cacheKey, leaseToken).run();
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (url.pathname === "/api/live-sumo") {
      ctx.waitUntil(generateDailyHighlights(request, env));
    }
    return response;
  },
};

export default worker;
