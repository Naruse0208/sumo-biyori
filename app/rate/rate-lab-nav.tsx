import Link from "next/link";

type RateLabPage = "ranking" | "compare" | "validation" | "era" | "yokozuna";

const destinations = [
  {
    id: "ranking" as const,
    href: "/rate",
    number: "01",
    title: "力士レート順位",
    shortTitle: "レート順位",
    description: "Elo・地力・相撲偏差値",
  },
  {
    id: "compare" as const,
    href: "/rate/compare",
    number: "02",
    title: "推し力士・対戦比較",
    shortTitle: "対戦比較",
    description: "二人の強さと勝ち筋を並べる",
  },
  {
    id: "validation" as const,
    href: "/rate/validation",
    number: "03",
    title: "予測成績・検証",
    shortTitle: "予測検証",
    description: "モデルを未学習期間で答え合わせ",
  },
  {
    id: "era" as const,
    href: "/rate/era",
    number: "04",
    title: "歴代力士・時代比較",
    shortTitle: "歴代比較",
    description: "同時代での傑出度を比較",
  },
  {
    id: "yokozuna" as const,
    href: "/rate/yokozuna",
    number: "05",
    title: "歴代横綱・全盛期比較",
    shortTitle: "横綱比較",
    description: "頂点の高さと持続を比較",
  },
];

export default function RateLabNav({ active }: { active: RateLabPage }) {
  return (
    <div className="rate-lab-nav-wrap">
      <nav className="rate-lab-nav" aria-label="レーティング研究室のページ">
        {destinations.map((destination) => {
          const isActive = destination.id === active;
          return (
            <Link
              key={destination.id}
              href={destination.href}
              className={isActive ? "is-active" : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="rate-lab-nav-number">{destination.number}</span>
              <span className="rate-lab-nav-copy">
                <strong><span className="rate-lab-title-wide">{destination.title}</span><span className="rate-lab-title-short">{destination.shortTitle}</span></strong>
                <small>{destination.description}</small>
              </span>
              <span className="rate-lab-nav-arrow" aria-hidden="true">→</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
