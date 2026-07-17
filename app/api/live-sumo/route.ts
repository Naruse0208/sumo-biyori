import { readOfficialNames, saveOfficialNames } from "../../../db/official-name-cache";

const DIVISIONS = [
  { id: 6, name: "序ノ口" },
  { id: 5, name: "序二段" },
  { id: 4, name: "三段目" },
  { id: 3, name: "幕下" },
  { id: 2, name: "十両" },
  { id: 1, name: "幕内" },
] as const;

const UPSTREAM_TTL_MS = 15_000;

type UpstreamRikishi = {
  rikishi_id?: number;
  shikona?: string;
  shikona_kana?: string;
  shikona_eng?: string;
  banzuke_name?: string;
  won_number?: number;
  lost_number?: number;
  banzuke_ew?: 1 | 2;
};

type UpstreamBout = {
  judge?: number;
  technic_name?: string;
  east?: UpstreamRikishi;
  west?: UpstreamRikishi;
};

type UpstreamPayload = {
  basho_id?: number;
  dayHead?: string;
  dayName?: string;
  kakuName?: string;
  TorikumiData?: UpstreamBout[];
};

type LiveBoutStatus = "past" | "current" | "next";

type LiveBout = {
  east: string;
  west: string;
  eastProfileUrl: string | null;
  westProfileUrl: string | null;
  eastRank: string;
  westRank: string;
  eastBanzukeSide: "east" | "west" | null;
  westBanzukeSide: "east" | "west" | null;
  eastScore: string;
  westScore: string;
  winner: "east" | "west" | null;
  technique: string | null;
  status: LiveBoutStatus;
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
  bashoId?: number;
  dayHead?: string;
  nextBoutSource: UpstreamBout | null;
  recentResultSources: Array<{ bout: UpstreamBout; status: LiveBoutStatus }>;
  allBoutSources: Array<{ bout: UpstreamBout; status: LiveBoutStatus }>;
};

type UpstreamBanzukeRikishi = {
  banzuke_name?: string;
  ew?: number;
  rank?: number;
  rikishi_id?: number;
  seat_order?: number;
  shikona?: string;
};

type UpstreamBanzukePayload = {
  BanzukeTable?: UpstreamBanzukeRikishi[];
};

type LiveBanzukeRow = {
  rank: string;
  east: string | null;
  west: string | null;
  eastProfileUrl: string | null;
  westProfileUrl: string | null;
};

type LiveResponse = {
  live: boolean;
  basho: string;
  day: number | null;
  dayLabel: string;
  currentDivision: LiveDivision | null;
  resultDivision: LiveDivision | null;
  divisions: Array<Pick<LiveDivision, "id" | "name" | "completed" | "total">>;
  banzuke: LiveBanzukeRow[];
  updatedAt: string;
  sourceUrl: string;
  displayRefreshSeconds: number;
  sourceRefreshSeconds: number;
  message?: string;
};

type LiveSourceSnapshot = {
  bashoName: string;
  day: number;
  dayHead?: string;
  bashoId?: number;
  divisions: LiveDivisionSource[];
  banzuke: LiveBanzukeRow[];
  updatedAt: string;
};

let sourceCache: { expiresAt: number; value: LiveSourceSnapshot } | null = null;
let banzukeCache: {
  bashoId: number;
  rows: LiveBanzukeRow[];
  sides: Map<number, 1 | 2>;
} | null = null;
const responseCache = new Map<string, LiveResponse>();
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

function profileUrl(rikishiId?: number): string | null {
  return rikishiId
    ? `https://www.sumo.or.jp/ResultRikishiData/profile/${rikishiId}/`
    : null;
}

async function getKanjiShikona(rikishi?: UpstreamRikishi): Promise<string> {
  const id = Number(rikishi?.rikishi_id ?? 0);
  const upstreamName = cleanShikona(rikishi);
  if (!id) return upstreamName;

  const cached = profileNameCache.get(id);
  if (cached) return cached;
  if (/[一-龯々]/.test(upstreamName)) {
    profileNameCache.set(id, upstreamName);
    return upstreamName;
  }

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

function mapBout(bout: UpstreamBout, status: LiveBoutStatus): LiveBout {
  const judge = Number(bout.judge ?? 0);
  return {
    east: cleanShikona(bout.east),
    west: cleanShikona(bout.west),
    eastProfileUrl: profileUrl(bout.east?.rikishi_id),
    westProfileUrl: profileUrl(bout.west?.rikishi_id),
    eastRank: bout.east?.banzuke_name ?? "東",
    westRank: bout.west?.banzuke_name ?? "西",
    eastBanzukeSide: bout.east?.banzuke_ew === 1 ? "east" : bout.east?.banzuke_ew === 2 ? "west" : null,
    westBanzukeSide: bout.west?.banzuke_ew === 1 ? "east" : bout.west?.banzuke_ew === 2 ? "west" : null,
    eastScore: `${bout.east?.won_number ?? 0}勝${bout.east?.lost_number ?? 0}敗`,
    westScore: `${bout.west?.won_number ?? 0}勝${bout.west?.lost_number ?? 0}敗`,
    winner: judge === 1 ? "east" : judge === 2 ? "west" : null,
    technique: judge > 0 ? bout.technic_name || "決まり手確認中" : null,
    status,
  };
}

async function fetchBanzukeDivision(
  bashoId: number,
  divisionId: number,
): Promise<UpstreamBanzukeRikishi[]> {
  const response = await fetch(`https://www.sumo.or.jp/ResultBanzuke/tableAjax/${divisionId}/1/`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: "and=mouse",
      Referer: "https://www.sumo.or.jp/ResultBanzuke/table/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams({ kakuzuke_id: String(divisionId), basho_id: String(bashoId), page: "1" }),
  });
  if (!response.ok) throw new Error(`Official banzuke request failed: ${response.status}`);

  const payload = (await response.json()) as UpstreamBanzukePayload;
  return Array.isArray(payload.BanzukeTable) ? payload.BanzukeTable : [];
}

function mapMakuuchiBanzuke(wrestlers: UpstreamBanzukeRikishi[]): LiveBanzukeRow[] {
  const topDivision = wrestlers.filter((item) => Number(item.rank ?? 999) <= 400);
  const rows = new Map<string, LiveBanzukeRow>();

  for (const wrestler of topDivision) {
    const rank = wrestler.banzuke_name?.trim();
    if (!rank) continue;
    const key = `${wrestler.rank ?? rank}-${wrestler.seat_order ?? 1}`;
    const row = rows.get(key) ?? {
      rank,
      east: null,
      west: null,
      eastProfileUrl: null,
      westProfileUrl: null,
    };
    const shikona = wrestler.shikona?.trim().split(/\s+/)[0] ?? null;
    if (Number(wrestler.ew) === 1) {
      row.east = shikona;
      row.eastProfileUrl = profileUrl(wrestler.rikishi_id);
    } else {
      row.west = shikona;
      row.westProfileUrl = profileUrl(wrestler.rikishi_id);
    }
    rows.set(key, row);
  }

  return [...rows.values()];
}

async function fetchCurrentBanzuke(bashoId: number): Promise<{
  rows: LiveBanzukeRow[];
  sides: Map<number, 1 | 2>;
}> {
  if (banzukeCache?.bashoId === bashoId) {
    return { rows: banzukeCache.rows, sides: banzukeCache.sides };
  }

  const tables = await Promise.all(
    DIVISIONS.map((division) =>
      fetchBanzukeDivision(bashoId, division.id).catch(() => [] as UpstreamBanzukeRikishi[]),
    ),
  );
  const sides = new Map<number, 1 | 2>();
  for (const wrestler of tables.flat()) {
    const id = Number(wrestler.rikishi_id ?? 0);
    const ew = Number(wrestler.ew ?? 0);
    if (id && (ew === 1 || ew === 2)) sides.set(id, ew);
  }

  const rows = mapMakuuchiBanzuke(tables[DIVISIONS.findIndex((division) => division.id === 1)] ?? []);
  banzukeCache = { bashoId, rows, sides };
  return { rows, sides };
}

function applyBanzukeSides(
  divisions: LiveDivisionSource[],
  sides: Map<number, 1 | 2>,
): void {
  for (const division of divisions) {
    for (const { bout } of division.allBoutSources) {
      for (const rikishi of [bout.east, bout.west]) {
        const id = Number(rikishi?.rikishi_id ?? 0);
        const ew = sides.get(id);
        if (rikishi && ew) rikishi.banzuke_ew = ew;
      }
    }
  }
}

function isKanjiName(value: string): boolean {
  return /[一-龯々]/.test(value);
}

async function resolveKanjiNames(
  sources: Array<{ bout: UpstreamBout; status: LiveBoutStatus }>,
): Promise<Map<number, string>> {
  const rikishiById = new Map<number, UpstreamRikishi>();
  for (const { bout } of sources) {
    for (const rikishi of [bout.east, bout.west]) {
      const id = Number(rikishi?.rikishi_id ?? 0);
      if (id) rikishiById.set(id, rikishi ?? {});
    }
  }

  const result = new Map<number, string>();
  const idsMissingFromMemory = [...rikishiById.keys()].filter((id) => !profileNameCache.has(id));
  const stored = await readOfficialNames(idsMissingFromMemory);
  const toFetch: UpstreamRikishi[] = [];
  const toPersist: Array<{ nskId: number; shikonaJp: string }> = [];

  for (const [id, rikishi] of rikishiById) {
    const upstreamName = cleanShikona(rikishi);
    const memoryName = profileNameCache.get(id);
    const storedName = stored.get(id);

    if (isKanjiName(upstreamName)) {
      result.set(id, upstreamName);
      profileNameCache.set(id, upstreamName);
      if (storedName !== upstreamName && memoryName !== upstreamName) {
        toPersist.push({ nskId: id, shikonaJp: upstreamName });
      }
    } else if (memoryName) {
      result.set(id, memoryName);
    } else if (storedName) {
      result.set(id, storedName);
      profileNameCache.set(id, storedName);
    } else {
      toFetch.push(rikishi);
    }
  }

  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, toFetch.length) }, async () => {
      while (cursor < toFetch.length) {
        const index = cursor;
        cursor += 1;
        const rikishi = toFetch[index];
        const id = Number(rikishi.rikishi_id ?? 0);
        const shikonaJp = await getKanjiShikona(rikishi);
        if (id && isKanjiName(shikonaJp)) {
          result.set(id, shikonaJp);
          toPersist.push({ nskId: id, shikonaJp });
        }
      }
    }),
  );

  await saveOfficialNames(toPersist);
  return result;
}

async function mapBoutSourcesWithKanjiNames(
  sources: Array<{ bout: UpstreamBout; status: LiveBoutStatus }>,
): Promise<LiveBout[]> {
  const resolvedNames = await resolveKanjiNames(sources);
  return sources.map(({ bout, status }) => {
    const mapped = mapBout(bout, status);
    const eastId = Number(bout.east?.rikishi_id ?? 0);
    const westId = Number(bout.west?.rikishi_id ?? 0);
    return {
      ...mapped,
      east: resolvedNames.get(eastId) ?? mapped.east,
      west: resolvedNames.get(westId) ?? mapped.west,
    };
  });
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
  const currentIndex = bouts.findIndex((bout) => Number(bout.judge ?? 0) === 0);
  const next = currentIndex >= 0 ? bouts[currentIndex] : null;
  const recentResultSources: Array<{ bout: UpstreamBout; status: LiveBoutStatus }> =
    currentIndex >= 0
      ? [
          ...bouts
            .slice(Math.max(0, currentIndex - 2), currentIndex)
            .map((bout) => ({ bout, status: "past" as const })),
          { bout: bouts[currentIndex], status: "current" as const },
          ...bouts
            .slice(currentIndex + 1, currentIndex + 3)
            .map((bout) => ({ bout, status: "next" as const })),
        ]
      : bouts.slice(-2).map((bout) => ({ bout, status: "past" as const }));
  const allBoutSources = bouts.map((bout, index) => ({
    bout,
    status: Number(bout.judge ?? 0) > 0
      ? "past" as const
      : index === currentIndex
        ? "current" as const
        : "next" as const,
  }));
  return {
    id,
    name: payload.kakuName || name,
    bashoId: payload.basho_id,
    dayHead: payload.dayHead,
    completed,
    total: bouts.length,
    nextBout: null,
    recentResults: [],
    nextBoutSource: next,
    recentResultSources,
    allBoutSources,
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

async function loadSourceSnapshot(): Promise<LiveSourceSnapshot> {
  const now = Date.now();
  if (sourceCache && sourceCache.expiresAt > now) return sourceCache.value;

  const bashoContext = await fetchBashoContext();
  const day = bashoContext.day;
  const divisions = await Promise.all(
    DIVISIONS.map((division) => fetchDivision(division.id, division.name, day)),
  );
  const liveSource = findCurrentDivision(divisions);
  const dayHead = liveSource?.dayHead ?? divisions.find((division) => division.dayHead)?.dayHead;
  const bashoId = liveSource?.bashoId ?? divisions.find((division) => division.bashoId)?.bashoId;
  const banzuke = bashoId
    ? await fetchCurrentBanzuke(bashoId).catch(() => ({ rows: [], sides: new Map<number, 1 | 2>() }))
    : { rows: [], sides: new Map<number, 1 | 2>() };
  applyBanzukeSides(divisions, banzuke.sides);
  const value = {
    bashoName: bashoContext.name,
    day,
    dayHead,
    bashoId,
    divisions,
    banzuke: banzuke.rows,
    updatedAt: new Date().toISOString(),
  };
  sourceCache = { expiresAt: now + UPSTREAM_TTL_MS, value };
  responseCache.clear();
  return value;
}

async function mapDivision(
  source: LiveDivisionSource | null,
  expanded: boolean,
): Promise<LiveDivision | null> {
  if (!source) return null;
  const recentResults = await mapBoutSourcesWithKanjiNames(
    expanded ? source.allBoutSources : source.recentResultSources,
  );
  return {
    id: source.id,
    name: source.name,
    completed: source.completed,
    total: source.total,
    nextBout: source.nextBoutSource
      ? recentResults.find((bout) => bout.status === "current") ?? null
      : null,
    recentResults,
  };
}

async function loadLiveData(requestedDivisionId: number | null): Promise<LiveResponse> {
  const snapshot = await loadSourceSnapshot();
  const cacheKey = requestedDivisionId ? `division:${requestedDivisionId}` : "current";
  const cached = responseCache.get(cacheKey);
  if (cached) return cached;

  const liveSource = findCurrentDivision(snapshot.divisions);
  const selectedSource = requestedDivisionId
    ? snapshot.divisions.find((division) => division.id === requestedDivisionId) ?? liveSource
    : liveSource;
  const currentDivision = await mapDivision(liveSource, false);
  const resultDivision = requestedDivisionId
    ? await mapDivision(selectedSource, true)
    : currentDivision;
  const value: LiveResponse = {
    live: Boolean(currentDivision?.total),
    basho: `${getEraYear(snapshot.dayHead)} ${snapshot.bashoName}`.trim(),
    day: snapshot.day,
    dayLabel: getDayLabel(snapshot.dayHead, snapshot.day),
    currentDivision,
    resultDivision,
    divisions: snapshot.divisions.map(({ id, name, completed, total }) => ({ id, name, completed, total })),
    banzuke: snapshot.banzuke,
    updatedAt: snapshot.updatedAt,
    sourceUrl: `https://www.sumo.or.jp/ResultData/torikumi/${selectedSource?.id ?? 1}/${snapshot.day}/`,
    displayRefreshSeconds: 10,
    sourceRefreshSeconds: 15,
  };
  responseCache.set(cacheKey, value);
  return value;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("division") ?? 0);
  const requestedDivisionId = DIVISIONS.some((division) => division.id === requested)
    ? requested
    : null;
  const cacheKey = requestedDivisionId ? `division:${requestedDivisionId}` : "current";
  try {
    const value = await loadLiveData(requestedDivisionId);
    return Response.json(value, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=10" },
    });
  } catch {
    const cached = responseCache.get(cacheKey) ?? responseCache.get("current");
    if (cached) {
      return Response.json(
        { ...cached, message: "公式データの再取得を待っています。直前の情報を表示中です。" },
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
