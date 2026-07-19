import { env } from "cloudflare:workers";
import { boutHighlightId, parseBoutHighlightCopy } from "../../lib/ai-highlights";

export const dynamic = "force-dynamic";

function positiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bashoId = positiveInteger(url.searchParams.get("basho"));
  const day = positiveInteger(url.searchParams.get("day"));
  const division = positiveInteger(url.searchParams.get("division"));
  const eastNskId = positiveInteger(url.searchParams.get("east"));
  const westNskId = positiveInteger(url.searchParams.get("west"));
  if (!bashoId || !day || !division || !eastNskId || !westNskId || division > 6 || day > 15) {
    return Response.json({ available: false, error: "Invalid bout" }, { status: 400 });
  }

  const database = env.DB;
  if (!database) return Response.json({ available: false }, { status: 503 });
  const row = await database
    .prepare("SELECT payload, provider, model, generated_at AS generatedAt FROM bout_highlights WHERE id = ?")
    .bind(boutHighlightId(bashoId, day, division, eastNskId, westNskId))
    .first<{ payload: string; provider: string; model: string; generatedAt: string }>();
  if (!row) {
    return Response.json({ available: false }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
  try {
    return Response.json({
      available: true,
      copy: parseBoutHighlightCopy(JSON.parse(row.payload)),
      provider: row.provider,
      model: row.model,
      generatedAt: row.generatedAt,
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return Response.json({ available: false }, { status: 500 });
  }
}
