import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { wrestlers } from "../../../db/schema";
import SiteHeader from "../../components/SiteHeader";
import { japaneseRikishiName } from "../../lib/rikishi-names";
import { getRequestLocale } from "../../lib/i18n-server";
import RateLabNav from "../rate-lab-nav";
import ComparisonBoard from "./comparison-board";

export const metadata: Metadata = {
  title: "推し力士・対戦比較｜相撲日和",
  description: "二人の力士を選び、Elo・Glicko-2・相撲偏差値・直接対戦・決まり手・全盛期を比較します。",
};

type CompareQuery = Record<string, string | string[] | undefined>;
type CompareOption = { id: number; name: string; shikonaEn: string };

const defaultLeft: CompareOption = { id: 8850, name: "大の里", shikonaEn: "Onosato" };
const defaultRight: CompareOption = { id: 19, name: "豊昇龍", shikonaEn: "Hoshoryu" };

function queryNumber(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function optionFromNskId(nskId: number | null): Promise<CompareOption | null> {
  if (!nskId) return null;
  const wrestler = await getDb()
    .select({
      id: wrestlers.id,
      shikonaJp: wrestlers.shikonaJp,
      shikonaEn: wrestlers.shikonaEn,
    })
    .from(wrestlers)
    .where(eq(wrestlers.nskId, nskId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  return wrestler ? {
    id: wrestler.id,
    name: japaneseRikishiName(wrestler.id, wrestler.shikonaJp) ?? wrestler.shikonaEn,
    shikonaEn: wrestler.shikonaEn,
  } : null;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<CompareQuery> }) {
  const locale = await getRequestLocale();
  const t = (ja: string, en: string) => locale === "en" ? en : ja;
  const query = await searchParams;
  let initialLeft = defaultLeft;
  let initialRight = defaultRight;
  try {
    const [leftFromBout, rightFromBout] = await Promise.all([
      optionFromNskId(queryNumber(query.leftNsk)),
      optionFromNskId(queryNumber(query.rightNsk)),
    ]);
    if (leftFromBout) initialLeft = leftFromBout;
    if (rightFromBout && rightFromBout.id !== initialLeft.id) initialRight = rightFromBout;
  } catch {
    // DBが一時的に読めない場合は既定の比較を表示します。
  }

  return (
    <main className="rate-page lab-subpage compare-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>{t("相撲日和 対戦比較室", "Sumo Biyori Matchup Lab")}</strong><span>{t("二人を選んで、強さの理由まで比べる", "Compare two wrestlers—and why the numbers differ")}</span></div>
      <SiteHeader active="rate" />

      <RateLabNav active="compare" />

      <div className="compare-shell">
        <ComparisonBoard
          variant="rikishi"
          initialLeft={initialLeft}
          initialRight={initialRight}
          locale={locale}
        />
      </div>

      <footer><div className="footer-brand"><div><strong>{t("相撲日和", "SUMO BIYORI")}</strong><small>{t("推しを、数字でも深く知る。", "Know your favorites through the numbers.")}</small></div></div><p>{t("相撲を愛する人のための非公式ファンサイト", "An unofficial fan site for sumo lovers")}</p><Link href="/rate">{t("レート研究室へ戻る →", "Back to Rating Lab →")}</Link></footer>
    </main>
  );
}
