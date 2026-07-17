const DIVISIONS = [
  { id: 6, name: "序ノ口" },
  { id: 5, name: "序二段" },
  { id: 4, name: "三段目" },
  { id: 3, name: "幕下" },
  { id: 2, name: "十両" },
  { id: 1, name: "幕内" },
] as const;

const UPSTREAM_TTL_MS = 60_000;

type UpstreamRikishi = {
  rikishi_id?: number;
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

type LiveDivisionSource = LiveDivision & {
  dayHead?: string;
  nextBoutSource: UpstreamBout | null;
  recentResultSources: UpstreamBout[];
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
const profileNameCache = new Map<number, string>();

function toKanjiNumber(value: number): string {
  const digits = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[value] ?? String(value);
  if (value < 20) return `十${value % 10 ? digits[value % 10] : ""}`;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    return `${digits[tens]}十${value % 10 ? digits[value % 10] : ""}`;
  }
  return String(value);
}

async function fetchBashoContext(): Promise<{ day: number; name: string }> {
  const response = await fetch("https://www.sumo.or.jp/", {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`Official homepage request failed: ${response.status}`);

  const html = await response.text();
  const match = html.match(
    /href=["']\/ResultData\/torikumi\/1\/(\d+)\/["'][^>]*>([^<]*場所)情報<\/a>/i,
  );
  const day = Number(match?.[1] ?? 0);
  const name = match?.[2]?.trim();
  if (!day || !name) throw new Error("Current basho context was not found");
  return { day, name };
}

function getEraYear(dayHead?: string): string {
  const match = dayHead?.match(/(令和)(\d+)年/);
  return match ? `${match[1]}${toKanjiNumber(Number(match[2]))}年` : "";
}

function getDayLabel(dayHead: string | undefined, day: number): string {
  return dayHead?.match(/([一二三四五六七八九十]+日目)/)?.[1] ?? `${toKanjiNumber(day)}日目`;
}

function cleanShikona(rikishi?: UpstreamRikishi): string {
  if (!rikishi) return "未定";
  const raw = rikishi.shikona ?? "";
  const alt = raw.match(/alt=["']([^"']+)["']/i)?.[1];
  const plain = raw.replace(/<[^>]+>/g, "").replace(/^Image:\s*["']?|["']$/g, "").trim();
  return alt || plain || rikishi.shikona_kana || rikishi.shikona_eng || "未定";
}

async function getKanjiShikona(rikishi?: UpstreamRikishi): Promise<string> {
  const id = Number(rikishi?.rikishi_id ?? 0);
  if (!id) return cleanShikona(rikishi);

  const cached = profileNameCache.get(id);
  if (cached) return cached;

  try {
    const response = await fetch(`https://www.sumo.or.jp/ResultRikishiData/profile/${id}/`, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return cleanShikona(rikishi);

    const html = await response.text();
    const title = html.match(/<title>\s*([^<]+?)\s*-\s*力士プロフィール/i)?.[1]?.trim();
    const shikona = title?.split(/\s+/)[0];
    if (!shikona) return cleanShikona(rikishi);

    profileNameCache.set(id, shikona);
    return shikona;
  } catch {
    return cleanShikona(rikishi);
  }
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

async function mapBoutWithKanjiNames(bout: UpstreamBout): Promise<LiveBout> {
  const [east, west] = await Promise.all([
    getKanjiShikona(bout.east),
    getKanjiShikona(bout.west),
  ]);
  return { ...mapBout(bout), east, west };
}

async function fetchDivision(id: number, name: string, day: number): Promise<LiveDivisionSource> {
  const url = `https://www.sumo.or.jp/ResultData/torikumiAjax/${id}/${day}/`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      Cookie: "mischeief=OK",
      Referer: `https://www.sumo.or.jp/ResultData/torikumi/${id}/${day}/`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!response.ok) throw new Error(`Official result request failed: ${response.status}`);
  const payload = (await response.json()) as UpstreamPayload;
  const bouts = Array.isArray(payload.TorikumiData) ? payload.TorikumiData : [];
  const completed = bouts.filter((bout) => Number(bout.judge ?? 0) > 0).length;
  const next = bouts.find((bout) => Number(bout.judge ?? 0) === 0);
  return {
    id,
    name: payload.kakuName || name,
    dayHead: payload.dayHead,
    completed,
    total: bouts.length,
    nextBout: null,
    recentResults: [],
    nextBoutSource: next ?? null,
    recentResultSources: bouts.filter((bout) => Number(bout.judge ?? 0) > 0).slice(-5).reverse(),
  };
}

function findCurrentDivision(divisions: LiveDivisionSource[]): LiveDivisionSource | null {
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
  const bashoContext = await fetchBashoContext();
  const day = bashoContext.day;
  const sourceUrl = `https://www.sumo.or.jp/ResultData/torikumi/1/${day}/`;

  const divisions = await Promise.all(
    DIVISIONS.map((division) => fetchDivision(division.id, division.name, day)),
  );
  const currentSource = findCurrentDivision(divisions);
  const dayHead = currentSource?.dayHead ?? divisions.find((division) => division.dayHead)?.dayHead;
  const currentDivision = currentSource
    ? {
        id: currentSource.id,
        name: currentSource.name,
        completed: currentSource.completed,
        total: currentSource.total,
        nextBout: currentSource.nextBoutSource
          ? await mapBoutWithKanjiNames(currentSource.nextBoutSource)
          : null,
        recentResults: await Promise.all(
          currentSource.recentResultSources.map(mapBoutWithKanjiNames),
        ),
      }
    : null;

  return {
    live: Boolean(currentDivision?.total),
    basho: `${getEraYear(dayHead)} ${bashoContext.name}`.trim(),
    day,
    dayLabel: getDayLabel(dayHead, day),
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
