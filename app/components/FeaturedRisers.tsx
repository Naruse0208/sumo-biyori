import featured from "../../data/featured-risers.json";

const rankLabels: Record<string, string> = {
  Yokozuna: "横綱",
  Ozeki: "大関",
  Sekiwake: "関脇",
  Komusubi: "小結",
  Maegashira: "前頭",
  Juryo: "十両",
  Makushita: "幕下",
};

const kanjiDigits = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function toKanjiNumber(value: number) {
  if (value < 10) return kanjiDigits[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens > 1 ? kanjiDigits[tens] : ""}十${ones ? kanjiDigits[ones] : ""}`;
}

function displayRank(rank: string, division: number) {
  const match = rank.match(/^(\w+)(?: (\d+))? (East|West)$/);
  if (!match) return ["幕内", "十両", "幕下"][division - 1] ?? rank;
  const [, rankName, number, side] = match;
  return `${side === "East" ? "東" : "西"}${rankLabels[rankName] ?? rankName}${number ? `${toKanjiNumber(Number(number))}枚目` : ""}`;
}

export default function FeaturedRisers() {
  return (
    <article className="feature-card rikishi-card riser-card" id="rikishi">
      <div className="section-heading">
        <h2>今場所注目の力士</h2>
      </div>

      <div className="riser-summary">
        <p>幕内・十両・幕下から、前場所よりレート(GLICKO-2)を伸ばした五人。</p>
      </div>

      <ul className="riser-list">
        {featured.rows.map((rikishi) => (
          <li key={rikishi.id}>
            <small className="riser-rank">{displayRank(rikishi.rank, rikishi.division)}</small>
            <a className="riser-name" href={rikishi.profileUrl}>{rikishi.name}</a>
            <strong className="riser-current">{rikishi.rating}<span>(+{rikishi.delta})</span></strong>
          </li>
        ))}
      </ul>

      <p className="riser-note">前場所と今場所の両方に記録がある力士を対象に算出</p>
    </article>
  );
}
