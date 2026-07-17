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
  seconds: number;
  expanded: boolean;
  selectedDivisionId: number | null;
  resultLoading: boolean;
  selectDivision: (divisionId: number) => void;
  collapseResults: () => void;
};

const LiveContext = createContext<LiveContextValue | null>(null);

export function LiveSumoProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(10);
  const [expanded, setExpanded] = useState(false);
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null);
  const [resultLoading, setResultLoading] = useState(false);

  const refresh = useCallback(async (divisionId: number | null = selectedDivisionId) => {
    if (document.visibilityState === "hidden") return;
    try {
      const query = divisionId ? `?division=${divisionId}` : "";
      const response = await fetch(`/api/live-sumo${query}`, { cache: "no-store" });
      const payload = (await response.json()) as LivePayload;
      setData(payload);
    } catch {
      setData((previous) => previous ? { ...previous, message: "再接続を待っています。" } : null);
    } finally {
      setLoading(false);
      setResultLoading(false);
      setSeconds(10);
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

  const value = useMemo(
    () => ({ data, loading, seconds, expanded, selectedDivisionId, resultLoading, selectDivision, collapseResults }),
    [data, loading, seconds, expanded, selectedDivisionId, resultLoading, selectDivision, collapseResults],
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
    <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a>
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
            <div className="versus" aria-label={isNext ? "対" : bout.technique || "対"}>{isNext ? "対" : "了"}</div>
            <div className={`wrestler wrestler-west ${bout.winner === "west" ? "is-winner" : ""}`}>
              <span>西・{bout.westRank}</span>
              <ProfileLink className="wrestler-name-link" href={bout.westProfileUrl}><strong>{bout.west}</strong></ProfileLink>
              <small>{bout.westScore}</small>
            </div>
          </div>
        </>
      ) : (
        <div className="live-empty">{data?.message ?? "取組情報の更新を待っています。"}</div>
      )}
    </article>
  );
}

export function LiveResultsBoard() {
  const { data, seconds, expanded, selectedDivisionId, resultLoading, selectDivision, collapseResults } = useLiveSumo();
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
              {resultLoading ? <p className="live-empty">全取組を読み込み中</p> : displayedBouts.length ? displayedBouts.map((bout, index) => (
                <div className={`result-row is-${bout.status}`} key={`${bout.east}-${bout.west}-${index}`}>
                  <span className={`result-rikishi east ${bout.winner === "east" ? "is-winner" : ""}`}>
                    <small className="result-rank">{formatResultRank(bout.eastRank, division.name, bout.eastBanzukeSide)}</small>
                    <ProfileLink className="result-name" href={bout.eastProfileUrl}>{bout.east}</ProfileLink>
                    <span className="result-mark" aria-hidden="true">{bout.winner === "east" ? "○" : ""}</span>
                  </span>
                  <span className="result-technique">
                    {bout.status === "past" ? bout.technique : bout.status === "current" ? "現在" : "このあと"}
                  </span>
                  <span className={`result-rikishi west ${bout.winner === "west" ? "is-winner" : ""}`}>
                    <span className="result-mark" aria-hidden="true">{bout.winner === "west" ? "○" : ""}</span>
                    <ProfileLink className="result-name" href={bout.westProfileUrl}>{bout.west}</ProfileLink>
                    <small className="result-rank">{formatResultRank(bout.westRank, division.name, bout.westBanzukeSide)}</small>
                  </span>
                </div>
              )) : <p className="live-empty">取組順の更新を待っています。</p>}
            </div>
          </div>
        </>
      ) : (
        <p className="live-empty">{data?.message ?? "取組データを取得しています。"}</p>
      )}

      <div className="live-source">
        <span className="live-timestamp live-timestamp-inline">
          <span>表示確認まで {seconds}秒</span>
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
        <h2>幕内番付</h2>
        <span>BANZUKE</span>
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
