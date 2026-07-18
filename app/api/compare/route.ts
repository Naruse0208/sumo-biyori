import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { banzukeEntries, bouts, ratingSnapshots, wrestlers } from "../../../db/schema";
import evaluation from "../../../data/model-evaluation.json";
import { japaneseRikishiName, rikishiProfilePath } from "../../lib/rikishi-names";
import { loadRikishiModelHistory } from "../../lib/rating-model-assets";
import {
  calibrateProbability,
  dohyoPredictionV2,
  eloProbability,
  predictionConfidence,
  symmetricGlickoProbability,
} from "../../lib/prediction-model";

export const dynamic = "force-dynamic";

const json = (body: unknown, init?: ResponseInit) => Response.json(body, {
  ...init,
  headers: {
    "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    ...init?.headers,
  },
});

function displayName(wrestler: { id: number; shikonaJp: string | null; shikonaEn: string }) {
  return japaneseRikishiName(wrestler.id, wrestler.shikonaJp) ?? wrestler.shikonaEn;
}

const searchEquivalentCharacters = [
  ["ノ", "乃"],
  ["ヶ", "ケ"],
  ["竜", "龍"],
  ["富", "冨"],
  ["国", "國"],
  ["浜", "濱"],
  ["桜", "櫻"],
  ["高", "髙"],
] as const;

function searchVariants(value: string) {
  const normalized = value.normalize("NFKC").trim();
  const variants = new Set([normalized]);
  for (const [first, second] of searchEquivalentCharacters) {
    for (const candidate of [...variants]) {
      if (candidate.includes(first)) variants.add(candidate.replaceAll(first, second));
      if (candidate.includes(second)) variants.add(candidate.replaceAll(second, first));
    }
  }
  return [...variants].slice(0, 32);
}

function searchKey(value: string) {
  return searchEquivalentCharacters.reduce(
    (result, [first, second]) => result.replaceAll(second, first),
    value.normalize("NFKC").toLocaleLowerCase("ja-JP").replaceAll(" ", ""),
  );
}

function rankTitle(rank: string | null) {
  const title = rank?.split(" ")[0] ?? "";
  return (({
    Yokozuna: "横綱",
    Ozeki: "大関",
    Sekiwake: "関脇",
    Komusubi: "小結",
    Maegashira: "前頭",
    Juryo: "十両",
    Makushita: "幕下",
    Sandanme: "三段目",
    Jonidan: "序二段",
    Jonokuchi: "序ノ口",
  } as Record<string, string>)[title] ?? title) || "番付不明";
}

async function searchRikishi(query: string) {
  const db = getDb();
  const variants = searchVariants(query).map((value) => value.replaceAll("%", "").replaceAll("_", ""));
  const conditions = variants.flatMap((value) => [
    like(wrestlers.shikonaJp, `%${value}%`),
    like(wrestlers.shikonaEn, `%${value}%`),
  ]);
  const rows = await db
    .select({
      id: wrestlers.id,
      nskId: wrestlers.nskId,
      shikonaJp: wrestlers.shikonaJp,
      shikonaEn: wrestlers.shikonaEn,
      heya: wrestlers.heya,
      birthDate: wrestlers.birthDate,
      debutBashoId: wrestlers.debutBashoId,
      intaiDate: wrestlers.intaiDate,
    })
    .from(wrestlers)
    .where(or(...conditions))
    .limit(30);
  if (!rows.length) return [];
  const careerRows = await db
    .select({
      wrestlerId: banzukeEntries.wrestlerId,
      bestRank: sql<string>`MIN(printf('%02d-%06d', ${banzukeEntries.division}, COALESCE(${banzukeEntries.rankValue}, 999999)) || '|' || ${banzukeEntries.rank})`,
      firstBasho: sql<number>`MIN(${banzukeEntries.bashoId})`,
      lastBasho: sql<number>`MAX(${banzukeEntries.bashoId})`,
    })
    .from(banzukeEntries)
    .where(inArray(banzukeEntries.wrestlerId, rows.map((row) => row.id)))
    .groupBy(banzukeEntries.wrestlerId);
  const careerById = new Map(careerRows.map((row) => [row.wrestlerId, row]));
  const queryKey = searchKey(query);
  return rows
    .map((row) => {
      const career = careerById.get(row.id);
      const rank = career?.bestRank?.split("|").at(-1) ?? null;
      const name = displayName(row);
      const nameKey = searchKey(name);
      const englishKey = searchKey(row.shikonaEn);
      const score = nameKey === queryKey || englishKey === queryKey
        ? 0
        : nameKey.startsWith(queryKey) || englishKey.startsWith(queryKey)
          ? 1
          : nameKey.includes(queryKey) || englishKey.includes(queryKey)
            ? 2
            : 3;
      return {
        ...row,
        name,
        highestRank: rankTitle(rank),
        firstBasho: career?.firstBasho ?? row.debutBashoId,
        lastBasho: career?.lastBasho ?? null,
        profileUrl: rikishiProfilePath(row.id),
        searchScore: score,
      };
    })
    .sort((left, right) => left.searchScore - right.searchScore || (right.lastBasho ?? 0) - (left.lastBasho ?? 0))
    .slice(0, 18)
    .map(({ searchScore: _searchScore, ...row }) => row);
}

async function yokozunaCandidates() {
  const db = getDb();
  const firstYokozunaBasho = sql<number>`min(${banzukeEntries.bashoId})`;
  const rows = await db
    .select({
      id: wrestlers.id,
      nskId: wrestlers.nskId,
      shikonaJp: wrestlers.shikonaJp,
      shikonaEn: wrestlers.shikonaEn,
      intaiDate: wrestlers.intaiDate,
      firstYokozunaBasho,
    })
    .from(wrestlers)
    .innerJoin(banzukeEntries, eq(banzukeEntries.wrestlerId, wrestlers.id))
    .where(like(banzukeEntries.rank, "%Yokozuna%"))
    .groupBy(
      wrestlers.id,
      wrestlers.nskId,
      wrestlers.shikonaJp,
      wrestlers.shikonaEn,
      wrestlers.intaiDate,
    )
    .orderBy(asc(firstYokozunaBasho), asc(wrestlers.id));
  return rows.map((row) => ({ ...row, name: displayName(row), profileUrl: rikishiProfilePath(row.id) }));
}

async function ratingHistory(request: Request, wrestlerId: number) {
  const db = getDb();
  const elo = await db
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
    .where(eq(ratingSnapshots.wrestlerId, wrestlerId))
    .orderBy(asc(ratingSnapshots.bashoId));
  const model = await loadRikishiModelHistory(request, wrestlerId);
  const modelByBasho = new Map(model.map((point) => [point.bashoId, point]));
  return elo.map((point) => {
    const metric = modelByBasho.get(point.bashoId);
    return {
      ...point,
      glickoRating: metric?.glickoRating ?? point.elo,
      glickoRdTenths: metric?.glickoRdTenths ?? null,
      sumoHensachiTenths: metric?.sumoHensachiTenths ?? point.dohyoScoreTenths,
    };
  });
}

async function wrestlerBouts(wrestlerId: number) {
  return getDb()
    .select({
      id: bouts.id,
      bashoId: bouts.bashoId,
      day: bouts.day,
      wrestlerAId: bouts.wrestlerAId,
      wrestlerBId: bouts.wrestlerBId,
      winnerWrestlerId: bouts.winnerWrestlerId,
      kimarite: bouts.kimarite,
    })
    .from(bouts)
    .where(or(eq(bouts.wrestlerAId, wrestlerId), eq(bouts.wrestlerBId, wrestlerId)))
    .orderBy(desc(bouts.bashoId), desc(bouts.day))
    .limit(180);
}

function summarizeStyle(
  wrestlerId: number,
  rows: Awaited<ReturnType<typeof wrestlerBouts>>,
) {
  const wins = rows.filter((row) => row.winnerWrestlerId === wrestlerId);
  const counts = new Map<string, number>();
  for (const row of wins) {
    if (!row.kimarite) continue;
    counts.set(row.kimarite, (counts.get(row.kimarite) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kimarite, count]) => ({ kimarite, count, share: wins.length ? Math.round(count / wins.length * 100) : 0 }));
}

function recentForm(wrestlerId: number, rows: Awaited<ReturnType<typeof wrestlerBouts>>) {
  return rows.slice(0, 10).map((row) => ({
    bashoId: row.bashoId,
    day: row.day,
    won: row.winnerWrestlerId === wrestlerId,
  }));
}

function careerSummary(history: Awaited<ReturnType<typeof ratingHistory>>) {
  const latest = history.at(-1) ?? null;
  const peakEloPoint = history.reduce<(typeof history)[number] | null>(
    (best, point) => !best || point.elo > best.elo ? point : best,
    null,
  );
  const peakGlickoPoint = history.reduce<(typeof history)[number] | null>(
    (best, point) => !best || point.glickoRating > best.glickoRating ? point : best,
    null,
  );
  const peakHensachiPoint = history.reduce<(typeof history)[number] | null>(
    (best, point) => !best || point.sumoHensachiTenths > best.sumoHensachiTenths ? point : best,
    null,
  );
  const topSix = [...history]
    .filter((point) => point.division === 1)
    .sort((a, b) => b.sumoHensachiTenths - a.sumoHensachiTenths)
    .slice(0, 6);
  const sustainedHensachi = topSix.length
    ? Math.round(topSix.reduce((sum, point) => sum + point.sumoHensachiTenths, 0) / topSix.length)
    : null;
  return {
    latest,
    peakElo: peakEloPoint ? { value: peakEloPoint.elo, bashoId: peakEloPoint.bashoId } : null,
    peakGlicko: peakGlickoPoint ? {
      value: peakGlickoPoint.glickoRating,
      rd: (peakGlickoPoint.glickoRdTenths ?? 3500) / 10,
      bashoId: peakGlickoPoint.bashoId,
    } : null,
    peakHensachi: peakHensachiPoint ? {
      value: peakHensachiPoint.sumoHensachiTenths / 10,
      bashoId: peakHensachiPoint.bashoId,
    } : null,
    sustainedHensachi: sustainedHensachi === null ? null : sustainedHensachi / 10,
    makuuchiBasho: history.filter((point) => point.division === 1).length,
    firstBasho: history[0]?.bashoId ?? null,
    lastBasho: latest?.bashoId ?? null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  try {
    if (mode === "search") {
      const query = url.searchParams.get("q")?.trim() ?? "";
      if (query.length < 1) return json({ rows: [] });
      return json({ rows: await searchRikishi(query) });
    }
    if (mode === "yokozuna") return json({ rows: await yokozunaCandidates() });

    const leftId = Number(url.searchParams.get("left"));
    const rightId = Number(url.searchParams.get("right"));
    if (![leftId, rightId].every((id) => Number.isInteger(id) && id > 0) || leftId === rightId) {
      return json({ error: "異なる2力士を選んでください" }, { status: 400 });
    }
    const db = getDb();
    const [leftWrestler, rightWrestler] = await Promise.all([
      db.select().from(wrestlers).where(eq(wrestlers.id, leftId)).limit(1).then((rows) => rows[0]),
      db.select().from(wrestlers).where(eq(wrestlers.id, rightId)).limit(1).then((rows) => rows[0]),
    ]);
    if (!leftWrestler || !rightWrestler) return json({ error: "力士が見つかりません" }, { status: 404 });

    const [leftHistory, rightHistory, leftBoutRows, rightBoutRows, pairRows] = await Promise.all([
      ratingHistory(request, leftId),
      ratingHistory(request, rightId),
      wrestlerBouts(leftId),
      wrestlerBouts(rightId),
      db.select({
        id: bouts.id,
        bashoId: bouts.bashoId,
        day: bouts.day,
        wrestlerAId: bouts.wrestlerAId,
        wrestlerBId: bouts.wrestlerBId,
        winnerWrestlerId: bouts.winnerWrestlerId,
        kimarite: bouts.kimarite,
        wrestlerAEloBefore: bouts.wrestlerAEloBefore,
        wrestlerBEloBefore: bouts.wrestlerBEloBefore,
      }).from(bouts).where(or(
        and(eq(bouts.wrestlerAId, leftId), eq(bouts.wrestlerBId, rightId)),
        and(eq(bouts.wrestlerAId, rightId), eq(bouts.wrestlerBId, leftId)),
      )).orderBy(desc(bouts.bashoId), desc(bouts.day)),
    ]);

    const leftCareer = careerSummary(leftHistory);
    const rightCareer = careerSummary(rightHistory);
    const leftLatest = leftCareer.latest;
    const rightLatest = rightCareer.latest;
    const leftCurrentGlicko = leftLatest?.glickoRating ?? 1500;
    const rightCurrentGlicko = rightLatest?.glickoRating ?? 1500;
    const leftCurrentRd = (leftLatest?.glickoRdTenths ?? 3500) / 10;
    const rightCurrentRd = (rightLatest?.glickoRdTenths ?? 3500) / 10;
    const glickoRaw = symmetricGlickoProbability(
      { rating: leftCurrentGlicko, rd: leftCurrentRd },
      { rating: rightCurrentGlicko, rd: rightCurrentRd },
    );
    const glickoProbability = calibrateProbability(glickoRaw, evaluation.calibrationSlopes.glicko2);
    let residual = 0;
    let evidence = 0;
    let leftWins = 0;
    for (const bout of pairRows) {
      if (bout.winnerWrestlerId === null) continue;
      if (bout.winnerWrestlerId === leftId) leftWins += 1;
      if (bout.wrestlerAEloBefore === null || bout.wrestlerBEloBefore === null) continue;
      const leftWasA = bout.wrestlerAId === leftId;
      const expected = leftWasA
        ? eloProbability(bout.wrestlerAEloBefore, bout.wrestlerBEloBefore)
        : eloProbability(bout.wrestlerBEloBefore, bout.wrestlerAEloBefore);
      residual += (bout.winnerWrestlerId === leftId ? 1 : 0) - expected;
      evidence += 1;
    }
    const adjusted = dohyoPredictionV2(
      glickoRaw,
      residual / (evidence + 8),
      evaluation.calibrationSlopes.dohyoV2,
    ).probability;
    const peakProbability = leftCareer.peakGlicko && rightCareer.peakGlicko
      ? symmetricGlickoProbability(
        { rating: leftCareer.peakGlicko.value, rd: leftCareer.peakGlicko.rd },
        { rating: rightCareer.peakGlicko.value, rd: rightCareer.peakGlicko.rd },
      )
      : 0.5;

    const profile = (wrestler: NonNullable<typeof leftWrestler>, history: typeof leftHistory, career: ReturnType<typeof careerSummary>, boutRows: Awaited<ReturnType<typeof wrestlerBouts>>) => ({
      id: wrestler.id,
      nskId: wrestler.nskId,
      name: displayName(wrestler),
      shikonaEn: wrestler.shikonaEn,
      heya: wrestler.heya,
      birthDate: wrestler.birthDate,
      shusshin: wrestler.shusshin,
      heightCm: wrestler.heightMm ? wrestler.heightMm / 10 : null,
      weightKg: wrestler.weightKg,
      intaiDate: wrestler.intaiDate,
      profileUrl: rikishiProfilePath(wrestler.id),
      history,
      career,
      style: summarizeStyle(wrestler.id, boutRows),
      recentForm: recentForm(wrestler.id, boutRows),
    });

    return json({
      left: profile(leftWrestler, leftHistory, leftCareer, leftBoutRows),
      right: profile(rightWrestler, rightHistory, rightCareer, rightBoutRows),
      prediction: {
        currentLeftProbability: Math.round(adjusted * 100),
        glickoLeftProbability: Math.round(glickoProbability * 100),
        peakLeftProbability: Math.round(peakProbability * 100),
        confidence: predictionConfidence(leftCurrentRd, rightCurrentRd),
        headToHeadAdjustmentPoints: Number(((adjusted - glickoRaw) * 100).toFixed(1)),
      },
      headToHead: {
        bouts: pairRows.length,
        leftWins,
        rightWins: pairRows.filter((row) => row.winnerWrestlerId === rightId).length,
        rows: pairRows.slice(0, 20).map((row) => ({
          id: row.id,
          bashoId: row.bashoId,
          day: row.day,
          winnerId: row.winnerWrestlerId,
          kimarite: row.kimarite,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "比較データを取得できませんでした";
    return json({ error: message }, { status: 503 });
  }
}
