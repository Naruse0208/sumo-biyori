import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";
import RateLabNav from "../rate-lab-nav";
import ComparisonBoard from "../compare/comparison-board";
import { getRequestLocale } from "../../lib/i18n-server";

export const metadata: Metadata = {
  title: "歴代横綱・全盛期比較｜相撲日和",
  description: "1958年以降の歴代横綱を、最高Glicko-2・最高相撲偏差値・持続力・全盛期曲線で詳細比較します。",
};

export default async function YokozunaPage() {
  const locale = await getRequestLocale();
  const t = (ja: string, en: string) => locale === "en" ? en : ja;
  return (
    <main className="rate-page lab-subpage compare-page yokozuna-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>{t("相撲日和 歴代横綱比較室", "Sumo Biyori Yokozuna Lab")}</strong><span>{t("頂点の高さと、頂点にいた長さを比べる", "Compare peak height and longevity")}</span></div>
      <SiteHeader active="rate" />

      <RateLabNav active="yokozuna" />

      <div className="compare-shell">
        <ComparisonBoard
          variant="yokozuna"
          initialLeft={{ id: 3081, name: "白鵬", shikonaEn: "Hakuho" }}
          initialRight={{ id: 1511, name: "大鵬幸喜", shikonaEn: "Taiho" }}
          locale={locale}
        />
      </div>

      <section className="rate-shell yokozuna-method">
        <div className="rate-section-heading"><div><p>READ WITH CARE</p><h2>{t("「最強」を断定しないための三つの目盛り", "Three measures—not one final verdict")}</h2></div><span>{t("比較方法", "Method")}</span></div>
        <div><article><span>01</span><h3>{t("全盛期の高さ", "Peak height")}</h3><p>{t("最高Glicko-2と最高相撲偏差値。到達点の高さを二つの尺度で見ます。", "Peak Glicko-2 and peak Sumo Score show two views of the highest level reached.")}</p></article><article><span>02</span><h3>{t("頂点の持続", "Peak longevity")}</h3><p>{t("上位6場所の平均と幕内在位場所数で、強さを保った時間を見ます。", "The best-six average and top-division tenure show how long elite form lasted.")}</p></article><article><span>03</span><h3>{t("時代内の支配", "Era dominance")}</h3><p>{t("体格や技術を直接補正せず、同じ場所の幕内平均との差から傑出度を見ます。", "Dominance is measured against top-division peers in the same tournament, without claiming a complete physique or technique adjustment.")}</p></article></div>
        <p>{t("全盛期勝率は最高Glicko-2同士を置いた実験値です。時代を越えた実際の勝敗を保証する数字ではありません。", "Peak win probability is an experiment using each wrestler's peak Glicko-2. It does not guarantee an actual result across eras.")}</p>
      </section>

      <footer><div className="footer-brand"><div><strong>{t("相撲日和", "SUMO BIYORI")}</strong><small>{t("時代を越えて、相撲を語る。", "Talk sumo across the ages.")}</small></div></div><p>{t("相撲を愛する人のための非公式ファンサイト", "An unofficial fan site for sumo lovers")}</p><Link href="/rate/era">{t("歴代指数へ戻る →", "Back to Era Index →")}</Link></footer>
    </main>
  );
}
