import Link from "next/link";

type SiteArea = "home" | "rate" | "compare" | "yokozuna";

const links = [
  { id: "home", href: "/", label: "今日の取組" },
  { id: "rate", href: "/rate", label: "力士レート" },
] as const;

export default function SiteHeader({ active = "home" }: { active?: SiteArea }) {
  const navLink = (link: (typeof links)[number]) => (
    <Link
      key={link.id}
      href={link.href}
      className={active === link.id ? "is-current" : undefined}
      aria-current={active === link.id ? "page" : undefined}
    >
      {link.label}
    </Link>
  );

  return (
    <header className="site-header">
      <nav className="nav-shell" aria-label="メインナビゲーション">
        <div className="nav-group nav-left">{links.map(navLink)}</div>

        <Link className="brand" href="/" aria-label="土俵日和 ホーム">
          <span className="brand-crest" aria-hidden="true">土</span>
          <span className="brand-title">土俵日和</span>
          <span className="brand-roman">DOHYO BIYORI</span>
        </Link>

        <div className="nav-group nav-right" aria-hidden="true" />

        <details className="mobile-menu">
          <summary aria-label="メニューを開く">目次</summary>
          <div className="mobile-menu-panel">{links.map(navLink)}</div>
        </details>
      </nav>
    </header>
  );
}
