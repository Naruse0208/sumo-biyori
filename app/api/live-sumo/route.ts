const DIVISIONS = [
  { id: 6, name: "序ノ口" },
  { id: 5, name: "序二段" },
  { id: 4, name: "三段目" },
  { id: 3, name: "幕下" },
  { id: 2, name: "十両" },
  { id: 1, name: "幕内" },
] as const;

const BASHO_START_JST = "2026-07-12";
const UPSTREAM_TTL_MS = 60_000;

type UpstreamRikishi = {
  shikona?: string;
  shikona_kana?: string;
  shikona_eng?: string;
  banzuke_name?: string;
  won_number?: number;
  lost_number?: number;
};

type UpstreamBout = {
  judge?: number;
  technic_name?: string;
  east?: UpstreamRikishi;
  west?: UpstreamRikishi;
};

type UpstreamPayload = {
  dayHead?: string;
  dayName?: string;
  kakuName?: string;
  TorikumiData?: UpstreamBout[];
};

type LiveBout = {
  east: string;
  west: string;
  eastRank: string;
  westRank: string;
  eastScore: string;
  westScore: string;
  winner: "east" | "west" | null;
  technique: string | null;
};

type LiveDivision = {
  id: number;
  name: string;
  completed: number;
  total: number;
  nextBout: LiveBout | null;
  recentResults: LiveBout[];
};

type LiveResponse = {
  live: boolean;
  basho: string;
  day: number | null;
  dayLabel: string;
  currentDivision: LiveDivision | null;
  divisions: Array<Pick<LiveDivision, "id" | "name" | "completed" | "total">>;
  updatedAt: string;
  sourceUrl: string;
  displayRefreshSeconds: number;
  sourceRefreshSeconds: number;
  message?: string;
};

let memoryCache: { expiresAt: number; value: LiveResponse } | null = null;

function getJapanDay(): number | null {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const start = Date.parse(`${BASHO_START_JST}T00:00:00+09:00`);
  const current = Date.parse(`${today}T00:00:00+09:00`);
  const day = Math.floor((current - start) / 86_400_000) + 1;
  return day >= 1 && day <= 15 ? day : null;
}

function cleanShikona(rikishi?: UpstreamRikishi): string {
  if (!rikishi) return "未定";
  const raw = rikishi.shikona ?? "";
  const alt = raw.match(/alt=["']([^"']+)["']/i)?.[1];
  const plain = raw.replace(/<[^>]+>/g, "").replace(/^Image:\s*["']?|["']$/g, "").trim();
  return alt || plain || rikishi.shikona_kana || rikishi.shikona_eng || "未定";
}

function mapBout(bout: UpstreamBout): LiveBout {
  const judge = Number(bout.judge ?? 0);
  return {
    east: cleanShikona(bout.east),
    west: cleanShikona(bout.west),
    eastRank: bout.east?.banzuke_name ?? "東",
    westRank: bout.west?.banzuke_name ?? "西",
    eastScore: `${bout.east?.won_number ?? 0}勝${bout.east?.lost_number ?? 0}敗`,
    westScore: `${bout.west?.won_number ?? 0}勝${bout.west?.lost_number ?? 0}敗`,
    winner: judge === 1 ? "east" : judge === 2 ? "west" : null,
    technique: judge > 0 ? bout.technic_name || "決まり手確認中" : null,
  };
}

async function fetchDivision(id: number, name: string, day: number): Promise<LiveDivision> {
  const url = `https://www.sumo.or.jp/ResultData/torikumiAjax/${id}/${day}/`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `https://www.sumo.or.jp/ResultData/torikumi/${id}/${day}/`,
      "User-Agent": "DohyoBiyori/1.0 (+https://dohyo-biyori.uwaaaan.chatgpt.site)",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!response.ok) throw new Error(`Official result request failed: ${response.status}`);
  const payload = (await response.json()) as UpstreamPayload;
  const bouts = Array.isArray(payload.TorikumiData) ? payload.TorikumiData : [];
  const completed = bouts.filter((bout) => Number(bout.judge ?? 0) > 0).length;
  const next = bouts.find((bout) => Number(bout.judge ?? 0) === 0);
  const recent = bouts
    .filter((bout) => Number(bout.judge ?? 0) > 0)
    .slice(-5)
    .reverse()
    .map(mapBout);

  return {
    id,
    name: payload.kakuName || name,
    completed,
    total: bouts.length,
    nextBout: next ? mapBout(next) : null,
    recentResults: recent,
  };
}

function findCurrentDivision(divisions: LiveDivision[]): LiveDivision | null {
  const withBouts = divisions.filter((division) => division.total > 0);
  if (!withBouts.length) return null;

  const inProgress = withBouts.find(
    (division) => division.completed > 0 && division.completed < division.total,
  );
  if (inProgress) return inProgress;

  const firstWaiting = withBouts.find((division) => division.completed < division.total);
  return firstWaiting ?? withBouts[withBouts.length - 1];
}

async function loadLiveData(): Promise<LiveResponse> {
  const day = getJapanDay();
  const sourceUrl = day
    ? `https://www.sumo.or.jp/ResultData/torikumi/1/${day}/`
    : "https://www.sumo.or.jp/ResultData/torikumi/1/1/";

  if (!day) {
    return {
      live: false,
      basho: "令和八年 七月場所",
      day: null,
      dayLabel: "本場所の開催時間外です",
      currentDivision: null,
      divisions: [],
      updatedAt: new Date().toISOString(),
      sourceUrl,
      displayRefreshSeconds: 10,
      sourceRefreshSeconds: 60,
      message: "次の本場所では、取組の進行に合わせて自動更新します。",
    };
  }

  const divisions = await Promise.all(
    DIVISIONS.map((division) => fetchDivision(division.id, division.name, day)),
  );
  const currentDivision = findCurrentDivision(divisions);

  return {
    live: Boolean(currentDivision?.total),
    basho: "令和八年 七月場所",
    day,
    dayLabel: `${day}日目`,
    currentDivision,
    divisions: divisions.map(({ id, name, completed, total }) => ({ id, name, completed, total })),
    updatedAt: new Date().toISOString(),
    sourceUrl,
    displayRefreshSeconds: 10,
    sourceRefreshSeconds: 60,
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();
  try {
    if (memoryCache && memoryCache.expiresAt > now) {
      return Response.json(memoryCache.value, {
        headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=50" },
      });
    }

    const value = await loadLiveData();
    memoryCache = { expiresAt: now + UPSTREAM_TTL_MS, value };
    return Response.json(value, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=50" },
    });
  } catch {
    if (memoryCache) {
      return Response.json(
        { ...memoryCache.value, message: "公式データの再取得を待っています。直前の情報を表示中です。" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      {
        live: false,
        message: "公式取組情報を一時的に取得できませんでした。",
        updatedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
