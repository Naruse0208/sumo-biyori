import Link from "next/link";

type RateLabPage = "ranking" | "compare" | "validation" | "era" | "yokozuna";

const destinations = [
  {
    id: "ranking" as const,
    href: "/rate",
    title: "力士レート順位",
  },
  {
    id: "compare" as const,
    href: "/rate/compare",
    title: "力士対戦比較",
  },
  {
    id: "validation" as const,
    href: "/rate/validation",
    title: "予測成績",
  },
  {
    id: "era" as const,
    href: "/rate/era",
    title: "歴代力士比較",
  },
  {
    id: "yokozuna" as const,
    href: "/rate/yokozuna",
    title: "歴代横綱比較",
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
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
