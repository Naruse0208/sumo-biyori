import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import RateLabNav from "../rate-lab-nav";
import ComparisonBoard from "../compare/comparison-board";

export const metadata: Metadata = {
  title: "歴代横綱・全盛期比較｜土俵日和",
  description: "1958年以降の歴代横綱を、最高Glicko-2・最高相撲偏差値・持続力・全盛期曲線で詳細比較します。",
};

export default function YokozunaPage() {
  return (
    <main className="rate-page lab-subpage compare-page yokozuna-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>土俵日和 歴代横綱比較室</strong><span>頂点の高さと、頂点にいた長さを比べる</span></div>
      <SiteHeader active="rate" />

      <RateLabNav active="yokozuna" />

      <div className="compare-shell">
        <ComparisonBoard
          variant="yokozuna"
          initialLeft={{ id: 3081, name: "白鵬", shikonaEn: "Hakuho" }}
          initialRight={{ id: 1511, name: "大鵬幸喜", shikonaEn: "Taiho" }}
        />
      </div>

      <section className="rate-shell yokozuna-method">
        <div className="rate-section-heading"><div><p>READ WITH CARE</p><h2>「最強」を断定しないための三つの目盛り</h2></div><span>比較方法</span></div>
        <div><article><span>01</span><h3>全盛期の高さ</h3><p>最高Glicko-2と最高相撲偏差値。到達点の高さを二つの尺度で見ます。</p></article><article><span>02</span><h3>頂点の持続</h3><p>上位6場所の平均と幕内在位場所数で、強さを保った時間を見ます。</p></article><article><span>03</span><h3>時代内の支配</h3><p>体格や技術を直接補正せず、同じ場所の幕内平均との差から傑出度を見ます。</p></article></div>
        <p>全盛期勝率は最高Glicko-2同士を置いた実験値です。時代を越えた実際の勝敗を保証する数字ではありません。</p>
      </section>

      <footer><div className="footer-brand"><div><strong>土俵日和</strong><small>時代を越えて、相撲を語る。</small></div></div><p>相撲を愛する人のための非公式ファンサイト</p><Link href="/rate/era">歴代指数へ戻る →</Link></footer>
    </main>
  );
}
