import type { Metadata } from "next";
import Link from "next/link";
import evaluation from "../../../data/model-evaluation.json";
import SiteHeader from "../../components/SiteHeader";
import RateLabNav from "../rate-lab-nav";
import ValidationBoard from "./validation-board";

export const metadata: Metadata = {
  title: "予測成績・モデル検証｜土俵日和",
  description: "2020年以降の未学習データでElo、Glicko-2、土俵日和予測を比較。的中率、Brier、log loss、較正を公開します。",
  openGraph: {
    title: "予測成績・モデル検証｜土俵日和",
    description: "Elo、Glicko-2、土俵日和予測を未学習期間で答え合わせ。",
    images: ["/og-model-lab.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "予測成績・モデル検証｜土俵日和",
    description: "予想は、答え合わせまで公開する。",
    images: ["/og-model-lab.png"],
  },
};

export default function ValidationPage() {
  return (
    <main className="rate-page lab-subpage">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>土俵日和 モデル検証場</strong><span>予想は、答え合わせまで公開する</span></div>
      <SiteHeader active="rate" />

      <RateLabNav active="validation" />

      <section className="rate-shell validation-shell" aria-labelledby="validation-title">
        <div className="rate-section-heading"><div><p>OUT-OF-SAMPLE TEST</p><h2 id="validation-title">{evaluation.scope.holdout}年、未学習期間の成績。</h2></div><span>{evaluation.scope.holdoutBouts.toLocaleString()}番</span></div>
        <p className="validation-intro">的中率だけなら、50.1%予想も99%予想も同じ一勝です。そこで確率の誠実さを見るBrierスコアとlog loss、予想帯と実勝率のずれも並べます。</p>
        <ValidationBoard evaluation={evaluation} />
      </section>

      <section className="rate-shell validation-policy">
        <p>PUBLIC MODEL POLICY</p><h2>改善しなかった特徴は、足さない。</h2>
        <div><article><span>01</span><h3>時系列で分割</h3><p>未来の勝敗を過去のレートや相性へ混ぜません。</p></article><article><span>02</span><h3>確率で採点</h3><p>当否だけでなく、自信過剰もlog lossで罰します。</p></article><article><span>03</span><h3>実験表示を分離</h3><p>v3が僅かに改善しても、データ時点が弱い間は正式採用しません。</p></article></div>
      </section>

      <footer><div className="footer-brand"><div><strong>土俵日和</strong><small>数字も、答え合わせする。</small></div></div><p>相撲を愛する人のための非公式ファンサイト</p><Link href="/rate">レート研究室へ戻る →</Link></footer>
    </main>
  );
}
