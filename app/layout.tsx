import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { getRequestLocale } from "./lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const english = locale === "en";
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined;

  return {
    metadataBase,
    title: english ? "Sumo Biyori | Grand Sumo, Closer" : "相撲日和｜相撲を、もっと近くに。",
    description: english ? "Live grand sumo bouts, ratings, wrestler profiles and historical comparisons." : "今日の取組・番付・力士レート・歴代比較を楽しむ非公式相撲ファンサイト。",
    openGraph: {
      title: english ? "Sumo Biyori" : "相撲日和",
      description: english ? "Follow grand sumo live and explore ratings across eras." : "今日の取組から歴代比較まで、相撲をもっと深く楽しむファンサイト。",
      type: "website",
      locale: english ? "en_US" : "ja_JP",
      url: metadataBase?.toString(),
      images: [
        { url: "/og.png", width: 1731, height: 909, alt: english ? "Sumo Biyori" : "相撲日和" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: english ? "Sumo Biyori" : "相撲日和",
      description: english ? "Follow grand sumo live and explore ratings across eras." : "今日の取組から歴代比較まで、相撲をもっと深く楽しむファンサイト。",
      images: ["/og.png"],
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} data-locale={locale}>
      <body>{children}</body>
    </html>
  );
}
