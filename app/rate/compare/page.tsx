import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import RateLabNav from "../rate-lab-nav";
import ComparisonBoard from "./comparison-board";

export const metadata: Metadata = {
  title: "推し力士・対戦比較｜土俵日和",
  description: "二人の力士を選び、Elo・Glicko-2・相撲偏差値・直接対戦・決まり手・全盛期を比較します。",
};

export default function ComparePage() {
  return (
    <main className="rate-page lab-subpage compare-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>土俵日和 対戦比較室</strong><span>二人を選んで、強さの理由まで比べる</span></div>
      <SiteHeader active="compare" />

      <RateLabNav active="compare" />

      <section className="lab-hero compare-hero">
        <div><p>FAVORITE RIKISHI / MATCHUP</p><h1>推しと好敵手を、<br />同じ土俵に。</h1><p>現在のGlicko-2、全盛期、直接対戦、最近の調子、勝ち筋。数字の差だけでなく、なぜその予想になるのかまで一画面で比べます。</p></div>
        <figure className="lab-hero-art">
          <Image src="/rating-compare-art.png" alt="異なる時代の二人の力士とレート曲線を描いた金箔調の図" width={1536} height={1024} priority />
          <figcaption><strong>9,000+</strong><span>1958年三月場所から比較</span></figcaption>
        </figure>
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
