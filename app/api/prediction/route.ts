import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ratingSnapshots, wrestlers } from "../../../db/schema";
import { japaneseRikishiName, rikishiProfilePath } from "../../lib/rikishi-names";

export const dynamic = "force-dynamic";

async function latestByNskId(nskId: number) {
  const db = getDb();
  return db
    .select({
      id: wrestlers.id,
      shikonaJp: wrestlers.shikonaJp,
      shikonaEn: wrestlers.shikonaEn,
      elo: ratingSnapshots.elo,
      dohyoScoreTenths: ratingSnapshots.dohyoScoreTenths,
      bashoId: ratingSnapshots.bashoId,
    })
    .from(wrestlers)
    .innerJoin(ratingSnapshots, eq(ratingSnapshots.wrestlerId, wrestlers.id))
    .where(eq(wrestlers.nskId, nskId))
    .orderBy(desc(ratingSnapshots.bashoId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eastNskId = Number(url.searchParams.get("east"));
  const westNskId = Number(url.searchParams.get("west"));
  if (![eastNskId, westNskId].every((id) => Number.isInteger(id) && id > 0)) {
    return Response.json({ error: "east and west NSK IDs are required" }, { status: 400 });
  }

  try {
    const [east, west] = await Promise.all([latestByNskId(eastNskId), latestByNskId(westNskId)]);
    if (!east || !west) return Response.json({ available: false });
    const eastRaw = 1 / (1 + 10 ** ((west.elo - east.elo) / 400));
    const eastProbability = Math.round(eastRaw * 100);
    return Response.json({
      available: true,
      model: "Elo",
      east: {
        id: east.id,
        name: japaneseRikishiName(east.id, east.shikonaJp) ?? east.shikonaEn,
        elo: east.elo,
        dohyoScore: east.dohyoScoreTenths / 10,
        probability: eastProbability,
        profileUrl: rikishiProfilePath(east.id),
      },
      west: {
        id: west.id,
        name: japaneseRikishiName(west.id, west.shikonaJp) ?? west.shikonaEn,
        elo: west.elo,
        dohyoScore: west.dohyoScoreTenths / 10,
        probability: 100 - eastProbability,
        profileUrl: rikishiProfilePath(west.id),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction database is unavailable";
    return Response.json({ error: message }, { status: 503 });
  }
}

