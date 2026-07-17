import type { Metadata } from "next";
import Link from "next/link";
import RateLabNav from "../rate-lab-nav";
import ComparisonBoard from "./comparison-board";

export const metadata: Metadata = {
  title: "推し力士・対戦比較｜土俵日和",
  description: "二人の力士を選び、Elo・地力・相撲偏差値・直接対戦・決まり手・全盛期を比較します。",
};

export default function ComparePage() {
  return (
    <main className="rate-page lab-subpage compare-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>土俵日和 対戦比較室</strong><span>二人を選んで、強さの理由まで比べる</span></div>
      <header className="site-header"><nav className="nav-shell" aria-label="メインナビゲーション"><div className="nav-group nav-left"><Link href="/#torikumi">取組</Link><Link href="/rate">レート</Link></div><Link className="brand" href="/" aria-label="土俵日和 ホーム"><span className="brand-crest" aria-hidden="true">土</span><span className="brand-title">土俵日和</span><span className="brand-roman">DOHYO BIYORI</span></Link><div className="nav-group nav-right"><Link className="is-current" href="/rate/compare">対戦比較</Link><Link href="/rate/yokozuna">歴代横綱</Link></div></nav></header>

      <RateLabNav active="compare" />

      <section className="lab-hero compare-hero">
        <div><p>FAVORITE RIKISHI / MATCHUP</p><h1>推しと好敵手を、<br />同じ土俵に。</h1><p>現在の地力、全盛期、直接対戦、最近の調子、勝ち筋。数字の差だけでなく、なぜその予想になるのかまで一画面で比べます。</p></div>
        <div className="lab-hero-score"><small>比較できる力士</small><strong>9,000+</strong><span>1958年三月場所から</span></div>
      </section>

      <div className="compare-shell">
        <ComparisonBoard
          variant="rikishi"
          initialLeft={{ id: 8850, name: "大の里", shikonaEn: "Onosato" }}
          initialRight={{ id: 19, name: "豊昇龍", shikonaEn: "Hoshoryu" }}
        />
      </div>

      <footer><div className="footer-brand"><span className="brand-crest" aria-hidden="true">土</span><div><strong>土俵日和</strong><small>推しを、数字でも深く知る。</small></div></div><p>相撲を愛する人のための非公式ファンサイト</p><Link href="/rate">レート研究室へ戻る →</Link></footer>
    </main>
  );
}
