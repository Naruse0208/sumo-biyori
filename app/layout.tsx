import type { Metadata } from "next";
import { headers } from "next/headers";
import MobileQuickNav from "./components/MobileQuickNav";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined;

  return {
    metadataBase,
    title: "土俵日和｜相撲を、もっと近くに。",
    description: "注目取組、番付、力士、相撲文化を重厚な和の世界観で楽しむ非公式相撲ファンサイト。",
    openGraph: {
      title: "土俵日和",
      description: "土俵に、夏が鳴る。相撲をもっと深く楽しむファンサイト。",
      type: "website",
      locale: "ja_JP",
      url: metadataBase?.toString(),
      images: [
        { url: "/og.png", width: 1731, height: 909, alt: "土俵日和 — 土俵に、夏が鳴る。" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "土俵日和",
      description: "土俵に、夏が鳴る。相撲をもっと深く楽しむファンサイト。",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}<MobileQuickNav /></body>
    </html>
  );
}
