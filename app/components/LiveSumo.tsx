"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type LiveBout = {
  east: string;
  west: string;
  eastNskId: number | null;
  westNskId: number | null;
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
  status: "past" | "current" | "next";
};

type LiveBanzukeRow = {
  rank: string;
  east: string | null;
  west: string | null;
  eastProfileUrl: string | null;
  westProfileUrl: string | null;
};

type LiveDivision = {
  id: number;
  name: string;
  completed: number;
  total: number;
  nextBout: LiveBout | null;
  recentResults: LiveBout[];
};

type LivePayload = {
  live: boolean;
  basho?: string;
  bashoId?: number;
  day?: number | null;
  dayLabel?: string;
  currentDivision?: LiveDivision | null;
  resultDivision?: LiveDivision | null;
  divisions?: Array<Pick<LiveDivision, "id" | "name" | "completed" | "total">>;
  banzuke?: LiveBanzukeRow[];
  updatedAt: string;
  sourceUrl?: string;
  displayRefreshSeconds?: number;
  sourceRefreshSeconds?: number;
  message?: string;
};

type LiveContextValue = {
  data: LivePayload | null;
  loading: boolean;
  expanded: boolean;
  selectedDivisionId: number | null;
  resultLoading: boolean;
  selectDivision: (divisionId: number) => void;
  collapseResults: () => void;
};

const LiveContext = createContext<LiveContextValue | null>(null);

type PredictionPayload = {
  available: boolean;
  model?: string;
  confidence?: "high" | "medium" | "low";
  models?: {
    elo?: { eastProbability: number; westProbability: number };
    glicko2?: { eastProbability: number; westProbability: number };
    dohyoV2?: { eastProbability: number; westProbability: number };
    dohyoV3?: { eastProbability: number; westProbability: number };
  };
  east?: { elo: number; glickoRating?: number; probability: number };
  west?: { elo: number; glickoRating?: number; probability: number };
};

type BanzukeSide = "east" | "west";
type RatingSideRow = { nskId?: number | null; banzukeRank?: string | null };

const banzukeSideCache = new Map<string, Promise<Map<number, BanzukeSide>>>();

function loadStoredBanzukeSides(bashoId: number, divisionId: number) {
  const key = `${bashoId}-${divisionId}`;
  let pending = banzukeSideCache.get(key);
  if (!pending) {
    const query = new URLSearchParams({
      basho: String(bashoId),
      division: String(divisionId),
      limit: "400",
    });
    pending = fetch(`/api/ratings?${query}`)
      .then(async (response) => {
        if (!response.ok) return new Map<number, BanzukeSide>();
        const payload = await response.json() as { rows?: RatingSideRow[] };
        const sides = new Map<number, BanzukeSide>();
        for (const row of payload.rows ?? []) {
          const nskId = Number(row.nskId ?? 0);
          const side = /\bEast$/i.test(row.banzukeRank ?? "")
            ? "east"
            : /\bWest$/i.test(row.banzukeRank ?? "")
              ? "west"
              : null;
          if (nskId && side) sides.set(nskId, side);
        }
        return sides;
      })
      .catch(() => new Map<number, BanzukeSide>());
    banzukeSideCache.set(key, pending);
  }
  return pending;
}

function applyStoredBanzukeSides(division: LiveDivision | null | undefined, sides: Map<number, BanzukeSide>) {
  if (!division) return division;
  const withSides = (bout: LiveBout): LiveBout => ({
    ...bout,
    eastBanzukeSide: bout.eastBanzukeSide ?? sides.get(Number(bout.eastNskId ?? 0)) ?? null,
    westBanzukeSide: bout.westBanzukeSide ?? sides.get(Number(bout.westNskId ?? 0)) ?? null,
  });
  const recentResults = division.recentResults.map(withSides);
  return {
    ...division,
    recentResults,
    nextBout: division.nextBout ? withSides(division.nextBout) : null,
  };
}

async function enrichPayloadBanzukeSides(payload: LivePayload): Promise<LivePayload> {
  const division = payload.resultDivision ?? payload.currentDivision;
  if (!payload.bashoId || !division) return payload;
  const sides = await loadStoredBanzukeSides(payload.bashoId, division.id);
  return {
    ...payload,
    resultDivision: payload.resultDivision?.id === division.id
      ? applyStoredBanzukeSides(payload.resultDivision, sides)
      : payload.resultDivision,
    currentDivision: payload.currentDivision?.id === division.id
      ? applyStoredBanzukeSides(payload.currentDivision, sides)
      : payload.currentDivision,
  };
}

const predictionCache = new Map<string, { expiresAt: number; promise: Promise<PredictionPayload> }>();

function usePrediction(
  eastNskId: number | null,
  westNskId: number | null,
  context: { bashoId?: number; day?: number | null; divisionId: number },
) {
  const [prediction, setPrediction] = useState<PredictionPayload | null>(null);
  useEffect(() => {
    if (!eastNskId || !westNskId) return;
    const key = `${context.bashoId ?? 0}-${context.day ?? 0}-${context.divisionId}-${eastNskId}-${westNskId}`;
    const now = Date.now();
    let cached = predictionCache.get(key);
    if (!cached || cached.expiresAt < now) {
      const query = new URLSearchParams({
        east: String(eastNskId),
        west: String(westNskId),
        basho: String(context.bashoId ?? 0),
        day: String(context.day ?? 0),
        division: String(context.divisionId),
      });
      const promise = fetch(`/api/prediction?${query}`)
        .then(async (response) => response.ok ? response.json() as Promise<PredictionPayload> : { available: false })
        .catch(() => ({ available: false }));
      cached = { expiresAt: now + 60_000, promise };
      predictionCache.set(key, cached);
    }
    let cancelled = false;
    cached.promise.then((value) => { if (!cancelled) setPrediction(value); });
    return () => { cancelled = true; };
  }, [context.bashoId, context.day, context.divisionId, eastNskId, westNskId]);
  return prediction?.available ? prediction : null;
}

function WinProbability({ bout, divisionId, compact = false }: { bout: LiveBout; divisionId: number; compact?: boolean }) {
  const { data } = useLiveSumo();
  const prediction = usePrediction(bout.eastNskId, bout.westNskId, {
    bashoId: data?.bashoId,
    day: data?.day,
    divisionId,
  });
  if (!prediction?.east || !prediction.west) return null;
  if (compact) {
    return <small className="result-prediction"><span>勝機</span><strong>東{prediction.east.probability}%・西{prediction.west.probability}%</strong></small>;
  }
  const confidence = prediction.confidence === "high" ? "信頼度 高" : prediction.confidence === "medium" ? "信頼度 中" : "参考値";
  return (
    <div className="bout-prediction" aria-label={`${prediction.model ?? "土俵日和予想"} 東${prediction.east.probability}% 西${prediction.west.probability}%`}>
      <div><span className="bout-prediction-east">東 {prediction.east.probability}%</span><em>{prediction.model ?? "土俵日和予想"}</em><span>西 {prediction.west.probability}%</span></div>
      <div className="bout-prediction-bar"><span style={{ width: `${prediction.east.probability}%` }} /></div>
      <small>
        Glicko-2 {prediction.east.glickoRating ?? prediction.east.elo} 対 {prediction.west.glickoRating ?? prediction.west.elo}
        {prediction.models?.elo ? ` ／ Elo予想 ${prediction.models.elo.eastProbability}–${prediction.models.elo.westProbability}%` : ""}
        {prediction.models?.dohyoV3 ? ` ／ v3実験 東${prediction.models.dohyoV3.eastProbability}%` : ""}
        {` ／ ${confidence}`}
      </small>
    </div>
  );
}

export function LiveSumoProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null);
  const [resultLoading, setResultLoading] = useState(false);

  const refresh = useCallback(async (divisionId: number | null = selectedDivisionId) => {
    if (document.visibilityState === "hidden") return;
    try {
      const query = divisionId ? `?division=${divisionId}` : "";
      const response = await fetch(`/api/live-sumo${query}`, { cache: "no-store" });
      const payload = (await response.json()) as LivePayload;
      setData(await enrichPayloadBanzukeSides(payload));
    } catch {
      setData((previous) => previous ? { ...previous, message: "再接続を待っています。" } : null);
    } finally {
      setLoading(false);
      setResultLoading(false);
    }
  }, [selectedDivisionId]);

  const selectDivision = useCallback((divisionId: number) => {
    setExpanded(true);
    setSelectedDivisionId(divisionId);
    setResultLoading(true);
    void refresh(divisionId);
  }, [refresh]);

  const collapseResults = useCallback(() => {
    setExpanded(false);
    setSelectedDivisionId(null);
    setResultLoading(false);
    void refresh(null);
  }, [refresh]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => void refresh(), 10_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(initial);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ data, loading, expanded, selectedDivisionId, resultLoading, selectDivision, collapseResults }),
    [data, loading, expanded, selectedDivisionId, resultLoading, selectDivision, collapseResults],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

function useLiveSumo() {
  const value = useContext(LiveContext);
  if (!value) throw new Error("Live sumo components must be inside LiveSumoProvider");
  return value;
}

function ProfileLink({
  href,
  className,
  children,
}: {
  href: string | null;
  className?: string;
  children: ReactNode;
}) {
  return href ? (
    <a className={className} href={href}>{children}</a>
  ) : (
    <span className={className}>{children}</span>
  );
}

function formatResultRank(
  rank: string,
  divisionName: string,
  banzukeSide: "east" | "west" | null,
): string {
  const sideLabel = banzukeSide === "east" ? "東" : banzukeSide === "west" ? "西" : "";
  const withoutSide = rank.replace(/^(東|西)[・\s]?/, "");
  const withoutDivision = withoutSide.startsWith(divisionName)
    ? withoutSide.slice(divisionName.length)
    : withoutSide;
  return `${sideLabel}${withoutDivision || "—"}`;
}

function comparisonHref(bout: LiveBout): string | null {
  return bout.eastNskId && bout.westNskId
    ? `/rate/compare?leftNsk=${bout.eastNskId}&rightNsk=${bout.westNskId}`
    : null;
}

export function LiveHeaderStatus() {
  const { data, loading } = useLiveSumo();
  if (loading) return <strong>本場所情報を確認中</strong>;
  const label = [data?.basho, data?.dayLabel].filter(Boolean).join("　");
  return <strong>{label || "本場所情報を更新待ち"}</strong>;
}

export function LiveHeroBout() {
  const { data, loading } = useLiveSumo();
  const division = data?.currentDivision;
  const recentResults = division?.recentResults ?? [];
  const bout = division?.nextBout ?? recentResults[recentResults.length - 1] ?? null;
  const isNext = Boolean(division?.nextBout);

  return (
    <article className="bout-card" id="torikumi" aria-live="polite">
      <div className="bout-ribbon">
        {loading ? "公式取組情報を確認中" : division ? `${data?.basho}・${data?.dayLabel}　${division.name}` : "本場所情報"}
      </div>
      {bout ? (
        <>
          <div className="bout-main">
            <div className={`wrestler wrestler-east ${bout.winner === "east" ? "is-winner" : ""}`}>
              <span>東・{bout.eastRank}</span>
              <ProfileLink className="wrestler-name-link" href={bout.eastProfileUrl}><strong>{bout.east}</strong></ProfileLink>
              <small>{bout.eastScore}</small>
            </div>
            <div className="versus" aria-label={isNext ? "対" : bout.technique || "対"}>{isNext ? "対" : "終了"}</div>
            <div className={`wrestler wrestler-west ${bout.winner === "west" ? "is-winner" : ""}`}>
              <span>西・{bout.westRank}</span>
              <ProfileLink className="wrestler-name-link" href={bout.westProfileUrl}><strong>{bout.west}</strong></ProfileLink>
              <small>{bout.westScore}</small>
            </div>
          </div>
          {isNext && <WinProbability bout={bout} divisionId={division?.id ?? 1} />}
        </>
      ) : (
        <div className="live-empty">{data?.message ?? "取組情報の更新を待っています。"}</div>
      )}
    </article>
  );
}

export function LiveResultsBoard() {
  const { data, expanded, selectedDivisionId, resultLoading, selectDivision, collapseResults } = useLiveSumo();
  const division = data?.resultDivision ?? data?.currentDivision;
  const progress = division?.total ? Math.round((division.completed / division.total) * 100) : 0;
  const updated = data?.updatedAt
    ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.updatedAt))
    : "--:--:--";
  const displayedBouts = [...(division?.recentResults ?? [])].reverse();

  return (
    <section className="live-section section-shell" id="live-results" aria-live="polite">
      {division ? (
        <>
          <div className="live-progress-row">
            <span>{division.completed}番終了</span>
            <div className="live-progress" role="progressbar" aria-label={`${division.name}の進行`} aria-valuemin={0} aria-valuemax={division.total} aria-valuenow={division.completed}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <span>全{division.total}番</span>
          </div>

          <div className="division-track" aria-label="各段の進行状況">
            {data?.divisions?.map((item) => {
              const complete = item.total > 0 && item.completed >= item.total;
              const active = item.id === (expanded ? selectedDivisionId : division.id);
              return (
                <button
                  className={`division-pill ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}
                  key={item.id}
                  type="button"
                  onClick={() => selectDivision(item.id)}
                  aria-expanded={expanded && selectedDivisionId === item.id}
                  aria-controls="division-results"
                  title={`${item.name}の全取組を表示`}
                >
                  <span>{item.name}</span>
                  <small>{item.total ? `${item.completed}/${item.total}` : "待機"}</small>
                </button>
              );
            })}
          </div>

          <div className={`recent-results ${expanded ? "is-expanded" : ""}`} id="division-results">
            <div className="section-heading">
              <h3>{expanded ? `${division.name} 取組結果` : "取組結果"}</h3>
              {expanded && <button className="results-collapse" type="button" onClick={collapseResults}>折りたたむ ↑</button>}
            </div>
            <div className="result-list">
              {resultLoading ? <p className="live-empty">全取組を読み込み中</p> : displayedBouts.length ? displayedBouts.map((bout, index) => {
                const compareUrl = comparisonHref(bout);
                const openComparison = () => { if (compareUrl) window.location.href = compareUrl; };
                return (
                <div
                  className={`result-row is-${bout.status} ${compareUrl ? "is-clickable" : ""}`}
                  key={`${bout.east}-${bout.west}-${index}`}
                  role={compareUrl ? "link" : undefined}
                  tabIndex={compareUrl ? 0 : undefined}
                  aria-label={compareUrl ? `${bout.east}と${bout.west}を対戦比較` : undefined}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a, button")) return;
                    openComparison();
                  }}
                  onKeyDown={(event) => {
                    if ((event.target as HTMLElement).closest("a, button")) return;
                    if (!compareUrl || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    openComparison();
                  }}
                >
                  <span className={`result-rikishi east ${bout.winner === "east" ? "is-winner" : ""}`}>
                    <small className="result-rank">{formatResultRank(bout.eastRank, division.name, bout.eastBanzukeSide)}</small>
                    <ProfileLink className="result-name" href={bout.eastProfileUrl}>{bout.east}</ProfileLink>
                    <span className="result-mark" aria-hidden="true">{bout.winner === "east" ? "○" : ""}</span>
                  </span>
                  <span className="result-technique">
                    <span>{bout.status === "past" ? bout.technique : bout.status === "current" ? "現在" : "このあと"}</span>
                    {bout.status !== "past" && <WinProbability bout={bout} divisionId={division.id} compact />}
                  </span>
                  <span className={`result-rikishi west ${bout.winner === "west" ? "is-winner" : ""}`}>
                    <span className="result-mark" aria-hidden="true">{bout.winner === "west" ? "○" : ""}</span>
                    <ProfileLink className="result-name" href={bout.westProfileUrl}>{bout.west}</ProfileLink>
                    <small className="result-rank">{formatResultRank(bout.westRank, division.name, bout.westBanzukeSide)}</small>
                  </span>
                </div>
              );
              }) : <p className="live-empty">取組順の更新を待っています。</p>}
            </div>
          </div>
        </>
      ) : (
        <p className="live-empty">{data?.message ?? "取組データを取得しています。"}</p>
      )}

      <div className="live-source">
        <span className="live-timestamp live-timestamp-inline">
          <span>{data?.displayRefreshSeconds ?? 10}秒ごとに表示を更新</span>
          <small>最終取得 {updated}</small>
        </span>
        {data?.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer">出典：日本相撲協会公式サイト ↗</a>}
      </div>
    </section>
  );
}

export function LiveBanzukeCard() {
  const { data, loading } = useLiveSumo();
  const rows = data?.banzuke ?? [];

  return (
    <article className="feature-card banzuke-card" id="banzuke">
      <div className="section-heading">
        <h2>番付</h2>
      </div>
      <div className="rank-list">
        {loading ? (
          <p className="banzuke-loading">公式番付を確認中</p>
        ) : rows.length ? rows.map((row, index) => (
          <div className="rank-row" key={`${row.rank}-${index}`}>
            <ProfileLink className="rank-rikishi" href={row.eastProfileUrl}>{row.east ?? "—"}</ProfileLink>
            <em>{row.rank}</em>
            <ProfileLink className="rank-rikishi" href={row.westProfileUrl}>{row.west ?? "—"}</ProfileLink>
          </div>
        )) : (
          <p className="banzuke-loading">公式番付の更新を待っています。</p>
        )}
      </div>
      <a className="text-link" href="https://www.sumo.or.jp/ResultBanzuke/table/" target="_blank" rel="noreferrer">
        日本相撲協会公式番付表 ↗
      </a>
    </article>
  );
}
