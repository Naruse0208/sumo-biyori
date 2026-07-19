import { calculateLivePrediction, loadStoredPrediction } from "../../lib/prediction-service";
import { validPredictionContext } from "../../lib/prediction-record";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eastNskId = Number(url.searchParams.get("east"));
  const westNskId = Number(url.searchParams.get("west"));
  const storedOnly = url.searchParams.get("storedOnly") === "1";
  if (![eastNskId, westNskId].every((id) => Number.isInteger(id) && id > 0)) {
    return Response.json({ error: "east and west NSK IDs are required" }, { status: 400 });
  }

  try {
    const context = {
      bashoId: Number(url.searchParams.get("basho")),
      day: Number(url.searchParams.get("day")),
      division: Number(url.searchParams.get("division")),
      eastNskId,
      westNskId,
    };
    if (validPredictionContext(Object.values(context))) {
      const stored = await loadStoredPrediction(context);
      if (stored) {
        return Response.json({ available: true, ...stored }, {
          headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
        });
      }
    }
    if (storedOnly) {
      return Response.json({ available: false }, {
        headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" },
      });
    }
    const prediction = await calculateLivePrediction(request, eastNskId, westNskId);
    if (!prediction) return Response.json({ available: false });
    const { record, ...publicPrediction } = prediction;
    void record;
    return Response.json({ available: true, ...publicPrediction }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction database is unavailable";
    return Response.json({ error: message }, { status: 503 });
  }
}
