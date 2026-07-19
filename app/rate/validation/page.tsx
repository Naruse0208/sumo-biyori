import type { Metadata } from "next";
import Link from "next/link";
import evaluation from "../../../data/model-evaluation.json";
import SiteHeader from "../../components/SiteHeader";
import RateLabNav from "../rate-lab-nav";
import ValidationBoard from "./validation-board";
import { getRequestLocale } from "../../lib/i18n-server";

export const metadata: Metadata = {
  title: "予測成績・モデル検証｜相撲日和",
  description: "2020年以降の未学習データでElo、Glicko-2、相撲日和予測を比較。的中率、Brier、log loss、較正を公開します。",
  openGraph: {
    title: "予測成績・モデル検証｜相撲日和",
    description: "Elo、Glicko-2、相撲日和予測を未学習期間で答え合わせ。",
    images: ["/og-model-lab.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "予測成績・モデル検証｜相撲日和",
    description: "予想は、答え合わせまで公開する。",
    images: ["/og-model-lab.png"],
  },
};

export default async function ValidationPage() {
  const locale = await getRequestLocale();
  const t = (ja: string, en: string) => locale === "en" ? en : ja;
  return (
    <main className="rate-page lab-subpage">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>{t("相撲日和 モデル検証場", "Sumo Biyori Model Lab")}</strong><span>{t("予想は、答え合わせまで公開する", "Forecasts include the answer key")}</span></div>
      <SiteHeader active="rate" />

      <RateLabNav active="validation" />

      <section className="rate-shell validation-shell" aria-labelledby="validation-title">
        <div className="rate-section-heading"><div><p>OUT-OF-SAMPLE TEST</p><h2 id="validation-title">{locale === "en" ? `${evaluation.scope.holdout}: results on unseen data.` : `${evaluation.scope.holdout}年、未学習期間の成績。`}</h2></div><span>{evaluation.scope.holdoutBouts.toLocaleString()}{t("番", " bouts")}</span></div>
        <p className="validation-intro">{t("的中率だけなら、50.1%予想も99%予想も同じ一勝です。そこで確率の誠実さを見るBrierスコアとlog loss、予想帯と実勝率のずれも並べます。", "Accuracy alone treats a 50.1% forecast and a 99% forecast as the same win. We also publish Brier score, log loss, and calibration to measure how honest the probabilities are.")}</p>
        <ValidationBoard evaluation={evaluation} locale={locale} />
      </section>

      <section className="rate-shell validation-policy">
        <p>PUBLIC MODEL POLICY</p><h2>{t("改善しなかった特徴は、足さない。", "If a feature does not improve validation, it stays out.")}</h2>
        <div><article><span>01</span><h3>{t("時系列で分割", "Split by time")}</h3><p>{t("未来の勝敗を過去のレートや相性へ混ぜません。", "Future outcomes never leak into past ratings or matchup features.")}</p></article><article><span>02</span><h3>{t("確率で採点", "Score probabilities")}</h3><p>{t("当否だけでなく、自信過剰もlog lossで罰します。", "Log loss penalizes overconfidence, not just wrong picks.")}</p></article><article><span>03</span><h3>{t("実験表示を分離", "Separate experiments")}</h3><p>{t("v3が僅かに改善しても、データ時点が弱い間は正式採用しません。", "Even a slight v3 improvement stays experimental until its data timing is reliable.")}</p></article></div>
      </section>

      <footer><div className="footer-brand"><div><strong>{t("相撲日和", "SUMO BIYORI")}</strong><small>{t("数字も、答え合わせする。", "Every number gets checked.")}</small></div></div><p>{t("相撲を愛する人のための非公式ファンサイト", "An unofficial fan site for sumo lovers")}</p><Link href="/rate">{t("レート研究室へ戻る →", "Back to Rating Lab →")}</Link></footer>
    </main>
  );
}
