import Link from "next/link";
import Bilingual from "./Bilingual";
import LanguageToggle from "./LanguageToggle";
import { getRequestLocale } from "../lib/i18n-server";

type SiteArea = "home" | "rate" | "compare" | "yokozuna";

const links = [
  { id: "home", href: "/", ja: "今日の取組", en: "Today's Bouts" },
  { id: "rate", href: "/rate", ja: "力士レート", en: "Ratings" },
] as const;

export default async function SiteHeader({ active = "home" }: { active?: SiteArea }) {
  const locale = await getRequestLocale();
  const navLink = (link: (typeof links)[number]) => (
    <Link
      key={link.id}
      href={link.href}
      className={active === link.id ? "is-current" : undefined}
      aria-current={active === link.id ? "page" : undefined}
    >
      <Bilingual ja={link.ja} en={link.en} />
    </Link>
  );

  return (
    <header className="site-header">
      <nav className="nav-shell" aria-label={locale === "en" ? "Main navigation" : "メインナビゲーション"}>
        <div className="nav-group nav-left">{links.map(navLink)}</div>

        <Link className="brand" href="/" aria-label={locale === "en" ? "Sumo Biyori home" : "相撲日和 ホーム"}>
          <span className="brand-title">相撲日和</span>
          <span className="brand-roman">SUMO BIYORI</span>
        </Link>

        <div className="nav-group nav-right"><LanguageToggle locale={locale} /></div>
      </nav>
    </header>
  );
}
