import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ratingSnapshots, wrestlers } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bashoId = Number(url.searchParams.get("basho") ?? 0);
  const division = Number(url.searchParams.get("division") ?? 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  if (!Number.isInteger(bashoId) || bashoId < 199901) {
    return Response.json({ error: "basho must be YYYYMM and 199901 or later" }, { status: 400 });
  }
  if (!Number.isInteger(division) || division < 1 || division > 6) {
    return Response.json({ error: "division must be between 1 and 6" }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        wrestlerId: wrestlers.id,
        nskId: wrestlers.nskId,
        sumodbId: wrestlers.sumodbId,
        shikonaJp: wrestlers.shikonaJp,
        shikonaEn: wrestlers.shikonaEn,
        elo: ratingSnapshots.elo,
        peakElo: ratingSnapshots.peakElo,
        dohyoScoreTenths: ratingSnapshots.dohyoScoreTenths,
        bouts: ratingSnapshots.bouts,
        wins: ratingSnapshots.wins,
        losses: ratingSnapshots.losses,
      })
      .from(ratingSnapshots)
      .innerJoin(wrestlers, eq(ratingSnapshots.wrestlerId, wrestlers.id))
      .where(and(eq(ratingSnapshots.bashoId, bashoId), eq(ratingSnapshots.division, division)))
      .orderBy(desc(ratingSnapshots.elo), desc(ratingSnapshots.wins))
      .limit(limit);

    return Response.json({ bashoId, division, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rating database is unavailable";
    return Response.json({ error: message }, { status: 503 });
  }
}

