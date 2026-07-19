"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { englishBashoLabel, type Locale } from "../lib/i18n";

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
  previousBashoId?: number | null;
  eloDelta?: number | null;
  glickoDelta?: number | null;
  hensachiDeltaTenths?: number | null;
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

function bashoLabel(bashoId: number, locale: Locale) {
  if (locale === "en") return englishBashoLabel(bashoId);
  const year = Math.floor(bashoId / 100);
  const month = bashoId % 100;
  const isReiwa = year > 2019 || (year === 2019 && month >= 5);
  const isHeisei = year > 1989 || (year === 1989 && month >= 1);
  const era = isReiwa ? "令和" : isHeisei ? "平成" : "昭和";
  const eraYear = isReiwa ? year - 2018 : isHeisei ? year - 1988 : year - 1925;
  return `${era}${eraYear === 1 ? "元" : toKanjiNumber(eraYear)}年 ${toKanjiNumber(month)}月場所`;
}

function displayRank(rank: string, locale: Locale) {
  const match = rank.match(/^(\w+)(?: (\d+))? (East|West)$/);
  if (!match) return rank;
  const [, division, number, side] = match;
  if (locale === "en") return `${side} ${division}${number ? ` ${number}` : ""}`;
  return `${side === "East" ? "東" : "西"}・${rankLabels[division] ?? division}${number ? `${number}枚目` : ""}`;
}

function confidenceLabel(rdTenths: number | null, locale: Locale) {
  if (rdTenths === null) return locale === "en" ? "Pending" : "推定待ち";
  const rd = rdTenths / 10;
  if (rd <= 65) return locale === "en" ? "Stable" : "安定";
  if (rd <= 120) return locale === "en" ? "Estimating" : "推定中";
  return locale === "en" ? "Provisional" : "参考値";
}

function formatDelta(value: number | null | undefined, divisor = 1, digits = 0) {
  if (value === null || value === undefined) return "(—)";
  const amount = value / divisor;
  if (amount === 0) return `(${digits ? "±0.0" : "±0"})`;
  return `(${amount > 0 ? "+" : ""}${amount.toFixed(digits)})`;
}

export default function RatingBoard({
  divisions: initialDivisions,
  initialBasho,
  locale,
}: {
  divisions: Division[];
  initialBasho: number;
  locale: Locale;
}) {
  const [activeId, setActiveId] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [selectedBasho, setSelectedBasho] = useState(initialBasho);
  const [availableBasho, setAvailableBasho] = useState<number[]>([initialBasho]);
  const [divisions, setDivisions] = useState(initialDivisions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadBasho = useCallback(async (bashoId: number) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    setShowAll(false);
    try {
      const response = await fetch(`/api/ratings?basho=${bashoId}&division=0&limit=400`);
      const body = await response.json() as RatingBoardResponse;
      if (!response.ok || !body.divisions) throw new Error(body.error ?? (locale === "en" ? "Could not load ratings" : "レートを取得できませんでした"));
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
      setError(caught instanceof Error ? caught.message : locale === "en" ? "Could not load ratings" : "レートを取得できませんでした");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ratings?mode=basho")
      .then(async (response) => {
        const body = await response.json() as { bashoIds?: number[]; error?: string };
        if (!response.ok || !body.bashoIds?.length) throw new Error(body.error ?? "場所一覧を取得できませんでした");
        if (cancelled) return;
        setAvailableBasho(body.bashoIds);
        const fromUrl = Number(new URLSearchParams(window.location.search).get("basho"));
        loadBasho(body.bashoIds.includes(fromUrl) ? fromUrl : initialBasho);
      })
      .catch(() => {
        if (!cancelled) setAvailableBasho([initialBasho]);
      });
    return () => { cancelled = true; };
  }, [initialBasho, loadBasho]);

  const active = divisions.find((division) => division.id === activeId) ?? divisions[0];
  const sortedRanking = useMemo(() => {
    return [...active.ranking]
      .sort((first, second) => second.glickoRating - first.glickoRating || second.elo - first.elo)
      .map((rikishi, index) => ({ ...rikishi, position: index + 1 }));
  }, [active.ranking]);
  const rows = useMemo(
    () => (showAll ? sortedRanking : sortedRanking.slice(0, 10)),
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
          <span>{locale === "en" ? "SELECT TOURNAMENT" : "SELECT BASHO"}</span>
          <strong>{bashoLabel(selectedBasho, locale)}</strong>
          <small>{selectedBasho === initialBasho ? (locale === "en" ? "Latest · through recorded bouts" : "最新・取得済み取組まで") : (locale === "en" ? "Ratings at tournament end" : "場所終了時点のレート")}</small>
        </div>
        <div className="rate-basho-controls">
          <button type="button" disabled={!olderBasho || loading} onClick={() => olderBasho && loadBasho(olderBasho)}>
            {locale === "en" ? "← Older" : "← 古い場所"}
          </button>
          <label>
            <span className="sr-only">{locale === "en" ? "Select a tournament" : "表示する場所を選ぶ"}</span>
            <select
              value={selectedBasho}
              disabled={loading}
              onChange={(event) => loadBasho(Number(event.target.value))}
            >
              {availableBasho.map((bashoId) => (
                <option key={bashoId} value={bashoId}>{bashoLabel(bashoId, locale)}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!newerBasho || loading} onClick={() => newerBasho && loadBasho(newerBasho)}>
            {locale === "en" ? "Newer →" : "新しい場所 →"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rate-basho-message is-error" role="alert">
          <span>{locale === "en" ? "The selected tournament could not be loaded." : "選んだ場所を読み込めませんでした。"}</span>
          <button type="button" onClick={() => loadBasho(selectedBasho)}>{locale === "en" ? "Retry" : "再試行"}</button>
        </div>
      )}
      {loading && <div className="rate-basho-message" role="status">{locale === "en" ? "Loading ratings for all six divisions…" : "六段のレートを読み込み中…"}</div>}

      <div className={`rate-ranking-content${loading ? " is-loading" : ""}`}>
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
              {locale === "en" ? divisionNames[division.id - 1] === division.name ? ["Makuuchi", "Juryo", "Makushita", "Sandanme", "Jonidan", "Jonokuchi"][division.id - 1] : division.name : division.name}
            </button>
          ))}
        </div>

        <div className="rate-ranking-head">
          <span>{locale === "en" ? "Rank" : "順位"}</span><span>{locale === "en" ? "Wrestler" : "力士"}</span><span>Elo</span><span>Glicko-2</span><span>{locale === "en" ? "Sumo Score" : "相撲偏差値"}</span><span>{locale === "en" ? "95% range" : "推定幅（95%）"}</span><span>{locale === "en" ? "Career" : "通算"}</span>
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
              <small>{displayRank(rikishi.banzukeRank, locale)}／{rikishi.shikonaEn}</small>
            </span>
            <span data-label="Elo"><b>{rikishi.elo}{formatDelta(rikishi.eloDelta)}</b><small>{locale === "en" ? `Peak ${rikishi.peakElo}` : `最高 ${rikishi.peakElo}`}</small></span>
            <span data-label="Glicko-2"><b>{rikishi.glickoRating}{formatDelta(rikishi.glickoDelta)}</b><small>{confidenceLabel(rikishi.glickoRdTenths, locale)}</small></span>
            <span data-label={locale === "en" ? "Sumo Score" : "相撲偏差値"}><b>{(rikishi.sumoHensachiTenths / 10).toFixed(1)}{formatDelta(rikishi.hensachiDeltaTenths, 10, 1)}</b><small>{locale === "en" ? "Same tournament · division" : "同場所・同段"}</small></span>
            <span data-label={locale === "en" ? "95% range" : "推定幅（95%）"}><b>±{rikishi.glickoRdTenths === null ? "—" : Math.round((rikishi.glickoRdTenths / 10) * 2)}</b><small>95%</small></span>
            <span data-label={locale === "en" ? "Career" : "通算"}>{locale === "en" ? `${rikishi.wins}–${rikishi.losses}` : `${rikishi.wins}勝${rikishi.losses}敗`}<small>{locale === "en" ? `${rikishi.bouts} bouts` : `${rikishi.bouts}取組`}</small></span>
          </div>
        ))}
        {active.ranking.length > 10 && (
          <button className="rate-show-all" type="button" onClick={() => setShowAll((current) => !current)}>
            {showAll ? (locale === "en" ? "Show top 10" : "上位10人に戻す") : (locale === "en" ? `Show all ${active.ranking.length}` : `${active.name}${active.ranking.length}人をすべて表示`)}
          </button>
        )}
      </div>
    </div>
  );
}
