import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { predictionRecords } from "../../../../db/schema";
import { predictionRecordId, validPredictionContext } from "../../../lib/prediction-record";

export const dynamic = "force-dynamic";

type ResultInput = {
  bashoId?: number;
  day?: number;
  division?: number;
  eastNskId?: number;
  westNskId?: number;
  winnerNskId?: number;
};

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { results?: ResultInput[] };
    const results = Array.isArray(payload.results) ? payload.results.slice(0, 24) : [];
    const valid = results.filter((result) => {
      const values = [
        Number(result.bashoId),
        Number(result.day),
        Number(result.division),
        Number(result.eastNskId),
        Number(result.westNskId),
        Number(result.winnerNskId),
      ];
      return validPredictionContext(values)
        && (result.winnerNskId === result.eastNskId || result.winnerNskId === result.westNskId);
    });

    await Promise.all(valid.map((result) => getDb()
      .update(predictionRecords)
      .set({ winnerNskId: result.winnerNskId!, resolvedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(predictionRecords.id, predictionRecordId(
        result.bashoId!,
        result.day!,
        result.division!,
        result.eastNskId!,
        result.westNskId!,
      )))));

    return Response.json({ accepted: valid.length });
  } catch {
    return Response.json({ accepted: 0 }, { status: 400 });
  }
}
