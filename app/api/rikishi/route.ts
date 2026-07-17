import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { banzukeEntries, ratingSnapshots, wrestlers } from "../../../db/schema";
import {
  japaneseRikishiName,
  officialRikishiProfile,
} from "../../lib/rikishi-names";
import { loadRikishiModelHistory } from "../../lib/rating-model-assets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref")?.trim() ?? "";
  const nskMatch = ref.match(/^nsk-(\d+)$/);
  const internalId = Number(ref);
  if (!nskMatch && (!Number.isInteger(internalId) || internalId <= 0)) {
    return Response.json({ error: "Invalid rikishi reference" }, { status: 400 });
  }

  try {
    const db = getDb();
    const wrestler = await db
      .select()
      .from(wrestlers)
      .where(nskMatch ? eq(wrestlers.nskId, Number(nskMatch[1])) : eq(wrestlers.id, internalId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!wrestler) return Response.json({ error: "Rikishi not found" }, { status: 404 });

    const eloHistory = await db
      .select({
        bashoId: ratingSnapshots.bashoId,
        division: ratingSnapshots.division,
        elo: ratingSnapshots.elo,
        peakElo: ratingSnapshots.peakElo,
        dohyoScoreTenths: ratingSnapshots.dohyoScoreTenths,
        bouts: ratingSnapshots.bouts,
        wins: ratingSnapshots.wins,
        losses: ratingSnapshots.losses,
        rank: banzukeEntries.rank,
      })
      .from(ratingSnapshots)
      .innerJoin(
        banzukeEntries,
        and(
          eq(banzukeEntries.wrestlerId, ratingSnapshots.wrestlerId),
          eq(banzukeEntries.bashoId, ratingSnapshots.bashoId),
          eq(banzukeEntries.division, ratingSnapshots.division),
        ),
      )
      .where(eq(ratingSnapshots.wrestlerId, wrestler.id))
      .orderBy(asc(ratingSnapshots.bashoId));

    const modelHistory = await loadRikishiModelHistory(request, wrestler.id);
    const modelByBasho = new Map(modelHistory.map((point) => [point.bashoId, point]));
    const history = eloHistory.map((point) => {
      const model = modelByBasho.get(point.bashoId);
      return {
        ...point,
        glickoRating: model?.glickoRating ?? point.elo,
        glickoRdTenths: model?.glickoRdTenths ?? null,
        glickoVolatilityMillionths: model?.glickoVolatilityMillionths ?? null,
        sumoHensachiTenths: model?.sumoHensachiTenths ?? point.dohyoScoreTenths,
        sekitoriHensachiTenths: model?.sekitoriHensachiTenths ?? null,
        modelAvailable: Boolean(model),
      };
    });

    const latest = history.at(-1) ?? null;
    return Response.json({
      wrestler: {
        id: wrestler.id,
        nskId: wrestler.nskId,
        sumodbId: wrestler.sumodbId,
        displayName: japaneseRikishiName(wrestler.id, wrestler.shikonaJp) ?? wrestler.shikonaEn,
        shikonaEn: wrestler.shikonaEn,
        heya: wrestler.heya,
        birthDate: wrestler.birthDate,
        shusshin: wrestler.shusshin,
        heightCm: wrestler.heightMm ? wrestler.heightMm / 10 : null,
        weightKg: wrestler.weightKg,
        debutBashoId: wrestler.debutBashoId,
        intaiDate: wrestler.intaiDate,
        officialProfileUrl: officialRikishiProfile(wrestler.nskId),
      },
      latest,
      history,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rikishi database is unavailable";
    return Response.json({ error: message }, { status: 503 });
  }
}
