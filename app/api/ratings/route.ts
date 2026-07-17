import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { banzukeEntries, ratingSnapshots, wrestlers } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const bashoId = Number(url.searchParams.get("basho") ?? 0);
  const division = Number(url.searchParams.get("division") ?? 1);
  const limit = Math.min(400, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  try {
    const db = getDb();
    if (mode === "basho") {
      const rows = await db
        .selectDistinct({ bashoId: ratingSnapshots.bashoId })
        .from(ratingSnapshots)
        .orderBy(desc(ratingSnapshots.bashoId));
      return Response.json({ bashoIds: rows.map((row) => row.bashoId) });
    }

    if (!Number.isInteger(bashoId) || bashoId < 199901) {
      return Response.json({ error: "basho must be YYYYMM and 199901 or later" }, { status: 400 });
    }
    if (!Number.isInteger(division) || division < 1 || division > 6) {
      return Response.json({ error: "division must be between 1 and 6" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: wrestlers.id,
        nskId: wrestlers.nskId,
        sumodbId: wrestlers.sumodbId,
        shikonaJp: wrestlers.shikonaJp,
        shikonaEn: wrestlers.shikonaEn,
        banzukeRank: banzukeEntries.rank,
        elo: ratingSnapshots.elo,
        peakElo: ratingSnapshots.peakElo,
        dohyoScoreTenths: ratingSnapshots.dohyoScoreTenths,
        bouts: ratingSnapshots.bouts,
        wins: ratingSnapshots.wins,
        losses: ratingSnapshots.losses,
      })
      .from(ratingSnapshots)
      .innerJoin(wrestlers, eq(ratingSnapshots.wrestlerId, wrestlers.id))
      .innerJoin(
        banzukeEntries,
        and(
          eq(banzukeEntries.wrestlerId, ratingSnapshots.wrestlerId),
          eq(banzukeEntries.bashoId, ratingSnapshots.bashoId),
          eq(banzukeEntries.division, ratingSnapshots.division),
        ),
      )
      .where(and(eq(ratingSnapshots.bashoId, bashoId), eq(ratingSnapshots.division, division)))
      .orderBy(desc(ratingSnapshots.elo), desc(ratingSnapshots.wins))
      .limit(limit);

    return Response.json({
      bashoId,
      division,
      rows: rows.map((row, index) => ({
        ...row,
        position: index + 1,
        profileUrl: row.nskId
          ? `https://www.sumo.or.jp/ResultRikishiData/profile/${row.nskId}/`
          : null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rating database is unavailable";
    return Response.json({ error: message }, { status: 503 });
  }
}
