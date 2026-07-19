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
import Bilingual from "./Bilingual";
import {
  divisionEnglish,
  englishBashoLabel,
  englishDayLabel,
  englishRank,
  englishScore,
  englishTechnique,
} from "../lib/i18n";

type LiveBout = {
  east: string;
  west: string;
  eastEn: string;
  westEn: string;
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
  eastEn: string | null;
  westEn: string | null;
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
    return <small className="result-prediction"><span><Bilingual ja="勝機" en="Forecast" /></span><strong><Bilingual ja={`東${prediction.east.probability}%・西${prediction.west.probability}%`} en={`East ${prediction.east.probability}% · West ${prediction.west.probability}%`} /></strong></small>;
  }
  return (
    <div className="bout-prediction" aria-label={`${prediction.model ?? "相撲日和予想"} 東${prediction.east.probability}% 西${prediction.west.probability}%`}>
      <div><span className="bout-prediction-east"><Bilingual ja={`東 ${prediction.east.probability}%`} en={`East ${prediction.east.probability}%`} /></span><span><Bilingual ja={`西 ${prediction.west.probability}%`} en={`West ${prediction.west.probability}%`} /></span></div>
      <div className="bout-prediction-bar"><span style={{ width: `${prediction.east.probability}%` }} /></div>
      <section className="bout-highlights" aria-label="見どころ（デザイン確認用）">
        <div className="bout-highlights-heading">
          <strong><Bilingual ja="この一番の見どころ" en="What to watch" /></strong>
          <span><Bilingual ja="デザイン確認用" en="Design preview" /></span>
        </div>
        <ul>
          <li>
            <b><Bilingual ja={`${bout.east}の勝ち筋`} en={`${bout.eastEn || bout.east}: path to victory`} /></b>
            <span><Bilingual ja="低い立ち合いから先に自分の形を作り、相手に十分な体勢を与えたくない。" en="Win the first contact, establish the preferred position, and deny the opponent a settled stance." /></span>
          </li>
          <li>
            <b><Bilingual ja={`${bout.west}の勝ち筋`} en={`${bout.westEn || bout.west}: path to victory`} /></b>
            <span><Bilingual ja="受けに回らず、得意の間合いへ運べるか。土俵際まで攻めを切らさないことが鍵。" en="Avoid fighting on the back foot, find the preferred distance, and keep the attack alive to the tawara." /></span>
          </li>
          <li>
            <b><Bilingual ja="勝負の焦点" en="Matchup key" /></b>
            <span><Bilingual ja="立ち合い直後の主導権争い。最初の一歩と組み手が、勝負の流れを大きく左右する。" en="The initiative after the tachiai: the first step and opening grip could shape the entire bout." /></span>
          </li>
        </ul>
      </section>
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
  if (loading) return <strong><Bilingual ja="本場所情報を確認中" en="Checking tournament data" /></strong>;
  const label = [data?.basho, data?.dayLabel].filter(Boolean).join("　");
  const englishLabel = [englishBashoLabel(data?.bashoId, data?.basho), englishDayLabel(data?.day)].filter(Boolean).join(" · ");
  return <strong><Bilingual ja={label || "本場所情報を更新待ち"} en={englishLabel || "Waiting for tournament data"} /></strong>;
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
        <Bilingual
          ja={loading ? "公式取組情報を確認中" : division ? `${data?.basho}・${data?.dayLabel}　${division.name}` : "本場所情報"}
          en={loading ? "Checking official bout data" : division ? `${englishBashoLabel(data?.bashoId, data?.basho)} · ${englishDayLabel(data?.day)} · ${divisionEnglish[division.id] ?? division.name}` : "Tournament data"}
        />
      </div>
      {bout ? (
        <>
          <div className="bout-main">
            <div className={`wrestler wrestler-east ${bout.winner === "east" ? "is-winner" : ""}`}>
              <span><Bilingual ja={`東・${bout.eastRank}`} en={englishRank(`東・${bout.eastRank}`)} /></span>
              <ProfileLink className="wrestler-name-link" href={bout.eastProfileUrl}><strong><Bilingual ja={bout.east} en={bout.eastEn || bout.east} /></strong></ProfileLink>
              <small><Bilingual ja={bout.eastScore} en={englishScore(bout.eastScore)} /></small>
            </div>
            <div className="versus" aria-label={isNext ? "対" : bout.technique || "対"}><Bilingual ja={isNext ? "対" : "終了"} en={isNext ? "VS" : "Final"} /></div>
            <div className={`wrestler wrestler-west ${bout.winner === "west" ? "is-winner" : ""}`}>
              <span><Bilingual ja={`西・${bout.westRank}`} en={englishRank(`西・${bout.westRank}`)} /></span>
              <ProfileLink className="wrestler-name-link" href={bout.westProfileUrl}><strong><Bilingual ja={bout.west} en={bout.westEn || bout.west} /></strong></ProfileLink>
              <small><Bilingual ja={bout.westScore} en={englishScore(bout.westScore)} /></small>
            </div>
          </div>
          {isNext && <WinProbability bout={bout} divisionId={division?.id ?? 1} />}
        </>
      ) : (
        <div className="live-empty"><Bilingual ja={data?.message ?? "取組情報の更新を待っています。"} en="Waiting for bout data." /></div>
      )}
    </article>
  );
}

export function LiveResultsBoard() {
  const { data, expanded, selectedDivisionId, resultLoading, selectDivision, collapseResults } = useLiveSumo();
  const division = data?.resultDivision ?? data?.currentDivision;
  const progress = division?.total ? Math.round((division.completed / division.total) * 100) : 0;
  const displayedBouts = [...(division?.recentResults ?? [])].reverse();

  return (
    <section className="live-section section-shell" id="live-results" aria-live="polite">
      {division ? (
        <>
          <div className="live-progress-row">
            <span><Bilingual ja={`${division.completed}番終了`} en={`${division.completed} complete`} /></span>
            <div className="live-progress" role="progressbar" aria-label={`${division.name}の進行`} aria-valuemin={0} aria-valuemax={division.total} aria-valuenow={division.completed}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <span><Bilingual ja={`全${division.total}番`} en={`${division.total} bouts`} /></span>
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
                  <span><Bilingual ja={item.name} en={divisionEnglish[item.id] ?? item.name} /></span>
                  <small>{item.total ? `${item.completed}/${item.total}` : <Bilingual ja="待機" en="Waiting" />}</small>
                </button>
              );
            })}
          </div>

          <div className={`recent-results ${expanded ? "is-expanded" : ""}`} id="division-results">
            <div className="section-heading">
              <h3><Bilingual ja={expanded ? `${division.name} 取組結果` : "取組結果"} en={expanded ? `${divisionEnglish[division.id] ?? division.name} Results` : "Bout Results"} /></h3>
              {expanded && <button className="results-collapse" type="button" onClick={collapseResults}><Bilingual ja="折りたたむ ↑" en="Collapse ↑" /></button>}
            </div>
            <div className="result-list">
              {resultLoading ? <p className="live-empty"><Bilingual ja="全取組を読み込み中" en="Loading all bouts" /></p> : displayedBouts.length ? displayedBouts.map((bout, index) => {
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
                    <small className="result-rank"><Bilingual ja={formatResultRank(bout.eastRank, division.name, bout.eastBanzukeSide)} en={englishRank(formatResultRank(bout.eastRank, division.name, bout.eastBanzukeSide), division.name)} /></small>
                    <ProfileLink className="result-name" href={bout.eastProfileUrl}><Bilingual ja={bout.east} en={bout.eastEn || bout.east} /></ProfileLink>
                    <span className="result-mark" aria-hidden="true">{bout.winner === "east" ? "○" : ""}</span>
                  </span>
                  <span className="result-technique">
                    <span><Bilingual ja={bout.status === "past" ? bout.technique : bout.status === "current" ? "現在" : "このあと"} en={bout.status === "past" ? englishTechnique(bout.technique) : bout.status === "current" ? "Now" : "Up next"} /></span>
                    {bout.status !== "past" && <WinProbability bout={bout} divisionId={division.id} compact />}
                  </span>
                  <span className={`result-rikishi west ${bout.winner === "west" ? "is-winner" : ""}`}>
                    <span className="result-mark" aria-hidden="true">{bout.winner === "west" ? "○" : ""}</span>
                    <ProfileLink className="result-name" href={bout.westProfileUrl}><Bilingual ja={bout.west} en={bout.westEn || bout.west} /></ProfileLink>
                    <small className="result-rank"><Bilingual ja={formatResultRank(bout.westRank, division.name, bout.westBanzukeSide)} en={englishRank(formatResultRank(bout.westRank, division.name, bout.westBanzukeSide), division.name)} /></small>
                  </span>
                </div>
              );
              }) : <p className="live-empty"><Bilingual ja="取組順の更新を待っています。" en="Waiting for the bout order." /></p>}
            </div>
          </div>
        </>
      ) : (
        <p className="live-empty"><Bilingual ja={data?.message ?? "取組データを取得しています。"} en="Loading bout data." /></p>
      )}

      <div className="live-source">
        {data?.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer"><Bilingual ja="出典：日本相撲協会公式サイト ↗" en="Source: Japan Sumo Association ↗" /></a>}
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
        <h2><Bilingual ja="番付" en="Banzuke" /></h2>
      </div>
      <div className="rank-list">
        {loading ? (
          <p className="banzuke-loading"><Bilingual ja="公式番付を確認中" en="Checking the official banzuke" /></p>
        ) : rows.length ? rows.map((row, index) => (
          <div className="rank-row" key={`${row.rank}-${index}`}>
            <ProfileLink className="rank-rikishi" href={row.eastProfileUrl}><Bilingual ja={row.east ?? "—"} en={row.eastEn ?? row.east ?? "—"} /></ProfileLink>
            <em><Bilingual ja={row.rank} en={englishRank(row.rank)} /></em>
            <ProfileLink className="rank-rikishi" href={row.westProfileUrl}><Bilingual ja={row.west ?? "—"} en={row.westEn ?? row.west ?? "—"} /></ProfileLink>
          </div>
        )) : (
          <p className="banzuke-loading"><Bilingual ja="公式番付の更新を待っています。" en="Waiting for the official banzuke." /></p>
        )}
      </div>
      <a className="text-link" href="https://www.sumo.or.jp/ResultBanzuke/table/" target="_blank" rel="noreferrer">
        <Bilingual ja="日本相撲協会公式番付表 ↗" en="Official JSA banzuke ↗" />
      </a>
    </article>
  );
}
