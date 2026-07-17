"use client";

import { useMemo, useState } from "react";

type RikishiRating = {
  position: number;
  id: number;
  nskId: number | null;
  shikonaJp: string | null;
  shikonaEn: string;
  profileUrl: string | null;
  banzukeRank: string;
  elo: number;
  peakElo: number;
  dohyoScoreTenths: number;
  bouts: number;
  wins: number;
  losses: number;
};

type Division = { id: number; name: string; ranking: RikishiRating[] };

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

function displayRank(rank: string) {
  const match = rank.match(/^(\w+)(?: (\d+))? (East|West)$/);
  if (!match) return rank;
  const [, division, number, side] = match;
  return `${side === "East" ? "東" : "西"}・${rankLabels[division] ?? division}${number ? `${number}枚目` : ""}`;
}

export default function RatingBoard({ divisions }: { divisions: Division[] }) {
  const [activeId, setActiveId] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const active = divisions.find((division) => division.id === activeId) ?? divisions[0];
  const rows = useMemo(
    () => (showAll ? active.ranking : active.ranking.slice(0, 20)),
    [active, showAll],
  );

  return (
    <div className="rate-ranking-board">
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
        <span>順位</span><span>力士</span><span>Elo</span><span>土俵偏差値</span><span>通算</span>
      </div>
      {rows.map((rikishi) => (
        <div className="rate-ranking-row" key={rikishi.id}>
          <strong>{String(rikishi.position).padStart(2, "0")}</strong>
          <span className="rate-ranking-rikishi">
            {rikishi.profileUrl ? (
              <a href={rikishi.profileUrl} target="_blank" rel="noreferrer">
                <b>{rikishi.shikonaJp ?? rikishi.shikonaEn}</b>
              </a>
            ) : <b>{rikishi.shikonaJp ?? rikishi.shikonaEn}</b>}
            <small>{displayRank(rikishi.banzukeRank)}／{rikishi.shikonaEn}</small>
          </span>
          <span><b>{rikishi.elo}</b><small>最高 {rikishi.peakElo}</small></span>
          <span>{(rikishi.dohyoScoreTenths / 10).toFixed(1)}</span>
          <span>{rikishi.wins}勝{rikishi.losses}敗<small>{rikishi.bouts}取組</small></span>
        </div>
      ))}
      {active.ranking.length > 20 && (
        <button className="rate-show-all" type="button" onClick={() => setShowAll((current) => !current)}>
          {showAll ? "上位20人に戻す" : `${active.name}${active.ranking.length}人をすべて表示`}
        </button>
      )}
    </div>
  );
}
