import type { Metadata } from "next";
import Link from "next/link";
import evaluation from "../../../data/model-evaluation.json";
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
      <header className="site-header">
        <nav className="nav-shell" aria-label="メインナビゲーション">
          <div className="nav-group nav-left"><Link href="/#torikumi">取組</Link><Link href="/rate">レート</Link><Link className="is-current" href="/rate/validation">検証</Link></div>
          <Link className="brand" href="/" aria-label="土俵日和 ホーム"><span className="brand-crest" aria-hidden="true">土</span><span className="brand-title">土俵日和</span><span className="brand-roman">DOHYO BIYORI</span></Link>
          <div className="nav-group nav-right"><Link href="/rate/era">歴代比較</Link></div>
        </nav>
      </header>

      <RateLabNav active="validation" />

      <section className="lab-hero">
        <div><p>DOHYO FORECAST SCORECARD</p><h1>予想は、<br />当てた後までが予想。</h1><p>未来を知ってから過去の予想を作り直さない。1958〜2019年で調整し、2020年以降の{evaluation.scope.holdoutBouts.toLocaleString()}番を未学習のまま採点しました。</p></div>
        <div className="lab-hero-score"><small>BEST HOLDOUT LOG LOSS</small><strong>{evaluation.overall.holdout.dohyoV3.logLoss.toFixed(4)}</strong><span>v3実験／正式表示はv2.1</span></div>
      </section>

      <section className="rate-shell validation-shell" aria-labelledby="validation-title">
        <div className="rate-section-heading"><div><p>OUT-OF-SAMPLE TEST</p><h2 id="validation-title">{evaluation.scope.holdout}年、未学習期間の成績。</h2></div><span>{evaluation.scope.holdoutBouts.toLocaleString()}番</span></div>
        <p className="validation-intro">的中率だけなら、50.1%予想も99%予想も同じ一勝です。そこで確率の誠実さを見るBrierスコアとlog loss、予想帯と実勝率のずれも並べます。</p>
        <ValidationBoard evaluation={evaluation} />
      </section>

      <section className="rate-shell validation-policy">
        <p>PUBLIC MODEL POLICY</p><h2>改善しなかった特徴は、足さない。</h2>
        <div><article><span>01</span><h3>時系列で分割</h3><p>未来の勝敗を過去のレートや相性へ混ぜません。</p></article><article><span>02</span><h3>確率で採点</h3><p>当否だけでなく、自信過剰もlog lossで罰します。</p></article><article><span>03</span><h3>実験表示を分離</h3><p>v3が僅かに改善しても、データ時点が弱い間は正式採用しません。</p></article></div>
      </section>

      <footer><div className="footer-brand"><span className="brand-crest" aria-hidden="true">土</span><div><strong>土俵日和</strong><small>数字も、答え合わせする。</small></div></div><p>相撲を愛する人のための非公式ファンサイト</p><Link href="/rate">レート研究室へ戻る →</Link></footer>
    </main>
  );
}
