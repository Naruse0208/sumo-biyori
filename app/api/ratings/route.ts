import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { banzukeEntries, ratingSnapshots, wrestlers } from "../../../db/schema";
import { loadBashoModelMetrics } from "../../lib/rating-model-assets";
import {
  japaneseRikishiName,
  officialRikishiProfile,
  rikishiProfilePath,
} from "../../lib/rikishi-names";

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

    if (!Number.isInteger(bashoId) || bashoId < 195803) {
      return Response.json({ error: "basho must be YYYYMM and 195803 or later" }, { status: 400 });
    }
    if (!Number.isInteger(division) || division < 0 || division > 6) {
      return Response.json({ error: "division must be between 0 and 6" }, { status: 400 });
    }

    const selection = {
        id: wrestlers.id,
        nskId: wrestlers.nskId,
        sumodbId: wrestlers.sumodbId,
        shikonaJp: wrestlers.shikonaJp,
        shikonaEn: wrestlers.shikonaEn,
        banzukeRank: banzukeEntries.rank,
        division: ratingSnapshots.division,
        elo: ratingSnapshots.elo,
        peakElo: ratingSnapshots.peakElo,
        dohyoScoreTenths: ratingSnapshots.dohyoScoreTenths,
        bouts: ratingSnapshots.bouts,
        wins: ratingSnapshots.wins,
        losses: ratingSnapshots.losses,
      };
    const joinBanzuke = and(
      eq(banzukeEntries.wrestlerId, ratingSnapshots.wrestlerId),
      eq(banzukeEntries.bashoId, ratingSnapshots.bashoId),
      eq(banzukeEntries.division, ratingSnapshots.division),
    );
    const rows = division === 0
      ? await db
        .select(selection)
        .from(ratingSnapshots)
        .innerJoin(wrestlers, eq(ratingSnapshots.wrestlerId, wrestlers.id))
        .innerJoin(banzukeEntries, joinBanzuke)
        .where(eq(ratingSnapshots.bashoId, bashoId))
        .orderBy(asc(ratingSnapshots.division), desc(ratingSnapshots.elo), desc(ratingSnapshots.wins))
        .limit(limit * 6)
      : await db
        .select(selection)
        .from(ratingSnapshots)
        .innerJoin(wrestlers, eq(ratingSnapshots.wrestlerId, wrestlers.id))
        .innerJoin(banzukeEntries, joinBanzuke)
        .where(and(eq(ratingSnapshots.bashoId, bashoId), eq(ratingSnapshots.division, division)))
        .orderBy(desc(ratingSnapshots.elo), desc(ratingSnapshots.wins))
        .limit(limit);

    const modelMetrics = await loadBashoModelMetrics(request, bashoId);
    const decorate = (row: (typeof rows)[number], index: number) => {
      const metric = modelMetrics.get(row.id);
      return {
        ...row,
        position: index + 1,
        shikonaJp: japaneseRikishiName(row.id, row.shikonaJp),
        profileUrl: rikishiProfilePath(row.id),
        officialProfileUrl: officialRikishiProfile(row.nskId),
        glickoRating: metric?.glickoRating ?? row.elo,
        glickoRdTenths: metric?.glickoRdTenths ?? null,
        glickoVolatilityMillionths: metric?.glickoVolatilityMillionths ?? null,
        sumoHensachiTenths: metric?.sumoHensachiTenths ?? row.dohyoScoreTenths,
        sekitoriHensachiTenths: metric?.sekitoriHensachiTenths ?? null,
        modelAvailable: Boolean(metric),
      };
    };

    if (division === 0) {
      return Response.json({
        bashoId,
        modelVersion: modelMetrics.size ? "Glicko-2 basho v1" : "Elo fallback",
        divisions: Array.from({ length: 6 }, (_, index) => ({
          id: index + 1,
          rows: rows
            .filter((row) => row.division === index + 1)
            .map(decorate),
        })),
      });
    }

    return Response.json({
      bashoId,
      division,
      modelVersion: modelMetrics.size ? "Glicko-2 basho v1" : "Elo fallback",
      rows: rows.map(decorate),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rating database is unavailable";
    return Response.json({ error: message }, { status: 503 });
  }
}
