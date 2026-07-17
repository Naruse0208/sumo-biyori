"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RikishiRating = {
  position: number;
  id: number;
  nskId: number | null;
  shikonaJp: string | null;
  shikonaEn: string;
  profileUrl: string | null;
  officialProfileUrl: string | null;
  banzukeRank: string;
  elo: number;
  peakElo: number;
  dohyoScoreTenths: number;
  glickoRating: number;
  glickoRdTenths: number | null;
  glickoVolatilityMillionths: number | null;
  sumoHensachiTenths: number;
  sekitoriHensachiTenths: number | null;
  modelAvailable?: boolean;
  bouts: number;
  wins: number;
  losses: number;
};

type Division = { id: number; name: string; ranking: RikishiRating[] };
type RatingBoardResponse = {
  bashoId: number;
  modelVersion?: string;
  divisions?: { id: number; rows: RikishiRating[] }[];
  error?: string;
};
type RatingMetric = "elo" | "glicko" | "hensachi";

const divisionNames = ["幕内", "十両", "幕下", "三段目", "序二段", "序ノ口"];
const rankLabels: Record<string, string> = {
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
};

function toKanjiNumber(value: number) {
  const digits = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens > 1 ? digits[tens] : ""}十${ones ? digits[ones] : ""}`;
}

function bashoLabel(bashoId: number) {
  const year = Math.floor(bashoId / 100);
  const month = bashoId % 100;
  const isReiwa = year > 2019 || (year === 2019 && month >= 5);
  const era = isReiwa ? "令和" : "平成";
  const eraYear = isReiwa ? year - 2018 : year - 1988;
  return `${era}${eraYear === 1 ? "元" : toKanjiNumber(eraYear)}年 ${toKanjiNumber(month)}月場所`;
}

function displayRank(rank: string) {
  const match = rank.match(/^(\w+)(?: (\d+))? (East|West)$/);
  if (!match) return rank;
  const [, division, number, side] = match;
  return `${side === "East" ? "東" : "西"}・${rankLabels[division] ?? division}${number ? `${number}枚目` : ""}`;
}

const metricMeta: Record<RatingMetric, { label: string; short: string; description: string }> = {
  elo: { label: "Elo", short: "Elo", description: "一番ごとに更新する透明な基準値" },
  glicko: { label: "地力", short: "地力", description: "Glicko-2による現在値と推定の確かさ" },
  hensachi: { label: "相撲偏差値", short: "偏差値", description: "同じ場所・同じ段の中での傑出度" },
};

function confidenceLabel(rdTenths: number | null) {
  if (rdTenths === null) return "推定待ち";
  const rd = rdTenths / 10;
  if (rd <= 65) return "安定";
  if (rd <= 120) return "推定中";
  return "参考値";
}

export default function RatingBoard({
  divisions: initialDivisions,
  initialBasho,
}: {
  divisions: Division[];
  initialBasho: number;
}) {
  const [activeId, setActiveId] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [selectedBasho, setSelectedBasho] = useState(initialBasho);
  const [availableBasho, setAvailableBasho] = useState<number[]>([initialBasho]);
  const [divisions, setDivisions] = useState(initialDivisions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<RatingMetric>("elo");
  const requestId = useRef(0);

  const loadBasho = useCallback(async (bashoId: number) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    setShowAll(false);
    try {
      const response = await fetch(`/api/ratings?basho=${bashoId}&division=0&limit=400`);
      const body = await response.json() as RatingBoardResponse;
      if (!response.ok || !body.divisions) throw new Error(body.error ?? "レートを取得できませんでした");
      const responses = body.divisions.map((division) => ({
        id: division.id,
        name: divisionNames[division.id - 1],
        ranking: division.rows,
      }));
      if (currentRequest !== requestId.current) return;
      setDivisions(responses);
      setSelectedBasho(bashoId);
      const url = new URL(window.location.href);
      url.searchParams.set("basho", String(bashoId));
      window.history.replaceState({}, "", url);
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "レートを取得できませんでした");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ratings?mode=basho")
      .then(async (response) => {
        const body = await response.json() as { bashoIds?: number[]; error?: string };
        if (!response.ok || !body.bashoIds?.length) throw new Error(body.error ?? "場所一覧を取得できませんでした");
        if (cancelled) return;
        setAvailableBasho(body.bashoIds);
        const fromUrl = Number(new URLSearchParams(window.location.search).get("basho"));
        if (body.bashoIds.includes(fromUrl) && fromUrl !== initialBasho) loadBasho(fromUrl);
      })
      .catch(() => {
        if (!cancelled) setAvailableBasho([initialBasho]);
      });
    return () => { cancelled = true; };
  }, [initialBasho, loadBasho]);

  const active = divisions.find((division) => division.id === activeId) ?? divisions[0];
  const sortedRanking = useMemo(() => {
    const value = (rikishi: RikishiRating) => metric === "elo"
      ? rikishi.elo
      : metric === "glicko"
        ? rikishi.glickoRating
        : rikishi.sumoHensachiTenths;
    return [...active.ranking]
      .sort((first, second) => value(second) - value(first) || second.elo - first.elo)
      .map((rikishi, index) => ({ ...rikishi, position: index + 1 }));
  }, [active.ranking, metric]);
  const rows = useMemo(
    () => (showAll ? sortedRanking : sortedRanking.slice(0, 20)),
    [showAll, sortedRanking],
  );
  const selectedIndex = availableBasho.indexOf(selectedBasho);
  const newerBasho = selectedIndex > 0 ? availableBasho[selectedIndex - 1] : null;
  const olderBasho = selectedIndex >= 0 && selectedIndex < availableBasho.length - 1
    ? availableBasho[selectedIndex + 1]
    : null;

  return (
    <div className="rate-ranking-board" aria-busy={loading}>
      <div className="rate-basho-toolbar">
        <div className="rate-basho-current" aria-live="polite">
          <span>SELECT BASHO</span>
          <strong>{bashoLabel(selectedBasho)}</strong>
          <small>{selectedBasho === initialBasho ? "最新・取得済み取組まで" : "場所終了時点のレート"}</small>
        </div>
        <div className="rate-basho-controls">
          <button type="button" disabled={!olderBasho || loading} onClick={() => olderBasho && loadBasho(olderBasho)}>
            ← 古い場所
          </button>
          <label>
            <span className="sr-only">表示する場所を選ぶ</span>
            <select
              value={selectedBasho}
              disabled={loading}
              onChange={(event) => loadBasho(Number(event.target.value))}
            >
              {availableBasho.map((bashoId) => (
                <option key={bashoId} value={bashoId}>{bashoLabel(bashoId)}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!newerBasho || loading} onClick={() => newerBasho && loadBasho(newerBasho)}>
            新しい場所 →
          </button>
        </div>
      </div>

      {error && (
        <div className="rate-basho-message is-error" role="alert">
          <span>選んだ場所を読み込めませんでした。</span>
          <button type="button" onClick={() => loadBasho(selectedBasho)}>再試行</button>
        </div>
      )}
      {loading && <div className="rate-basho-message" role="status">六段のレートを読み込み中…</div>}

      <div className={`rate-ranking-content${loading ? " is-loading" : ""}`}>
        <div className="rate-metric-switch" role="group" aria-label="表示する強さのものさし">
          <div>
            <span>表示するものさし</span>
            <small>{metricMeta[metric].description}</small>
          </div>
          {(["elo", "glicko", "hensachi"] as const).map((value) => (
            <button
              type="button"
              className={metric === value ? "is-active" : ""}
              aria-pressed={metric === value}
              key={value}
              onClick={() => { setMetric(value); setShowAll(false); }}
            >
              {metricMeta[value].label}
              {value === "glicko" && <small>Glicko-2</small>}
            </button>
          ))}
        </div>
        <div className="rate-division-tabs" role="tablist" aria-label="段位を選ぶ">
          {divisions.map((division) => (
            <button
              type="button"
              role="tab"
              aria-selected={division.id === active.id}
              className={division.id === active.id ? "is-active" : ""}
              key={division.id}
              onClick={() => { setActiveId(division.id); setShowAll(false); }}
            >
              {division.name}<small>{division.ranking.length}人</small>
            </button>
          ))}
        </div>

        <div className="rate-ranking-head">
          <span>順位</span><span>力士</span><span>{metricMeta[metric].short}</span><span>補助値</span><span>通算</span>
        </div>
        {rows.map((rikishi) => (
          <div className="rate-ranking-row" key={rikishi.id}>
            <strong>{String(rikishi.position).padStart(2, "0")}</strong>
            <span className="rate-ranking-rikishi">
              {rikishi.profileUrl ? (
                <a href={rikishi.profileUrl}>
                  <b>{rikishi.shikonaJp ?? rikishi.shikonaEn}</b>
                </a>
              ) : <b>{rikishi.shikonaJp ?? rikishi.shikonaEn}</b>}
              <small>{displayRank(rikishi.banzukeRank)}／{rikishi.shikonaEn}</small>
            </span>
            {metric === "elo" && <span><b>{rikishi.elo}</b><small>最高 {rikishi.peakElo}</small></span>}
            {metric === "glicko" && <span><b>{rikishi.glickoRating}</b><small>{confidenceLabel(rikishi.glickoRdTenths)}</small></span>}
            {metric === "hensachi" && <span><b>{(rikishi.sumoHensachiTenths / 10).toFixed(1)}</b><small>同場所・同段</small></span>}
            {metric === "elo" && <span><b>{rikishi.glickoRating}</b><small>地力</small></span>}
            {metric === "glicko" && <span><b>±{rikishi.glickoRdTenths === null ? "—" : Math.round((rikishi.glickoRdTenths / 10) * 2)}</b><small>95%目安</small></span>}
            {metric === "hensachi" && <span><b>{rikishi.glickoRating}</b><small>地力</small></span>}
            <span>{rikishi.wins}勝{rikishi.losses}敗<small>{rikishi.bouts}取組</small></span>
          </div>
        ))}
        {active.ranking.length > 20 && (
          <button className="rate-show-all" type="button" onClick={() => setShowAll((current) => !current)}>
            {showAll ? "上位20人に戻す" : `${active.name}${active.ranking.length}人をすべて表示`}
          </button>
        )}
      </div>
    </div>
  );
}
