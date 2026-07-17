import type { Metadata } from "next";
import Link from "next/link";
import ratings from "../../data/ratings-latest.json";
import RatingBoard from "./rating-board";

export const metadata: Metadata = {
  title: "力士レート｜土俵日和",
  description: "1999年以降・全六段の40万件を超える取組から再計算したEloと、土俵日和独自の土俵偏差値。",
};

const auditStats = [
  { value: "1999—", label: "収録対象" },
  { value: "全六段", label: "幕内から序ノ口" },
  { value: ratings.counts.sourceWrestlers.toLocaleString(), label: "力士マスター" },
  { value: ratings.counts.ratedBouts.toLocaleString(), label: "Elo計算済み取組" },
];

const releaseSteps = [
  { number: "壱", title: "記録を揃える", copy: "力士ID、改名、番付、全取組を一つの時系列へ。" },
  { number: "弐", title: "Eloを再計算", copy: "1999年の基準値から、一番ごとに勝者と敗者のレートを更新。" },
  { number: "参", title: "時代差をならす", copy: "同時代・同階級の分布で標準化し、土俵偏差値へ変換。" },
  { number: "肆", title: "今日の取組へ", copy: "順位、推移、対戦相性、現在と次の一番の勝率を公開。" },
];

export default function RatePage() {
  return (
    <main className="rate-page">
      <div className="rate-frame" aria-hidden="true" />

      <div className="notice-bar rate-notice">
        <strong>力士レート計画</strong>
        <span>1999年以降・全六段</span>
      </div>

      <header className="site-header">
        <nav className="nav-shell" aria-label="メインナビゲーション">
          <div className="nav-group nav-left">
            <Link href="/#torikumi">取組</Link>
            <Link href="/#banzuke">番付</Link>
            <Link className="is-current" href="/rate">レート</Link>
          </div>

          <Link className="brand" href="/" aria-label="土俵日和 ホーム">
            <span className="brand-crest" aria-hidden="true">土</span>
            <span className="brand-title">土俵日和</span>
            <span className="brand-roman">DOHYO BIYORI</span>
          </Link>

          <div className="nav-group nav-right">
            <Link href="/#culture">相撲文化</Link>
          </div>

          <details className="mobile-menu">
            <summary aria-label="メニューを開く">目次</summary>
            <div className="mobile-menu-panel">
              <Link href="/#torikumi">取組</Link>
              <Link href="/#banzuke">番付</Link>
              <Link className="is-current" href="/rate">レート</Link>
              <Link href="/#culture">相撲文化</Link>
            </div>
          </details>
        </nav>
      </header>

      <section className="rate-hero">
        <div className="rate-hero-copy">
          <p className="rate-kicker">DOHYO BIYORI RATING LAB</p>
          <h1>強さを、<br />時代の中で測る。</h1>
          <p className="rate-lead">
            1999年以降の全取組を一番ずつ積み上げ、対戦相手の強さまで含めて数値化する。
            生のEloと、時代を越えて見比べるための独自指標を、ここから育てます。
          </p>
          <div className="rate-hero-actions">
            <span className="rate-status"><i aria-hidden="true" />全期間Elo 計算完了</span>
            <a href="#method">算出方法を見る <span>↓</span></a>
          </div>
        </div>

        <div className="rate-seal" aria-label="試算版">
          <span>試</span>
          <span>算</span>
          <small>PREVIEW</small>
        </div>
      </section>

      <section className="rate-shell rate-metrics" id="method" aria-labelledby="metric-title">
        <div className="rate-section-heading">
          <div>
            <p>THE TWO NUMBERS</p>
            <h2 id="metric-title">二つの数字で、強さを見る。</h2>
          </div>
          <span>算出設計</span>
        </div>

        <div className="rate-metric-grid">
          <article className="rate-metric-card rate-metric-elo">
            <div className="rate-card-topline"><span>01</span><em>RAW RATING</em></div>
            <h3>Elo</h3>
            <div className="rate-metric-number"><strong>1500</strong><span>基準値</span></div>
            <p>勝敗と対戦相手のレート差から、一番ごとに増減する生の強さ。時系列を崩さず、全取組から再計算します。</p>
          </article>

          <article className="rate-metric-card rate-metric-hensachi">
            <div className="rate-card-topline"><span>02</span><em>ERA ADJUSTED</em></div>
            <h3>土俵偏差値 <small>仮称</small></h3>
            <div className="rate-metric-number"><strong>50</strong><span>同時代平均</span></div>
            <p>Eloを同じ時代の分布で標準化。全盛期の違う力士を、共通の物差しで見比べるための土俵日和独自指標です。</p>
          </article>
        </div>

        <div className="rate-formula" aria-label="計算の流れ">
          <span>全取組</span><b>→</b><span>相手の強さを補正</span><b>→</b><span>Elo</span><b>→</b><span>同時代で標準化</span><b>→</b><span>土俵偏差値</span>
        </div>
      </section>

      <section className="rate-shell rate-ranking" aria-labelledby="ranking-title">
        <div className="rate-section-heading">
          <div>
            <p>RIKISHI RATING</p>
            <h2 id="ranking-title">力士レート順位</h2>
          </div>
          <span className="rate-pending">1999年以降・{ratings.scope.basho}場所</span>
        </div>

        <RatingBoard
          divisions={ratings.divisions}
          initialBasho={Number(ratings.scope.latestBasho)}
        />
        <div className="rate-ranking-board rate-ranking-method">
          <div className="rate-ranking-note">
            <p><strong>計算範囲</strong> 1999年一月場所〜令和八年七月場所・全六段／{ratings.counts.ratedBouts.toLocaleString()}取組・{ratings.counts.wrestlersInScope.toLocaleString()}力士</p>
            <p>基準Elo {ratings.model.startingElo}、K値 {ratings.model.kFactor}。選択場所の終了時点を表示し、最新場所は取得済み取組までを反映します。</p>
            <a href="https://sumo-api.com/api-guide" target="_blank" rel="noreferrer">取組データ仕様：Sumo API ↗</a>
          </div>
        </div>
      </section>

      <section className="rate-shell rate-data" aria-labelledby="data-title">
        <div className="rate-section-heading">
          <div>
            <p>DATA AUDIT</p>
            <h2 id="data-title">500MBに収める設計。</h2>
          </div>
          <span>初期調査</span>
        </div>

        <div className="rate-audit-grid">
          {auditStats.map((stat) => (
            <div className="rate-audit-stat" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="rate-storage-grid">
          <div>
            <p className="rate-storage-label">DATABASE TARGET</p>
            <strong>{ratings.storage.sqliteMiB}<small> MB 実測</small></strong>
            <div className="rate-storage-bar"><span style={{ width: `${(ratings.storage.sqliteMiB / ratings.storage.targetMiB) * 100}%` }} /></div>
            <p>力士、番付、全取組、各一番の前後Elo、場所ごとのレート履歴と検索用インデックスまで含む実測値です。</p>
          </div>
          <ul>
            <li><span>保存する</span>力士マスター・番付・取組・レート履歴</li>
            <li><span>保存しない</span>取得元HTML・画像・同じしこ名の重複</li>
            <li><span>余裕</span>500MB上限の約{Math.round((ratings.storage.sqliteMiB / ratings.storage.targetMiB) * 100)}%を使用</li>
          </ul>
        </div>
      </section>

      <section className="rate-shell rate-roadmap" aria-labelledby="roadmap-title">
        <div className="rate-section-heading">
          <div>
            <p>ROAD TO RELEASE</p>
            <h2 id="roadmap-title">公開までの四手。</h2>
          </div>
          <span>進行計画</span>
        </div>
        <ol>
          {releaseSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.copy}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rate-shell rate-next">
        <p>COMING NEXT</p>
        <h2>順位だけで終わらない。</h2>
        <div>
          <span>レート推移</span><span>対戦勝率</span><span>得意な決まり手</span><span>相性分析</span>
        </div>
        <p>力士プロフィールと今日の取組へ、同じ計算結果をつなぎます。</p>
      </section>

      <footer>
        <div className="footer-brand">
          <span className="brand-crest" aria-hidden="true">土</span>
          <div><strong>土俵日和</strong><small>相撲を、もっと近くに。</small></div>
        </div>
        <p>相撲を愛する人のための非公式ファンサイト</p>
        <Link href="/">トップへ戻る →</Link>
      </footer>
    </main>
  );
}
