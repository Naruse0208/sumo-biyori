import RikishiProfile from "./rikishi-profile";
import { getRequestLocale } from "../../lib/i18n-server";

export default async function RikishiPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const locale = await getRequestLocale();
  return <RikishiProfile rikishiRef={ref} locale={locale} />;
}
