import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { wrestlers } from "../../../db/schema";
import SiteHeader from "../../components/SiteHeader";
import { japaneseRikishiName } from "../../lib/rikishi-names";
import RateLabNav from "../rate-lab-nav";
import ComparisonBoard from "./comparison-board";

export const metadata: Metadata = {
  title: "推し力士・対戦比較｜土俵日和",
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
      <div className="notice-bar rate-notice"><strong>土俵日和 対戦比較室</strong><span>二人を選んで、強さの理由まで比べる</span></div>
      <SiteHeader active="rate" />

      <RateLabNav active="compare" />

      <div className="compare-shell">
        <ComparisonBoard
          variant="rikishi"
          initialLeft={initialLeft}
          initialRight={initialRight}
        />
      </div>

      <footer><div className="footer-brand"><div><strong>土俵日和</strong><small>推しを、数字でも深く知る。</small></div></div><p>相撲を愛する人のための非公式ファンサイト</p><Link href="/rate">レート研究室へ戻る →</Link></footer>
    </main>
  );
}
