import type { Metadata } from "next";
import Link from "next/link";
import RateLabNav from "../rate-lab-nav";
import ComparisonBoard from "../compare/comparison-board";

export const metadata: Metadata = {
  title: "歴代横綱・全盛期比較｜土俵日和",
  description: "1958年以降の歴代横綱を、最高地力・最高相撲偏差値・持続力・全盛期曲線で詳細比較します。",
};

export default function YokozunaPage() {
  return (
    <main className="rate-page lab-subpage compare-page yokozuna-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>土俵日和 歴代横綱比較室</strong><span>頂点の高さと、頂点にいた長さを比べる</span></div>
      <header className="site-header"><nav className="nav-shell" aria-label="メインナビゲーション"><div className="nav-group nav-left"><Link href="/#torikumi">取組</Link><Link href="/rate">レート</Link><Link href="/rate/era">歴代指数</Link></div><Link className="brand" href="/" aria-label="土俵日和 ホーム"><span className="brand-crest" aria-hidden="true">土</span><span className="brand-title">土俵日和</span><span className="brand-roman">DOHYO BIYORI</span></Link><div className="nav-group nav-right"><Link className="is-current" href="/rate/yokozuna">歴代横綱</Link></div></nav></header>

      <RateLabNav active="yokozuna" />

      <section className="lab-hero compare-hero yokozuna-hero">
        <div><p>YOKOZUNA / PEAK &amp; LEGACY</p><h1>横綱の全盛期を、<br />曲線で読む。</h1><p>白鵬の持続力、大鵬の時代支配、千代の富士のピーク。最高値だけで終わらず、幕内在位・上位6場所・年齢を重ねた推移から横綱の強さの形を比べます。</p></div>
        <div className="lab-hero-score"><small>歴代比較の起点</small><strong>1958</strong><span>取組収録開始以降</span></div>
      </section>

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

      <footer><div className="footer-brand"><span className="brand-crest" aria-hidden="true">土</span><div><strong>土俵日和</strong><small>時代を越えて、相撲を語る。</small></div></div><p>相撲を愛する人のための非公式ファンサイト</p><Link href="/rate/era">歴代指数へ戻る →</Link></footer>
    </main>
  );
}
