import RikishiProfile from "./rikishi-profile";
import { getRequestLocale } from "../../lib/i18n-server";
import SiteHeader from "../../components/SiteHeader";

export default async function RikishiPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const locale = await getRequestLocale();
  return (
    <main className="rikishi-page">
      <div className="rate-frame" aria-hidden="true" />
      <div className="notice-bar rate-notice"><strong>{locale === "en" ? "Wrestler Rating Profile" : "力士レート名鑑"}</strong><span>ELO HISTORY</span></div>
      <SiteHeader active="rate" />
      <RikishiProfile rikishiRef={ref} locale={locale} />
    </main>
  );
}
