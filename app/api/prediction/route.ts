import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { bouts, predictionRecords, ratingSnapshots, wrestlers } from "../../../db/schema";
import evaluation from "../../../data/model-evaluation.json";
import { japaneseRikishiName, rikishiProfilePath } from "../../lib/rikishi-names";
import { loadRikishiModelHistory } from "../../lib/rating-model-assets";
import { predictionRecordId, validPredictionContext } from "../../lib/prediction-record";
import {
  calibrateProbability,
  dohyoPredictionV2,
  dohyoPredictionV3,
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
      heightMm: wrestlers.heightMm,
      weightKg: wrestlers.weightKg,
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
    const glickoCalibrated = calibrateProbability(
      glickoRaw,
      evaluation.calibrationSlopes.glicko2,
    );

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
    const v2 = dohyoPredictionV2(
      glickoRaw,
      matchupResidual,
      evaluation.calibrationSlopes.dohyoV2,
    );
    const styleRows = evaluation.currentStyles as Record<string, number[]>;
    const eastStyle = styleRows[String(east.id)] ?? [0.25, 0.25, 0.25, 0.25, 0];
    const westStyle = styleRows[String(west.id)] ?? [0.25, 0.25, 0.25, 0.25, 0];
    const hasBody = east.heightMm !== null && east.weightKg !== null
      && west.heightMm !== null && west.weightKg !== null;
    const features = [
      hasBody ? Math.max(-2.5, Math.min(2.5, (east.weightKg! - west.weightKg!) / 40)) : 0,
      hasBody ? Math.max(-2.5, Math.min(2.5, (east.heightMm! - west.heightMm!) / 150)) : 0,
      (eastStyle[0] ?? 0.25) - (westStyle[0] ?? 0.25),
      (eastStyle[1] ?? 0.25) - (westStyle[1] ?? 0.25),
      (eastStyle[2] ?? 0.25) - (westStyle[2] ?? 0.25),
    ];
    const v3 = dohyoPredictionV3(v2.probability, features, evaluation.v3.weights);
    const eastProbability = Math.round(v2.probability * 100);
    const v3EastProbability = Math.round(v3.probability * 100);
    const eloEastProbability = Math.round(eloRaw * 100);
    const glickoEastProbability = Math.round(glickoCalibrated * 100);
    const confidence = predictionConfidence(eastGlicko.rd, westGlicko.rd);
    const bashoId = Number(url.searchParams.get("basho"));
    const day = Number(url.searchParams.get("day"));
    const division = Number(url.searchParams.get("division"));
    if (validPredictionContext([bashoId, day, division])) {
      await getDb().insert(predictionRecords).values({
        id: predictionRecordId(bashoId, day, division, eastNskId, westNskId),
        bashoId,
        day,
        division,
        eastNskId,
        westNskId,
        modelVersion: "dohyo-v2.1-v3exp",
        eloEastBp: Math.round(eloRaw * 10_000),
        glickoEastBp: Math.round(glickoCalibrated * 10_000),
        dohyoV2EastBp: Math.round(v2.probability * 10_000),
        dohyoV3EastBp: Math.round(v3.probability * 10_000),
      }).onConflictDoNothing();
    }
    return Response.json({
      available: true,
      model: "土俵日和予測 v2.1",
      confidence,
      models: {
        elo: { eastProbability: eloEastProbability, westProbability: 100 - eloEastProbability },
        glicko2: { eastProbability: glickoEastProbability, westProbability: 100 - glickoEastProbability },
        dohyoV2: { eastProbability, westProbability: 100 - eastProbability },
        dohyoV3: { eastProbability: v3EastProbability, westProbability: 100 - v3EastProbability },
      },
      explanation: {
        base: "Glicko-2による地力差",
        headToHeadBouts: pairEvidence,
        eastHeadToHeadWins,
        westHeadToHeadWins: pairEvidence - eastHeadToHeadWins,
        matchupAdjustmentPoints: Number(((v2.probability - glickoRaw) * 100).toFixed(1)),
        calibrationUsed: true,
        recentFormUsed: false,
        recentFormNote: "単純な直近成績補正は時系列検証で改善しなかったため未使用",
        v3: {
          status: "experimental",
          bodyUsed: hasBody,
          styleBoutsEast: eastStyle[4] ?? 0,
          styleBoutsWest: westStyle[4] ?? 0,
          adjustmentPoints: Number(((v3.probability - v2.probability) * 100).toFixed(1)),
          note: evaluation.v3.caveat,
        },
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
