import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { bouts, ratingSnapshots, wrestlers } from "../../../db/schema";
import { japaneseRikishiName, rikishiProfilePath } from "../../lib/rikishi-names";
import { loadRikishiModelHistory } from "../../lib/rating-model-assets";
import {
  dohyoPredictionV2,
  eloProbability,
  predictionConfidence,
  symmetricGlickoProbability,
} from "../../lib/prediction-model";

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
    const [eastHistory, westHistory] = await Promise.all([
      loadRikishiModelHistory(request, east.id),
      loadRikishiModelHistory(request, west.id),
    ]);
    const eastMetric = eastHistory.at(-1);
    const westMetric = westHistory.at(-1);
    const eastGlicko = {
      rating: eastMetric?.glickoRating ?? east.elo,
      rd: (eastMetric?.glickoRdTenths ?? 3500) / 10,
    };
    const westGlicko = {
      rating: westMetric?.glickoRating ?? west.elo,
      rd: (westMetric?.glickoRdTenths ?? 3500) / 10,
    };
    const eloRaw = eloProbability(east.elo, west.elo);
    const glickoRaw = eastMetric && westMetric
      ? symmetricGlickoProbability(eastGlicko, westGlicko)
      : eloRaw;

    const lowId = Math.min(east.id, west.id);
    const highId = Math.max(east.id, west.id);
    const pairRows = await getDb()
      .select({
        wrestlerAId: bouts.wrestlerAId,
        wrestlerBId: bouts.wrestlerBId,
        winnerWrestlerId: bouts.winnerWrestlerId,
        wrestlerAEloBefore: bouts.wrestlerAEloBefore,
        wrestlerBEloBefore: bouts.wrestlerBEloBefore,
      })
      .from(bouts)
      .where(and(eq(bouts.wrestlerAId, lowId), eq(bouts.wrestlerBId, highId)));
    let pairResidualSum = 0;
    let pairEvidence = 0;
    let eastHeadToHeadWins = 0;
    for (const bout of pairRows) {
      if (
        bout.winnerWrestlerId === null
        || bout.wrestlerAEloBefore === null
        || bout.wrestlerBEloBefore === null
      ) continue;
      const eastWasA = bout.wrestlerAId === east.id;
      const expected = eastWasA
        ? eloProbability(bout.wrestlerAEloBefore, bout.wrestlerBEloBefore)
        : eloProbability(bout.wrestlerBEloBefore, bout.wrestlerAEloBefore);
      const actual = bout.winnerWrestlerId === east.id ? 1 : 0;
      pairResidualSum += actual - expected;
      pairEvidence += 1;
      eastHeadToHeadWins += actual;
    }
    const matchupResidual = pairResidualSum / (pairEvidence + 8);
    const v2 = dohyoPredictionV2(glickoRaw, matchupResidual);
    const eastProbability = Math.round(v2.probability * 100);
    const eloEastProbability = Math.round(eloRaw * 100);
    const glickoEastProbability = Math.round(glickoRaw * 100);
    const confidence = predictionConfidence(eastGlicko.rd, westGlicko.rd);
    return Response.json({
      available: true,
      model: "土俵日和予測 v2",
      confidence,
      models: {
        elo: { eastProbability: eloEastProbability, westProbability: 100 - eloEastProbability },
        glicko2: { eastProbability: glickoEastProbability, westProbability: 100 - glickoEastProbability },
        dohyoV2: { eastProbability, westProbability: 100 - eastProbability },
      },
      explanation: {
        base: "Glicko-2による地力差",
        headToHeadBouts: pairEvidence,
        eastHeadToHeadWins,
        westHeadToHeadWins: pairEvidence - eastHeadToHeadWins,
        matchupAdjustmentPoints: Number(((v2.probability - glickoRaw) * 100).toFixed(1)),
        recentFormUsed: false,
        recentFormNote: "単純な直近成績補正は時系列検証で改善しなかったため未使用",
      },
      east: {
        id: east.id,
        name: japaneseRikishiName(east.id, east.shikonaJp) ?? east.shikonaEn,
        elo: east.elo,
        glickoRating: eastGlicko.rating,
        glickoRd: eastGlicko.rd,
        dohyoScore: east.dohyoScoreTenths / 10,
        probability: eastProbability,
        profileUrl: rikishiProfilePath(east.id),
      },
      west: {
        id: west.id,
        name: japaneseRikishiName(west.id, west.shikonaJp) ?? west.shikonaEn,
        elo: west.elo,
        glickoRating: westGlicko.rating,
        glickoRd: westGlicko.rd,
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
