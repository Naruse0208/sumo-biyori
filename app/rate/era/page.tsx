import type { Metadata } from "next";
import Link from "next/link";
import era from "../../../data/era-rankings.json";
import RateLabNav from "../rate-lab-nav";

export const metadata: Metadata = {
  title: "歴代力士・時代補正ランキング｜土俵日和",
  description: "1958年以降の幕内力士を、最高相撲偏差値と上位6場所平均から比較する歴代指数の実験版。",
};

function bashoLabel(bashoId: number) {
  const year = Math.floor(bashoId / 100);
  const month = bashoId % 100;
  return `${year}年${month}月`;
}

export default function EraPage() {
  const leaders = era.ranking.slice(0, 3);
  return (
    <main className="rate-page lab-subpage era-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>土俵日和 歴代比較室</strong><span>強さではなく、その時代をどれほど支配したか</span></div>
      <header className="site-header"><nav className="nav-shell" aria-label="メインナビゲーション"><div className="nav-group nav-left"><Link href="/#torikumi">取組</Link><Link href="/rate">レート</Link><Link href="/rate/validation">検証</Link></div><Link className="brand" href="/" aria-label="土俵日和 ホーム"><span className="brand-crest" aria-hidden="true">土</span><span className="brand-title">土俵日和</span><span className="brand-roman">DOHYO BIYORI</span></Link><div className="nav-group nav-right"><Link className="is-current" href="/rate/era">歴代比較</Link></div></nav></header>

      <RateLabNav active="era" />

      <section className="lab-hero era-hero">
        <div><p>ACROSS ERAS / EXPERIMENT</p><h1>時代の頂を、<br />同じ目盛りに置く。</h1><p>幕内平均からの傑出度を場所ごとに測り、最高到達点と上位6場所の持続力を合成。直接対戦できない時代を「絶対的な強さ」と言い切らないための歴代指数です。</p></div>
        <div className="lab-hero-score"><small>収録範囲</small><strong>1958—</strong><span>幕内在位6場所以上</span></div>
      </section>

      <section className="rate-shell era-shell" aria-labelledby="era-title">
        <div className="rate-section-heading"><div><p>ERA DOMINANCE INDEX</p><h2 id="era-title">歴代指数・実験ランキング</h2></div><span>PREVIEW</span></div>
        <div className="era-podium">
          {leaders.map((rikishi) => (
            <article key={rikishi.id}><span>第{rikishi.position}位</span><Link href={`/rikishi/${rikishi.id}`}>{rikishi.name}</Link><strong>{rikishi.eraIndex}</strong><dl><div><dt>最高偏差値</dt><dd>{rikishi.peakHensachi}</dd></div><div><dt>上位6場所</dt><dd>{rikishi.sustainedHensachi}</dd></div></dl><small>頂点 {bashoLabel(rikishi.peakBasho)}</small></article>
          ))}
        </div>

        <div className="era-formula"><span>歴代指数</span><b>＝</b><span>最高相撲偏差値 × 40%</span><b>＋</b><span>上位6場所平均 × 60%</span></div>

        <div className="era-table-wrap">
          <table>
            <thead><tr><th>順位</th><th>力士</th><th>歴代指数</th><th>最高偏差値</th><th>上位6場所</th><th>幕内場所</th><th>頂点</th></tr></thead>
            <tbody>{era.ranking.map((rikishi) => (
              <tr key={rikishi.id}><td>{rikishi.position}</td><th><Link href={`/rikishi/${rikishi.id}`}>{rikishi.name}</Link><small>{bashoLabel(rikishi.firstBasho)}〜{bashoLabel(rikishi.lastBasho)}</small></th><td><strong>{rikishi.eraIndex}</strong></td><td>{rikishi.peakHensachi}</td><td>{rikishi.sustainedHensachi}</td><td>{rikishi.makuuchiBasho}</td><td>{bashoLabel(rikishi.peakBasho)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="rate-shell era-reading">
        <div className="rate-section-heading"><div><p>HOW TO READ</p><h2>これは「もし戦ったら」の勝率ではない。</h2></div><span>読み方</span></div>
        <div><article><span>見るもの</span><h3>同時代での支配度</h3><p>その場所の幕内平均から、どれほど抜けていたかを比較します。</p></article><article><span>見ないもの</span><h3>体格・技術の年代進化</h3><p>白鵬と昭和の横綱を直接戦わせる勝率ではありません。</p></article><article><span>次の研究</span><h3>世代間の橋と推定幅</h3><p>現役期間が重なる力士を橋にした全履歴モデルを別枠で検証します。</p></article></div>
        <aside><strong>現在の限界</strong><p>{era.caveat} 1958年以前の実績は含まず、収録開始直後は全力士を同じ初期値から計算するため、初期数年間の値にはコールドスタートの影響があります。</p></aside>
      </section>

      <footer><div className="footer-brand"><span className="brand-crest" aria-hidden="true">土</span><div><strong>土俵日和</strong><small>時代を越えて、相撲を語る。</small></div></div><p>相撲を愛する人のための非公式ファンサイト</p><Link href="/rate">レート研究室へ戻る →</Link></footer>
    </main>
  );
}
