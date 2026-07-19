import type { Metadata } from "next";
import Link from "next/link";
import era from "../../../data/era-rankings.json";
import SiteHeader from "../../components/SiteHeader";
import RateLabNav from "../rate-lab-nav";
import { getRequestLocale } from "../../lib/i18n-server";
import { englishBashoLabel, type Locale } from "../../lib/i18n";

export const metadata: Metadata = {
  title: "歴代力士・時代補正ランキング｜相撲日和",
  description: "1958年以降の幕内力士を、最高相撲偏差値と上位6場所平均から比較する歴代指数の実験版。",
};

function bashoLabel(bashoId: number, locale: Locale) {
  if (locale === "en") return englishBashoLabel(bashoId).replace(" Tournament", "");
  const year = Math.floor(bashoId / 100);
  const month = bashoId % 100;
  return `${year}年${month}月`;
}

export default async function EraPage() {
  const locale = await getRequestLocale();
  const t = (ja: string, en: string) => locale === "en" ? en : ja;
  const leaders = era.ranking.slice(0, 3);
  return (
    <main className="rate-page lab-subpage era-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>{t("相撲日和 歴代比較室", "Sumo Biyori Across Eras")}</strong><span>{t("強さではなく、その時代をどれほど支配したか", "How far each wrestler stood above his own era")}</span></div>
      <SiteHeader active="rate" />

      <RateLabNav active="era" />

      <section className="rate-shell era-shell" aria-labelledby="era-title">
        <div className="rate-section-heading"><div><p>ERA DOMINANCE INDEX</p><h2 id="era-title">{t("歴代指数・実験ランキング", "Era Index · Experimental Ranking")}</h2></div></div>
        <div className="era-podium">
          {leaders.map((rikishi) => (
            <article key={rikishi.id}><span>{locale === "en" ? `No. ${rikishi.position}` : `第${rikishi.position}位`}</span><Link href={`/rikishi/${rikishi.id}`}>{rikishi.name}</Link><strong>{rikishi.eraIndex}</strong><dl><div><dt>{t("最高偏差値", "Peak score")}</dt><dd>{rikishi.peakHensachi}</dd></div><div><dt>{t("上位6場所", "Best six")}</dt><dd>{rikishi.sustainedHensachi}</dd></div></dl><small>{t("頂点", "Peak")} {bashoLabel(rikishi.peakBasho, locale)}</small></article>
          ))}
        </div>

        <div className="era-formula"><span>{t("歴代指数", "Era Index")}</span><b>=</b><span>{t("最高相撲偏差値 × 40%", "Peak Sumo Score × 40%")}</span><b>+</b><span>{t("上位6場所平均 × 60%", "Best-six average × 60%")}</span></div>

        <div className="era-table-wrap">
          <table>
            <thead><tr><th>{t("順位", "Rank")}</th><th>{t("力士", "Wrestler")}</th><th>{t("歴代指数", "Era Index")}</th><th>{t("最高偏差値", "Peak score")}</th><th>{t("上位6場所", "Best six")}</th><th>{t("幕内場所", "Top-division tournaments")}</th><th>{t("頂点", "Peak")}</th></tr></thead>
            <tbody>{era.ranking.map((rikishi) => (
              <tr key={rikishi.id}><td>{rikishi.position}</td><th><Link href={`/rikishi/${rikishi.id}`}>{rikishi.name}</Link><small>{bashoLabel(rikishi.firstBasho, locale)}–{bashoLabel(rikishi.lastBasho, locale)}</small></th><td><strong>{rikishi.eraIndex}</strong></td><td>{rikishi.peakHensachi}</td><td>{rikishi.sustainedHensachi}</td><td>{rikishi.makuuchiBasho}</td><td>{bashoLabel(rikishi.peakBasho, locale)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="rate-shell era-reading">
        <div className="rate-section-heading"><div><h2>{t("これは「もし戦ったら」の勝率ではない。", "This is not a cross-era win probability.")}</h2></div></div>
        <div><article><span>{t("見るもの", "Measures")}</span><h3>{t("同時代での支配度", "Dominance within an era")}</h3><p>{t("その場所の幕内平均から、どれほど抜けていたかを比較します。", "It compares how far each wrestler stood above the top-division average in the same tournament.")}</p></article><article><span>{t("見ないもの", "Does not measure")}</span><h3>{t("体格・技術の年代進化", "Changes in physique and technique")}</h3><p>{t("白鵬と昭和の横綱を直接戦わせる勝率ではありません。", "It is not a literal win probability between Hakuho and a Showa-era yokozuna.")}</p></article><article><span>{t("次の研究", "Next research")}</span><h3>{t("世代間の橋と推定幅", "Bridges and uncertainty across generations")}</h3><p>{t("現役期間が重なる力士を橋にした全履歴モデルを別枠で検証します。", "A separate full-history model will use overlapping careers as bridges between generations.")}</p></article></div>
        <aside><strong>{t("現在の限界", "Current limitations")}</strong><p>{locale === "en" ? "This experimental index compares dominance within each era. It excludes results before 1958, and the first years are affected by a cold start because every wrestler begins from the same initial rating." : `${era.caveat} 1958年以前の実績は含まず、収録開始直後は全力士を同じ初期値から計算するため、初期数年間の値にはコールドスタートの影響があります。`}</p></aside>
      </section>

      <footer><div className="footer-brand"><div><strong>{t("相撲日和", "SUMO BIYORI")}</strong><small>{t("時代を越えて、相撲を語る。", "Talk sumo across the ages.")}</small></div></div><p>{t("相撲を愛する人のための非公式ファンサイト", "An unofficial fan site for sumo lovers")}</p><Link href="/rate">{t("レート研究室へ戻る →", "Back to Rating Lab →")}</Link></footer>
    </main>
  );
}
