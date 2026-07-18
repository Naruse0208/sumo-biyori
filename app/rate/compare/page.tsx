import type { Metadata } from "next";
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
      <SiteHeader active="rate" />

      <RateLabNav active="compare" />

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
