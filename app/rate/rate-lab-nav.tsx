import Link from "next/link";

type RateLabPage = "ranking" | "validation" | "era";

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
    id: "validation" as const,
    href: "/rate/validation",
    number: "02",
    title: "予測成績・検証",
    shortTitle: "予測検証",
    description: "モデルを未学習期間で答え合わせ",
  },
  {
    id: "era" as const,
    href: "/rate/era",
    number: "03",
    title: "歴代力士・時代比較",
    shortTitle: "歴代比較",
    description: "同時代での傑出度を比較",
  },
];

export default function RateLabNav({ active }: { active: RateLabPage }) {
  return (
    <div className="rate-lab-nav-wrap">
      <nav className="rate-lab-nav" aria-label="レーティング研究室のページ">
        <div className="rate-lab-nav-intro" aria-hidden="true">
          <small>RATING LAB</small>
          <strong>三つの入口</strong>
          <span>知りたい数字を選ぶ</span>
        </div>
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
