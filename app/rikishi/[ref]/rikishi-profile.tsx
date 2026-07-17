"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type RatingPoint = {
  bashoId: number;
  division: number;
  elo: number;
  peakElo: number;
  dohyoScoreTenths: number;
  glickoRating: number;
  glickoRdTenths: number | null;
  glickoVolatilityMillionths: number | null;
  sumoHensachiTenths: number;
  sekitoriHensachiTenths: number | null;
  modelAvailable: boolean;
  bouts: number;
  wins: number;
  losses: number;
  rank: string;
};

type RikishiPayload = {
  wrestler: {
    id: number;
    nskId: number | null;
    sumodbId: number | null;
    displayName: string;
    shikonaEn: string;
    heya: string | null;
    birthDate: string | null;
    shusshin: string | null;
    heightCm: number | null;
    weightKg: number | null;
    debutBashoId: number | null;
    intaiDate: string | null;
    officialProfileUrl: string | null;
  };
  latest: RatingPoint | null;
  history: RatingPoint[];
  error?: string;
};

const divisionNames = ["幕内", "十両", "幕下", "三段目", "序二段", "序ノ口"];
type ProfileMetric = "elo" | "glicko" | "hensachi";
const profileMetricLabels: Record<ProfileMetric, string> = {
  elo: "Elo",
  glicko: "地力",
  hensachi: "相撲偏差値",
};

function bashoShortLabel(bashoId: number) {
  return `${Math.floor(bashoId / 100)}.${String(bashoId % 100).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function RatingChart({ points, metric }: { points: RatingPoint[]; metric: ProfileMetric }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 24, right: 18, bottom: 32, left: 52 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const valueForPoint = (point: RatingPoint) => metric === "elo"
      ? point.elo
      : metric === "glicko"
        ? point.glickoRating
        : point.sumoHensachiTenths / 10;
    const values = points.map(valueForPoint);
    const uncertaintyValues = metric === "glicko"
      ? points.flatMap((point) => {
        const rd = (point.glickoRdTenths ?? 0) / 10;
        return [point.glickoRating - 2 * rd, point.glickoRating + 2 * rd];
      })
      : values;
    const paddingValue = metric === "hensachi" ? 4 : 30;
    const step = metric === "hensachi" ? 10 : 50;
    const minimum = Math.floor((Math.min(...uncertaintyValues) - paddingValue) / step) * step;
    const maximum = Math.ceil((Math.max(...uncertaintyValues) + paddingValue) / step) * step;
    const range = Math.max(metric === "hensachi" ? 20 : 100, maximum - minimum);
    const x = (index: number) => padding.left + (index / Math.max(1, points.length - 1)) * chartWidth;
    const y = (value: number) => padding.top + (1 - (value - minimum) / range) * chartHeight;

    context.clearRect(0, 0, width, height);
    context.font = "11px system-ui, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let line = 0; line <= 4; line += 1) {
      const value = minimum + (range * line) / 4;
      const lineY = y(value);
      context.strokeStyle = "rgba(200,164,93,.16)";
      context.beginPath();
      context.moveTo(padding.left, lineY);
      context.lineTo(width - padding.right, lineY);
      context.stroke();
      context.fillStyle = "#8f8779";
      context.fillText(String(Math.round(value)), padding.left - 10, lineY);
    }

    if (metric === "glicko" && points.some((point) => point.glickoRdTenths !== null)) {
      context.beginPath();
      points.forEach((point, index) => {
        const high = point.glickoRating + 2 * ((point.glickoRdTenths ?? 0) / 10);
        if (index === 0) context.moveTo(x(index), y(high));
        else context.lineTo(x(index), y(high));
      });
      [...points].reverse().forEach((point, reverseIndex) => {
        const index = points.length - 1 - reverseIndex;
        const low = point.glickoRating - 2 * ((point.glickoRdTenths ?? 0) / 10);
        context.lineTo(x(index), y(low));
      });
      context.closePath();
      context.fillStyle = "rgba(224,184,95,.12)";
      context.fill();
    }

    const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "rgba(184,40,59,.38)");
    gradient.addColorStop(1, "rgba(184,40,59,0)");
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(x(index), y(valueForPoint(point)));
      else context.lineTo(x(index), y(valueForPoint(point)));
    });
    context.lineTo(x(points.length - 1), height - padding.bottom);
    context.lineTo(x(0), height - padding.bottom);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(x(index), y(valueForPoint(point)));
      else context.lineTo(x(index), y(valueForPoint(point)));
    });
    context.strokeStyle = "#e0b85f";
    context.lineWidth = 2.5;
    context.stroke();

    const last = points.at(-1)!;
    context.beginPath();
    context.arc(x(points.length - 1), y(valueForPoint(last)), 5, 0, Math.PI * 2);
    context.fillStyle = "#b7283b";
    context.fill();
    context.strokeStyle = "#fff0d2";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = "#8f8779";
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(bashoShortLabel(points[0].bashoId), padding.left, height - padding.bottom + 10);
    context.textAlign = "right";
    context.fillText(bashoShortLabel(last.bashoId), width - padding.right, height - padding.bottom + 10);
  }, [metric, points]);

  return (
    <div className="rikishi-chart-wrap">
      <canvas ref={canvasRef} className="rikishi-chart" aria-label={`${points[0]?.bashoId ?? ""}から${points.at(-1)?.bashoId ?? ""}までの${profileMetricLabels[metric]}推移`} />
    </div>
  );
}

export default function RikishiProfile({ rikishiRef }: { rikishiRef: string }) {
  const [payload, setPayload] = useState<RikishiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"all" | "5y" | "1y">("all");
  const [metric, setMetric] = useState<ProfileMetric>("elo");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rikishi?ref=${encodeURIComponent(rikishiRef)}`)
      .then(async (response) => {
        const body = await response.json() as RikishiPayload;
        if (!response.ok) throw new Error(body.error ?? "力士データを読み込めませんでした");
        if (!cancelled) setPayload(body);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "力士データを読み込めませんでした");
      });
    return () => { cancelled = true; };
  }, [rikishiRef]);

  const chartPoints = useMemo(() => {
    const history = payload?.history ?? [];
    const count = range === "1y" ? 6 : range === "5y" ? 30 : history.length;
    return history.slice(-count);
  }, [payload, range]);

  if (error) return <main className="rikishi-page"><div className="rikishi-error"><strong>力士情報を表示できません</strong><p>{error}</p><Link href="/rate">レート順位へ戻る →</Link></div></main>;
  if (!payload) return <main className="rikishi-page"><div className="rikishi-loading">力士プロフィールを読み込み中…</div></main>;

  const { wrestler, latest, history } = payload;
  const peakElo = history.reduce((maximum, point) => Math.max(maximum, point.peakElo), latest?.peakElo ?? 1500);
  const valueForPoint = (point: RatingPoint | undefined) => {
    if (!point) return "—";
    if (metric === "elo") return point.elo;
    if (metric === "glicko") return point.glickoRating;
    return (point.sumoHensachiTenths / 10).toFixed(1);
  };
  return (
    <main className="rikishi-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>力士レート名鑑</strong><span>Elo HISTORY</span></div>
      <header className="site-header">
        <nav className="nav-shell" aria-label="メインナビゲーション">
          <div className="nav-group nav-left"><Link href="/#torikumi">取組</Link><Link href="/#banzuke">番付</Link><Link href="/rate">レート</Link></div>
          <Link className="brand" href="/"><span className="brand-crest" aria-hidden="true">土</span><span className="brand-title">土俵日和</span><span className="brand-roman">DOHYO BIYORI</span></Link>
          <div className="nav-group nav-right"><Link href="/#culture">相撲文化</Link></div>
        </nav>
      </header>

      <section className="rikishi-profile-hero">
        <div>
          <p className="rate-kicker">RIKISHI PROFILE / {wrestler.shikonaEn}</p>
          <h1>{wrestler.displayName}</h1>
          <p className="rikishi-rankline">{latest ? `${divisionNames[latest.division - 1]}・${latest.rank}` : "番付記録を確認中"}</p>
          <div className="rikishi-profile-links">
            <Link href="/rate">← レート順位へ</Link>
            {wrestler.officialProfileUrl && <a href={wrestler.officialProfileUrl} target="_blank" rel="noreferrer">日本相撲協会プロフィール ↗</a>}
          </div>
        </div>
        <div className="rikishi-rating-seal">
          <span>現在{profileMetricLabels[metric]}</span><strong>{valueForPoint(latest ?? undefined)}</strong>
          <small>{metric === "elo" ? `最高 ${peakElo}` : metric === "glicko" && latest?.glickoRdTenths ? `推定幅 ±${Math.round((latest.glickoRdTenths / 10) * 2)}` : "同場所・同段"}</small>
        </div>
      </section>

      <section className="rate-shell rikishi-summary" aria-label="力士概要">
        <div><span>相撲偏差値</span><strong>{latest ? (latest.sumoHensachiTenths / 10).toFixed(1) : "—"}</strong></div>
        <div><span>現在の地力</span><strong>{latest?.glickoRating ?? "—"}</strong></div>
        <div><span>現在Elo</span><strong>{latest?.elo ?? "—"}</strong></div>
        <div><span>通算成績</span><strong>{latest ? `${latest.wins}勝 ${latest.losses}敗` : "—"}</strong></div>
        <div><span>所属部屋</span><strong>{wrestler.heya ?? "—"}</strong></div>
        <div><span>体格</span><strong>{wrestler.heightCm ? `${wrestler.heightCm}cm` : "—"} / {wrestler.weightKg ? `${wrestler.weightKg}kg` : "—"}</strong></div>
      </section>

      <section className="rate-shell rikishi-history" aria-labelledby="elo-history-title">
        <div className="rate-section-heading">
          <div><p>RATING HISTORY</p><h2 id="elo-history-title">{profileMetricLabels[metric]}推移</h2></div>
          <div className="rikishi-history-controls">
            <div className="rikishi-range" role="group" aria-label="表示するレート">
              {([['elo', 'Elo'], ['glicko', '地力'], ['hensachi', '偏差値']] as const).map(([value, label]) => (
                <button key={value} type="button" className={metric === value ? "is-active" : ""} onClick={() => setMetric(value)}>{label}</button>
              ))}
            </div>
            <div className="rikishi-range" role="group" aria-label="表示期間">
              {([['all', '全期間'], ['5y', '5年'], ['1y', '1年']] as const).map(([value, label]) => (
                <button key={value} type="button" className={range === value ? "is-active" : ""} onClick={() => setRange(value)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        {chartPoints.length > 1 ? <RatingChart points={chartPoints} metric={metric} /> : <p className="rikishi-no-chart">推移を描くための場所数がまだ足りません。</p>}
        <div className="rikishi-chart-stats">
          <span>初回 <b>{valueForPoint(chartPoints[0])}</b></span>
          <span>現在 <b>{valueForPoint(chartPoints.at(-1))}</b></span>
          <span>記録場所 <b>{history.length}</b></span>
        </div>
      </section>

      <section className="rate-shell rikishi-details" aria-labelledby="rikishi-details-title">
        <div className="rate-section-heading"><div><p>PROFILE DATA</p><h2 id="rikishi-details-title">基本情報</h2></div><span>DATA</span></div>
        <dl>
          <div><dt>四股名（英字）</dt><dd>{wrestler.shikonaEn}</dd></div>
          <div><dt>出身</dt><dd>{wrestler.shusshin ?? "—"}</dd></div>
          <div><dt>生年月日</dt><dd>{formatDate(wrestler.birthDate)}</dd></div>
          <div><dt>初土俵</dt><dd>{wrestler.debutBashoId ? `${bashoShortLabel(wrestler.debutBashoId)} 場所` : "—"}</dd></div>
          <div><dt>引退</dt><dd>{wrestler.intaiDate ? formatDate(wrestler.intaiDate) : "現役"}</dd></div>
          <div><dt>収録取組</dt><dd>{latest?.bouts ?? 0}番</dd></div>
        </dl>
      </section>

      <footer><div className="footer-brand"><span className="brand-crest" aria-hidden="true">土</span><div><strong>土俵日和</strong><small>相撲を、もっと近くに。</small></div></div><p>非公式ファンサイト</p><Link href="/rate">レート順位へ戻る →</Link></footer>
    </main>
  );
}
