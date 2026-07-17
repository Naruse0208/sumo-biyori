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

type LivePayload = {
  live: boolean;
  basho?: string;
  day?: number | null;
  dayLabel?: string;
  currentDivision?: LiveDivision | null;
  divisions?: Array<Pick<LiveDivision, "id" | "name" | "completed" | "total">>;
  updatedAt: string;
  sourceUrl?: string;
  displayRefreshSeconds?: number;
  sourceRefreshSeconds?: number;
  message?: string;
};

type LiveContextValue = {
  data: LivePayload | null;
  loading: boolean;
  seconds: number;
};

const LiveContext = createContext<LiveContextValue | null>(null);

export function LiveSumoProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(10);

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const response = await fetch("/api/live-sumo", { cache: "no-store" });
      const payload = (await response.json()) as LivePayload;
      setData(payload);
    } catch {
      setData((previous) => previous ? { ...previous, message: "再接続を待っています。" } : null);
    } finally {
      setLoading(false);
      setSeconds(10);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => void refresh(), 10_000);
    const countdown = window.setInterval(() => setSeconds((value) => (value <= 1 ? 10 : value - 1)), 1_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(countdown);
      window.clearTimeout(initial);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const value = useMemo(() => ({ data, loading, seconds }), [data, loading, seconds]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

function useLiveSumo() {
  const value = useContext(LiveContext);
  if (!value) throw new Error("Live sumo components must be inside LiveSumoProvider");
  return value;
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
  const bout = division?.nextBout ?? division?.recentResults?.[0] ?? null;
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
              <strong>{bout.east}</strong>
              <small>{bout.eastScore}</small>
            </div>
            <div className="versus" aria-label={isNext ? "対" : bout.technique || "対"}>{isNext ? "対" : "了"}</div>
            <div className={`wrestler wrestler-west ${bout.winner === "west" ? "is-winner" : ""}`}>
              <span>西・{bout.westRank}</span>
              <strong>{bout.west}</strong>
              <small>{bout.westScore}</small>
            </div>
          </div>
          <div className="bout-foot">
            <span>{isNext ? "次の一番" : "直近の取組"}</span>
            <span>{isNext ? `${division?.completed ?? 0}番まで終了` : `決まり手　${bout.technique}`}</span>
            <a href="#live-results">速報を見る →</a>
          </div>
        </>
      ) : (
        <div className="live-empty">{data?.message ?? "取組情報の更新を待っています。"}</div>
      )}
    </article>
  );
}

export function LiveResultsBoard() {
  const { data, loading, seconds } = useLiveSumo();
  const division = data?.currentDivision;
  const progress = division?.total ? Math.round((division.completed / division.total) * 100) : 0;
  const updated = data?.updatedAt
    ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.updatedAt))
    : "--:--:--";

  return (
    <section className="live-section section-shell" id="live-results" aria-live="polite">
      <div className="live-board-header">
        <div>
          <p className="eyebrow"><span className="live-dot" aria-hidden="true" /> LIVE TORIKUMI</p>
          <h2>{loading ? "公式取組情報を確認しています" : division ? `ただいま、${division.name}の取組中。` : "取組情報の更新待ち"}</h2>
        </div>
        <div className="live-timestamp">
          <span>表示確認まで {seconds}秒</span>
          <small>最終取得 {updated}</small>
        </div>
      </div>

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
              const active = item.id === division.id;
              return (
                <div className={`division-pill ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`} key={item.id}>
                  <span>{item.name}</span>
                  <small>{item.total ? `${item.completed}/${item.total}` : "待機"}</small>
                </div>
              );
            })}
          </div>

          <div className="recent-results">
            <div className="section-heading">
              <h3>直近の取組</h3>
              <span>LATEST RESULTS</span>
            </div>
            <div className="result-list">
              {division.recentResults.length ? division.recentResults.map((bout, index) => (
                <div className="result-row" key={`${bout.east}-${bout.west}-${index}`}>
                  <span className={`result-rikishi east ${bout.winner === "east" ? "is-winner" : ""}`}>
                    <small>{bout.eastRank}</small>{bout.east}
                  </span>
                  <span className="result-technique">{bout.technique}</span>
                  <span className={`result-rikishi west ${bout.winner === "west" ? "is-winner" : ""}`}>
                    {bout.west}<small>{bout.westRank}</small>
                  </span>
                </div>
              )) : <p className="live-empty">最初の取組結果を待っています。</p>}
            </div>
          </div>
        </>
      ) : (
        <p className="live-empty">{data?.message ?? "取組データを取得しています。"}</p>
      )}

      <div className="live-source">
        <span>10秒ごとに画面を確認／公式データ取得は最大60秒に1回</span>
        {data?.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer">出典：日本相撲協会公式サイト ↗</a>}
      </div>
    </section>
  );
}
