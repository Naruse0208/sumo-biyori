"use client";

import { useMemo, useState } from "react";

type ModelId = "elo" | "glicko2" | "dohyoV2" | "dohyoV3";
type Metrics = {
  bouts: number;
  accuracy: number;
  brier: number;
  logLoss: number;
  upsetRate: number;
};
type ModelSummary = Record<ModelId, Metrics>;
type Evaluation = {
  models: Record<ModelId, { label: string; description: string }>;
  overall: { holdout: ModelSummary };
  byDivision: Array<{ division: number; name: string; models: ModelSummary }>;
  byYear: Array<{ year: number; models: ModelSummary }>;
  calibration: Record<ModelId, Array<{ bucket: string; bouts: number; predicted: number; actual: number }>>;
  scope: { holdout: string; holdoutBouts: number };
  v3: { status: string; featureNames: string[]; weights: number[]; caveat: string };
  dataQuality: { bodyCoverage: number; kimariteCoverage: number; japaneseNameCoverage: number; japaneseNames: number; wrestlers: number };
};

const modelIds: ModelId[] = ["elo", "glicko2", "dohyoV2", "dohyoV3"];

function percent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export default function ValidationBoard({ evaluation }: { evaluation: Evaluation }) {
  const [division, setDivision] = useState(0);
  const [selectedModel, setSelectedModel] = useState<ModelId>("dohyoV2");
  const summaries = useMemo(() => division === 0
    ? evaluation.overall.holdout
    : evaluation.byDivision.find((item) => item.division === division)?.models ?? evaluation.overall.holdout,
  [division, evaluation]);
  const selectedCalibration = evaluation.calibration[selectedModel];
  const eloLogLoss = summaries.elo.logLoss;

  return (
    <>
      <div className="validation-filter" aria-label="検証対象の段位">
        <button type="button" className={division === 0 ? "is-active" : ""} onClick={() => setDivision(0)}>全六段</button>
        {evaluation.byDivision.map((item) => (
          <button key={item.division} type="button" className={division === item.division ? "is-active" : ""} onClick={() => setDivision(item.division)}>{item.name}</button>
        ))}
      </div>

      <div className="validation-model-grid">
        {modelIds.map((modelId) => {
          const metrics = summaries[modelId];
          const improvement = ((eloLogLoss - metrics.logLoss) / eloLogLoss) * 100;
          return (
            <button
              type="button"
              key={modelId}
              className={`validation-model-card ${selectedModel === modelId ? "is-active" : ""}`}
              onClick={() => setSelectedModel(modelId)}
              aria-pressed={selectedModel === modelId}
            >
              <span>{evaluation.models[modelId].label}</span>
              <strong>{metrics.logLoss.toFixed(4)}</strong>
              <small>LOG LOSS・低いほど良い</small>
              <dl>
                <div><dt>的中率</dt><dd>{percent(metrics.accuracy)}</dd></div>
                <div><dt>Brier</dt><dd>{metrics.brier.toFixed(4)}</dd></div>
                <div><dt>Elo比</dt><dd>{modelId === "elo" ? "基準" : `${improvement >= 0 ? "−" : "+"}${Math.abs(improvement).toFixed(2)}%`}</dd></div>
              </dl>
              <p>{evaluation.models[modelId].description}</p>
            </button>
          );
        })}
      </div>

      <section className="validation-calibration" aria-labelledby="calibration-title">
        <div className="validation-subheading">
          <div><p>CALIBRATION</p><h2 id="calibration-title">「70%」は、本当に7割勝ったか。</h2></div>
          <span>{evaluation.models[selectedModel].label}</span>
        </div>
        <div className="calibration-chart">
          {selectedCalibration.map((bucket) => (
            <div className="calibration-row" key={bucket.bucket}>
              <span>{bucket.bucket}</span>
              <div aria-label={`${bucket.bucket} 予想${percent(bucket.predicted)} 実績${percent(bucket.actual)}`}>
                <i style={{ width: `${bucket.predicted * 100}%` }}><small>予想</small></i>
                <b style={{ width: `${bucket.actual * 100}%` }}><small>実績</small></b>
              </div>
              <em>{percent(bucket.actual)}<small>{bucket.bouts.toLocaleString()}番</small></em>
            </div>
          ))}
        </div>
      </section>

      <section className="validation-years" aria-labelledby="year-title">
        <div className="validation-subheading">
          <div><p>YEAR BY YEAR</p><h2 id="year-title">年ごとに、勝ち逃げしていないか。</h2></div>
          <span>LOG LOSS</span>
        </div>
        <div className="validation-table-wrap">
          <table>
            <thead><tr><th>年</th>{modelIds.map((id) => <th key={id}>{evaluation.models[id].label}</th>)}</tr></thead>
            <tbody>{evaluation.byYear.map((row) => (
              <tr key={row.year}>
                <th>{row.year}</th>
                {modelIds.map((id) => {
                  const best = Math.min(...modelIds.map((candidate) => row.models[candidate].logLoss));
                  return <td className={row.models[id].logLoss === best ? "is-best" : ""} key={id}>{row.models[id].logLoss.toFixed(4)}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="validation-quality" aria-labelledby="quality-title">
        <div className="validation-subheading">
          <div><p>DATA QUALITY</p><h2 id="quality-title">使えるデータと、まだ危ないデータ。</h2></div>
          <span>監査</span>
        </div>
        <div className="quality-grid">
          <article><strong>{percent(evaluation.dataQuality.bodyCoverage)}</strong><span>体格データの取組カバー率</span><p>高いが、計測時点履歴がないためv3では研究扱い。</p></article>
          <article><strong>{percent(evaluation.dataQuality.kimariteCoverage)}</strong><span>決まり手カバー率</span><p>予測時点より前の勝ち技だけで傾向を作成。</p></article>
          <article><strong>{percent(evaluation.dataQuality.japaneseNameCoverage)}</strong><span>漢字しこ名カバー率</span><p>{evaluation.dataQuality.japaneseNames.toLocaleString()}／{evaluation.dataQuality.wrestlers.toLocaleString()}力士を照合済み。</p></article>
        </div>
        <aside className="validation-caution">
          <strong>v3はまだ挑戦者。</strong>
          <p>{evaluation.v3.caveat} 特徴量は{evaluation.v3.featureNames.join("・")}。正式な勝機表示は、検証済みのv2.1を継続します。</p>
        </aside>
      </section>
    </>
  );
}
