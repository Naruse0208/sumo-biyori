import Link from "next/link";

type RateLabPage = "ranking" | "compare" | "validation" | "era" | "yokozuna";

const destinations = [
  {
    id: "ranking" as const,
    href: "/rate",
    title: "力士レート順位",
    description: "Elo・Glicko-2・相撲偏差値",
  },
  {
    id: "compare" as const,
    href: "/rate/compare",
    title: "推し力士・対戦比較",
    description: "二人の強さと勝ち筋を並べる",
  },
  {
    id: "validation" as const,
    href: "/rate/validation",
    title: "予測成績・検証",
    description: "モデルを未学習期間で答え合わせ",
  },
  {
    id: "era" as const,
    href: "/rate/era",
    title: "歴代力士・時代比較",
    description: "同時代での傑出度を比較",
  },
  {
    id: "yokozuna" as const,
    href: "/rate/yokozuna",
    title: "歴代横綱・全盛期比較",
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
              <span className="rate-lab-nav-copy">
                <strong>{destination.title}</strong>
                <small>{destination.description}</small>
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
