import { calculateLivePrediction } from "../../lib/prediction-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eastNskId = Number(url.searchParams.get("east"));
  const westNskId = Number(url.searchParams.get("west"));
  if (![eastNskId, westNskId].every((id) => Number.isInteger(id) && id > 0)) {
    return Response.json({ error: "east and west NSK IDs are required" }, { status: 400 });
  }

  try {
    const prediction = await calculateLivePrediction(request, eastNskId, westNskId);
    if (!prediction) return Response.json({ available: false });
    const { record: _record, ...publicPrediction } = prediction;
    return Response.json({ available: true, ...publicPrediction }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction database is unavailable";
    return Response.json({ error: message }, { status: 503 });
  }
}
