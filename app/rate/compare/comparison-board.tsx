"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HistoryPoint = {
  bashoId: number;
  division: number;
  rank: string;
  elo: number;
  peakElo: number;
  glickoRating: number;
  glickoRdTenths: number | null;
  sumoHensachiTenths: number;
  bouts: number;
  wins: number;
  losses: number;
};

type RikishiOption = {
  id: number;
  name: string;
  shikonaEn: string;
  heya?: string | null;
  birthDate?: string | null;
  highestRank?: string | null;
  firstBasho?: number | null;
  lastBasho?: number | null;
  intaiDate?: string | null;
};

type ComparedRikishi = RikishiOption & {
  nskId: number | null;
  birthDate: string | null;
  shusshin: string | null;
  heightCm: number | null;
  weightKg: number | null;
  profileUrl: string;
  history: HistoryPoint[];
  career: {
    latest: HistoryPoint | null;
    peakElo: { value: number; bashoId: number } | null;
    peakGlicko: { value: number; rd: number; bashoId: number } | null;
    peakHensachi: { value: number; bashoId: number } | null;
    sustainedHensachi: number | null;
    makuuchiBasho: number;
    firstBasho: number | null;
    lastBasho: number | null;
  };
  style: { kimarite: string; count: number; share: number }[];
  recentForm: { bashoId: number; day: number; won: boolean }[];
};

type ComparePayload = {
  left: ComparedRikishi;
  right: ComparedRikishi;
  prediction: {
    currentLeftProbability: number;
    glickoLeftProbability: number;
    peakLeftProbability: number;
    confidence: "high" | "medium" | "low";
    headToHeadAdjustmentPoints: number;
  };
  headToHead: {
    bouts: number;
    leftWins: number;
    rightWins: number;
    rows: { id: string; bashoId: number; day: number; winnerId: number | null; kimarite: string | null }[];
  };
  error?: string;
};

type Metric = "glicko" | "elo" | "hensachi";

const metricLabels: Record<Metric, string> = { glicko: "Glicko-2", elo: "Elo", hensachi: "相撲偏差値" };

const popularPairs: { label: string; left: RikishiOption; right: RikishiOption }[] = [
  {
    label: "大の里 × 豊昇龍",
    left: { id: 8850, name: "大の里", shikonaEn: "Onosato" },
    right: { id: 19, name: "豊昇龍", shikonaEn: "Hoshoryu" },
  },
  {
    label: "白鵬 × 大鵬",
    left: { id: 3081, name: "白鵬", shikonaEn: "Hakuho" },
    right: { id: 1511, name: "大鵬", shikonaEn: "Taiho" },
  },
  {
    label: "貴乃花 × 白鵬",
    left: { id: 4789, name: "貴乃花", shikonaEn: "Takanohana Koji" },
    right: { id: 3081, name: "白鵬", shikonaEn: "Hakuho" },
  },
];

function bashoLabel(bashoId: number | null) {
  if (!bashoId) return "—";
  return `${Math.floor(bashoId / 100)}年${bashoId % 100}月`;
}

function bashoShort(bashoId: number) {
  return `${Math.floor(bashoId / 100)}.${String(bashoId % 100).padStart(2, "0")}`;
}

function bashoOrdinal(bashoId: number) {
  return Math.floor(bashoId / 100) * 12 + (bashoId % 100);
}

function metricValue(point: HistoryPoint, metric: Metric) {
  if (metric === "glicko") return point.glickoRating;
  if (metric === "elo") return point.elo;
  return point.sumoHensachiTenths / 10;
}

function ComparisonChart({ left, right, metric }: { left: ComparedRikishi; right: ComparedRikishi; metric: Metric }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = rect.width;
      const height = rect.height;
      const padding = { top: 26, right: 22, bottom: 34, left: 54 };
      const all = [...left.history, ...right.history];
      if (all.length < 2) return;
      const values = all.map((point) => metricValue(point, metric));
      const step = metric === "hensachi" ? 10 : 100;
      const minimum = Math.floor((Math.min(...values) - (metric === "hensachi" ? 3 : 30)) / step) * step;
      const maximum = Math.ceil((Math.max(...values) + (metric === "hensachi" ? 3 : 30)) / step) * step;
      const range = Math.max(step, maximum - minimum);
      const first = Math.min(...all.map((point) => bashoOrdinal(point.bashoId)));
      const last = Math.max(...all.map((point) => bashoOrdinal(point.bashoId)));
      const x = (point: HistoryPoint) => padding.left + ((bashoOrdinal(point.bashoId) - first) / Math.max(1, last - first)) * (width - padding.left - padding.right);
      const y = (value: number) => padding.top + (1 - (value - minimum) / range) * (height - padding.top - padding.bottom);
      context.clearRect(0, 0, width, height);
      context.font = "11px system-ui, sans-serif";
      context.textAlign = "right";
      context.textBaseline = "middle";
      for (let line = 0; line <= 4; line += 1) {
        const value = minimum + range * line / 4;
        const lineY = y(value);
        context.strokeStyle = "rgba(200,164,93,.16)";
        context.beginPath();
        context.moveTo(padding.left, lineY);
        context.lineTo(width - padding.right, lineY);
        context.stroke();
        context.fillStyle = "#8f8779";
        context.fillText(String(Math.round(value)), padding.left - 10, lineY);
      }
      const line = (points: HistoryPoint[], color: string) => {
        context.beginPath();
        points.forEach((point, index) => {
          if (index === 0) context.moveTo(x(point), y(metricValue(point, metric)));
          else context.lineTo(x(point), y(metricValue(point, metric)));
        });
        context.strokeStyle = color;
        context.lineWidth = 2.5;
        context.stroke();
      };
      line(left.history, "#e0b85f");
      line(right.history, "#c63a4e");
      context.fillStyle = "#8f8779";
      context.textBaseline = "top";
      context.textAlign = "left";
      context.fillText(bashoShort(all.reduce((a, b) => a.bashoId < b.bashoId ? a : b).bashoId), padding.left, height - padding.bottom + 10);
      context.textAlign = "right";
      context.fillText(bashoShort(all.reduce((a, b) => a.bashoId > b.bashoId ? a : b).bashoId), width - padding.right, height - padding.bottom + 10);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [left, metric, right]);

  return <canvas ref={canvasRef} className="compare-chart" aria-label={`${left.name}と${right.name}の${metricLabels[metric]}推移`} />;
}

function SearchPicker({ side, selected, onSelect }: { side: "左" | "右"; selected: RikishiOption; onSelect: (rikishi: RikishiOption) => void }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RikishiOption[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!query.trim()) { setRows([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/compare?mode=search&q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((body: { rows?: RikishiOption[] }) => setRows(body.rows ?? []))
        .catch(() => undefined);
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  return (
    <div className="compare-picker">
      <small>{side}の力士</small>
      <strong>{selected.name}</strong>
      <span>{selected.shikonaEn}</span>
      <label>
        <span className="sr-only">{side}の力士を検索</span>
        <input value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="四股名で入れ替える" />
      </label>
      {open && rows.length > 0 && (
        <div className="compare-search-results">
          {rows.map((row) => {
            const birthYear = row.birthDate ? new Date(row.birthDate).getUTCFullYear() : null;
            const firstYear = row.firstBasho ? Math.floor(row.firstBasho / 100) : null;
            const lastYear = row.lastBasho ? Math.floor(row.lastBasho / 100) : null;
            return <button key={row.id} type="button" onClick={() => { onSelect(row); setQuery(""); setOpen(false); }}>
              <span className="compare-search-name"><strong>{row.name}</strong><small>{row.shikonaEn}</small></span>
              <span className="compare-search-identity">
                <strong>{row.highestRank ?? "番付不明"}</strong>
                <small>{birthYear ? `${birthYear}年生` : "生年不明"}・{firstYear ? `${firstYear}—${lastYear ?? "現役"}` : row.intaiDate ? "引退" : "現役"}</small>
              </span>
            </button>;
          })}
        </div>
      )}
    </div>
  );
}

function YokozunaPicker({ side, selected, rows, onSelect }: { side: "左" | "右"; selected: RikishiOption; rows: RikishiOption[]; onSelect: (rikishi: RikishiOption) => void }) {
  return (
    <label className="compare-picker compare-select-picker">
      <small>{side}の横綱</small>
      <strong>{selected.name}</strong>
      <span>{selected.shikonaEn}</span>
      <select value={selected.id} onChange={(event) => { const row = rows.find((item) => item.id === Number(event.target.value)); if (row) onSelect(row); }}>
        {rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select>
    </label>
  );
}

function RikishiSummary({ rikishi, side }: { rikishi: ComparedRikishi; side: "left" | "right" }) {
  const latest = rikishi.career.latest;
  return (
    <article className={`compare-rikishi-card is-${side}`}>
      <p>{side === "left" ? "東方" : "西方"} / {rikishi.shikonaEn}</p>
      <h2><Link href={rikishi.profileUrl}>{rikishi.name}</Link></h2>
      <span>{rikishi.intaiDate ? `最終収録 ${bashoLabel(rikishi.career.lastBasho)}` : `最新 ${bashoLabel(rikishi.career.lastBasho)}`}</span>
      <dl>
        <div><dt>Glicko-2</dt><dd>{latest?.glickoRating ?? "—"}</dd></div>
        <div><dt>Elo</dt><dd>{latest?.elo ?? "—"}</dd></div>
        <div><dt>相撲偏差値</dt><dd>{latest ? (latest.sumoHensachiTenths / 10).toFixed(1) : "—"}</dd></div>
        <div><dt>最高Glicko-2</dt><dd>{rikishi.career.peakGlicko?.value ?? "—"}</dd></div>
        <div><dt>最高偏差値</dt><dd>{rikishi.career.peakHensachi?.value.toFixed(1) ?? "—"}</dd></div>
        <div><dt>上位6場所</dt><dd>{rikishi.career.sustainedHensachi?.toFixed(1) ?? "—"}</dd></div>
      </dl>
      <div className="compare-body-data"><span>{rikishi.heightCm ? `${rikishi.heightCm}cm` : "身長—"}</span><span>{rikishi.weightKg ? `${rikishi.weightKg}kg` : "体重—"}</span><span>{rikishi.heya ?? "部屋—"}</span></div>
      <Link className="compare-profile-link" href={rikishi.profileUrl}>プロフィールと全推移を見る →</Link>
    </article>
  );
}

export default function ComparisonBoard({
  variant,
  initialLeft,
  initialRight,
}: {
  variant: "rikishi" | "yokozuna";
  initialLeft: RikishiOption;
  initialRight: RikishiOption;
}) {
  const [left, setLeft] = useState(initialLeft);
  const [right, setRight] = useState(initialRight);
  const [candidates, setCandidates] = useState<RikishiOption[]>([initialLeft, initialRight]);
  const [payload, setPayload] = useState<ComparePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("glicko");
  const [forecastMode, setForecastMode] = useState<"current" | "peak">(variant === "yokozuna" ? "peak" : "current");
  const [copyLabel, setCopyLabel] = useState("比較URLをコピー");

  useEffect(() => {
    if (variant !== "yokozuna") return;
    fetch("/api/compare?mode=yokozuna&order=chronological")
      .then((response) => response.json())
      .then((body: { rows?: RikishiOption[] }) => { if (body.rows?.length) setCandidates(body.rows); })
      .catch(() => undefined);
  }, [variant]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leftFromUrl = Number(params.get("left"));
    const rightFromUrl = Number(params.get("right"));
    if (Number.isInteger(rightFromUrl) && rightFromUrl > 0 && rightFromUrl !== leftFromUrl && rightFromUrl !== right.id) {
      setRight({ ...right, id: rightFromUrl });
    } else if (Number.isInteger(leftFromUrl) && leftFromUrl > 0 && leftFromUrl === right.id) {
      setRight(initialLeft);
    }
    if (Number.isInteger(leftFromUrl) && leftFromUrl > 0 && leftFromUrl !== left.id) setLeft({ ...left, id: leftFromUrl });
    // URLからのIDは比較APIの正式名で直後に置き換わります。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (left.id === right.id) { setError("異なる2力士を選んでください"); return; }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/compare?left=${left.id}&right=${right.id}`);
      const body = await response.json() as ComparePayload;
      if (!response.ok || !body.left || !body.right) throw new Error(body.error ?? "比較データを読み込めませんでした");
      setPayload(body);
      setLeft((current) => ({ ...current, id: body.left.id, name: body.left.name, shikonaEn: body.left.shikonaEn }));
      setRight((current) => ({ ...current, id: body.right.id, name: body.right.name, shikonaEn: body.right.shikonaEn }));
      const url = new URL(window.location.href);
      url.searchParams.set("left", String(body.left.id));
      url.searchParams.set("right", String(body.right.id));
      window.history.replaceState({}, "", url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "比較データを読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }, [left.id, right.id]);

  useEffect(() => { load(); }, [load]);

  const probability = payload
    ? forecastMode === "peak" ? payload.prediction.peakLeftProbability : payload.prediction.currentLeftProbability
    : 50;
  const confidenceLabel = payload?.prediction.confidence === "high" ? "推定安定" : payload?.prediction.confidence === "medium" ? "推定中" : "参考値";
  const overlap = useMemo(() => {
    if (!payload?.left.career.firstBasho || !payload?.right.career.firstBasho || !payload.left.career.lastBasho || !payload.right.career.lastBasho) return false;
    return Math.max(payload.left.career.firstBasho, payload.right.career.firstBasho) <= Math.min(payload.left.career.lastBasho, payload.right.career.lastBasho);
  }, [payload]);

  const swapRikishi = () => {
    setLeft(right);
    setRight(left);
  };

  const copyComparisonUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyLabel("コピーしました");
    } catch {
      setCopyLabel("コピーできませんでした");
    }
    window.setTimeout(() => setCopyLabel("比較URLをコピー"), 1800);
  };

  return (
    <>
      <section className={`compare-toolbox${variant === "yokozuna" ? " is-yokozuna" : ""}`} aria-label="比較のショートカット">
        {variant === "rikishi" ? (
          <div className="compare-popular-pairs">
            <span>人気の組合せ</span>
            {popularPairs.map((pair) => (
              <button key={pair.label} type="button" onClick={() => { setLeft(pair.left); setRight(pair.right); }}>
                {pair.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="compare-tool-actions">
          <button type="button" onClick={swapRikishi}>左右を入れ替える ⇄</button>
          <button type="button" onClick={copyComparisonUrl} aria-live="polite">{copyLabel}</button>
        </div>
      </section>

      <section className="compare-selectors" aria-label="比較する力士を選ぶ">
        {variant === "yokozuna"
          ? <YokozunaPicker side="左" selected={left} rows={candidates} onSelect={setLeft} />
          : <SearchPicker side="左" selected={left} onSelect={setLeft} />}
        <div className="compare-versus" aria-hidden="true"><span>対</span><small>COMPARE</small></div>
        {variant === "yokozuna"
          ? <YokozunaPicker side="右" selected={right} rows={candidates} onSelect={setRight} />
          : <SearchPicker side="右" selected={right} onSelect={setRight} />}
      </section>

      {error && <div className="compare-message is-error"><strong>比較できませんでした</strong><span>{error}</span></div>}
      {loading && <div className="compare-message"><strong>二人の取組史を照合中…</strong><span>集計済みデータから読み込んでいます</span></div>}

      {payload && !loading && (
        <>
          <section className="compare-forecast" aria-labelledby="compare-forecast-title">
            <div className="compare-forecast-heading">
              <div><p>MATCHUP FORECAST</p><h2 id="compare-forecast-title">{forecastMode === "peak" ? "全盛期を同じ土俵に置く" : "いま対戦した場合"}</h2></div>
              <div className="compare-mode-switch" role="group" aria-label="予測時点">
                <button type="button" className={forecastMode === "current" ? "is-active" : ""} onClick={() => setForecastMode("current")}>現在／最終値</button>
                <button type="button" className={forecastMode === "peak" ? "is-active" : ""} onClick={() => setForecastMode("peak")}>全盛期</button>
              </div>
            </div>
            <div className="compare-probability-names"><strong>{payload.left.name} <b>{probability}%</b></strong><span>{confidenceLabel}</span><strong><b>{100 - probability}%</b> {payload.right.name}</strong></div>
            <div className="compare-probability-bar"><i style={{ width: `${probability}%` }} /></div>
            <p className="compare-forecast-note">
              {forecastMode === "peak"
                ? "両力士の最高Glicko-2を使った仮想比較です。時代の体格・技術差を断定するものではありません。"
                : `Glicko-2のレート差に、直接対戦${payload.headToHead.bouts ? ` ${payload.headToHead.bouts}番` : "なし"}を小さく補正。直接対戦補正 ${payload.prediction.headToHeadAdjustmentPoints >= 0 ? "+" : ""}${payload.prediction.headToHeadAdjustmentPoints}pt。`}
            </p>
          </section>

          <section className="compare-cards">
            <RikishiSummary rikishi={payload.left} side="left" />
            <RikishiSummary rikishi={payload.right} side="right" />
          </section>

          <section className="rate-shell compare-history" aria-labelledby="compare-history-title">
            <div className="rate-section-heading"><div><p>CAREER CURVES</p><h2 id="compare-history-title">二人のレート推移</h2></div><div className="compare-metric-switch" role="group" aria-label="グラフの指標">{(["glicko", "elo", "hensachi"] as Metric[]).map((value) => <button key={value} type="button" className={metric === value ? "is-active" : ""} onClick={() => setMetric(value)}>{metricLabels[value]}</button>)}</div></div>
            <div className="compare-chart-legend"><span className="is-left">{payload.left.name}</span><span className="is-right">{payload.right.name}</span></div>
            <ComparisonChart left={payload.left} right={payload.right} metric={metric} />
            <div className="compare-career-range"><span>{payload.left.name}：{bashoLabel(payload.left.career.firstBasho)}〜{bashoLabel(payload.left.career.lastBasho)}</span><span>{payload.right.name}：{bashoLabel(payload.right.career.firstBasho)}〜{bashoLabel(payload.right.career.lastBasho)}</span></div>
          </section>

          <section className="rate-shell compare-evidence" aria-labelledby="compare-evidence-title">
            <div className="rate-section-heading"><div><p>WHY THIS NUMBER</p><h2 id="compare-evidence-title">強さの内訳</h2></div><span>根拠</span></div>
            <div className="compare-evidence-grid">
              <article><span>直接対戦</span><strong>{payload.headToHead.bouts ? `${payload.headToHead.leftWins} — ${payload.headToHead.rightWins}` : "対戦なし"}</strong><p>{overlap ? "同時代の実戦結果。少数の対戦は強く効かせすぎないよう縮小しています。" : "現役期間が重ならないため、直接対戦ではなく各時代のレートを比較します。"}</p></article>
              <article><span>幕内での持続</span><strong>{payload.left.career.makuuchiBasho} — {payload.right.career.makuuchiBasho}</strong><p>幕内に在位した収録場所数。ピークだけでなく、頂点を維持した長さを見る材料です。</p></article>
              <article><span>上位6場所偏差値</span><strong>{payload.left.career.sustainedHensachi?.toFixed(1) ?? "—"} — {payload.right.career.sustainedHensachi?.toFixed(1) ?? "—"}</strong><p>最高の6場所を平均し、一場所だけの突出ではない強さを表します。</p></article>
            </div>
          </section>

          <section className="rate-shell compare-form-style">
            <div className="compare-style-column"><div className="rate-section-heading"><div><p>WINNING TECHNIQUES</p><h2>{payload.left.name}の勝ち筋</h2></div><span>直近収録</span></div><div className="compare-style-list">{payload.left.style.length ? payload.left.style.map((item) => <div key={item.kimarite}><strong>{item.kimarite}</strong><span>{item.count}番</span><i style={{ width: `${Math.max(5, item.share)}%` }} /></div>) : <p>決まり手データなし</p>}</div><div className="compare-form" aria-label={`${payload.left.name}の直近成績`}>{payload.left.recentForm.map((item, index) => <span key={`${item.bashoId}-${item.day}-${index}`} className={item.won ? "is-win" : "is-loss"}>{item.won ? "勝" : "敗"}</span>)}</div></div>
            <div className="compare-style-column"><div className="rate-section-heading"><div><p>WINNING TECHNIQUES</p><h2>{payload.right.name}の勝ち筋</h2></div><span>直近収録</span></div><div className="compare-style-list">{payload.right.style.length ? payload.right.style.map((item) => <div key={item.kimarite}><strong>{item.kimarite}</strong><span>{item.count}番</span><i style={{ width: `${Math.max(5, item.share)}%` }} /></div>) : <p>決まり手データなし</p>}</div><div className="compare-form" aria-label={`${payload.right.name}の直近成績`}>{payload.right.recentForm.map((item, index) => <span key={`${item.bashoId}-${item.day}-${index}`} className={item.won ? "is-win" : "is-loss"}>{item.won ? "勝" : "敗"}</span>)}</div></div>
          </section>

          <section className="rate-shell compare-head-to-head" aria-labelledby="head-to-head-title">
            <div className="rate-section-heading"><div><p>HEAD TO HEAD</p><h2 id="head-to-head-title">直接対戦の記録</h2></div><span>{payload.headToHead.bouts}番</span></div>
            {payload.headToHead.rows.length ? <div className="compare-bout-list">{payload.headToHead.rows.map((bout) => <div key={bout.id}><span>{bashoLabel(bout.bashoId)}・{bout.day}日目</span><strong>{bout.winnerId === payload.left.id ? payload.left.name : payload.right.name}</strong><em>{bout.kimarite ?? "決まり手不明"}</em></div>)}</div> : <p className="compare-empty">直接対戦はありません。全盛期比較は、各時代で記録したレートを同じ目盛りに置いた実験値としてご覧ください。</p>}
          </section>
        </>
      )}
    </>
  );
}
