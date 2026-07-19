import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ratings from "../../data/ratings-latest.json";
import SiteHeader from "../components/SiteHeader";
import { japaneseRikishiName, officialRikishiProfile, rikishiProfilePath } from "../lib/rikishi-names";
import { getRequestLocale } from "../lib/i18n-server";
import RatingBoard from "./rating-board";
import RateLabNav from "./rate-lab-nav";

export const metadata: Metadata = {
  title: "力士レーティング研究室｜相撲日和",
  description: "1958年以降・全六段の取組から再計算したElo、Glicko-2、相撲偏差値と相撲日和予測。",
  openGraph: {
    title: "力士レーティング研究室｜相撲日和",
    description: "Elo・Glicko-2・相撲偏差値で、力士の強さと一番の勝機を読み解く。",
    images: [
      {
        url: "/og-rating.png",
        width: 1731,
        height: 909,
        alt: "相撲日和 力士レーティング研究室",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "力士レーティング研究室｜相撲日和",
    description: "Elo・Glicko-2・相撲偏差値で、力士の強さと一番の勝機を読み解く。",
    images: ["/og-rating.png"],
  },
};

const methodRoles = [
  { number: "01", name: "Elo", nameEn: "Elo", english: "BASELINE", status: "公開中", statusEn: "LIVE", copy: "一番ごとの勝敗と相手の強さから更新する、説明しやすい基準線。", copyEn: "A clear baseline updated after each bout using the result and opponent strength." },
  { number: "02", name: "Glicko-2", nameEn: "Glicko-2", english: "CURRENT RATING", status: "公開中", statusEn: "LIVE", copy: "現在の強さに、どれほど確かな推定かを示すRDを添えた値。", copyEn: "Current strength paired with an RD that shows how certain the estimate is." },
  { number: "03", name: "勝機", nameEn: "Forecast", english: "MATCH FORECAST", status: "検証公開", statusEn: "VALIDATED", copy: "Glicko-2のレート差と、強く縮めた直接対戦相性から出す一番ごとの予想勝率。", copyEn: "Bout probability from the Glicko-2 gap and strongly shrunk head-to-head residual." },
  { number: "04", name: "相撲偏差値", nameEn: "Sumo Score", english: "ERA SCORE", status: "歴代実験公開", statusEn: "EXPERIMENT", copy: "同じ場所・同じ段の中で、どれほど傑出しているかを50基準で表す。", copyEn: "A 50-based score showing dominance within the same tournament and division." },
];

const initialDivisions = ratings.divisions.map((division) => ({
  ...division,
  ranking: division.ranking.map((rikishi) => ({
    ...rikishi,
    shikonaJp: japaneseRikishiName(rikishi.id, rikishi.shikonaJp),
    profileUrl: rikishiProfilePath(rikishi.id),
    officialProfileUrl: officialRikishiProfile(rikishi.nskId),
  })),
}));

export default async function RatePage() {
  const locale = await getRequestLocale();
  const t = (ja: string, en: string) => locale === "en" ? en : ja;
  return (
    <main className="rate-page">
      <div className="rate-frame" aria-hidden="true" />

      <div className="notice-bar rate-notice">
        <strong>{t("相撲日和 レーティング研究室", "Sumo Biyori Rating Lab")}</strong>
      </div>

      <SiteHeader active="rate" />

      <RateLabNav active="ranking" />

      <section className="rate-shell rate-ranking" aria-labelledby="ranking-title">
        <div className="rate-section-heading">
          <div>
            <h2 id="ranking-title">{t("力士レート順位", "Wrestler Ratings")}</h2>
          </div>
        </div>

        <RatingBoard
          divisions={initialDivisions}
          initialBasho={Number(ratings.scope.latestBasho)}
          locale={locale}
        />
        <div className="rate-ranking-board rate-ranking-method">
          <div className="rate-ranking-note">
            <p><strong>{t("計算範囲", "Coverage")}</strong> {t(`1958年三月場所〜令和八年七月場所・全六段／${ratings.counts.ratedBouts.toLocaleString()}取組・${ratings.counts.wrestlersInScope.toLocaleString()}力士`, `March 1958 through July 2026 · all six divisions · ${ratings.counts.ratedBouts.toLocaleString()} bouts · ${ratings.counts.wrestlersInScope.toLocaleString()} wrestlers`)}</p>
            <p>{t(`基準Elo ${ratings.model.startingElo}・K値 ${ratings.model.kFactor}。Glicko-2は場所単位・初期RD ${ratings.model.glicko2.initialRd}。最新場所は取得済み取組までを反映します。`, `Baseline Elo ${ratings.model.startingElo}, K ${ratings.model.kFactor}. Glicko-2 updates by tournament with initial RD ${ratings.model.glicko2.initialRd}. The latest tournament includes all recorded bouts.`)}</p>
            <a href="https://sumo-api.com/api-guide" target="_blank" rel="noreferrer">{t("取組データ仕様：Sumo API ↗", "Bout data specification: Sumo API ↗")}</a>
          </div>
        </div>
      </section>

      <section className="rate-portal" aria-labelledby="rate-portal-title">
        <div className="rate-portal-copy">
          <p className="rate-kicker">SUMO BIYORI RATING LAB</p>
          <h1 id="rate-portal-title">{t("数字で、相撲を", "Read sumo deeper")}<br />{t("もっと深く。", "through numbers.")}</h1>
          <p className="rate-lead">
            {t("1958年以降の全取組から、いまの強さ、二人の相性、時代の中での傑出度を読み解きます。やりたいことから、入口を選んでください。", "Every recorded bout since 1958 helps us read current strength, head-to-head matchups and dominance within an era. Choose where to begin.")}
          </p>

          <div className="rate-portal-actions" aria-label="レート研究室の主な機能">
            <a href="#ranking-title"><span>01</span><strong>{t("今の順位を見る", "View current ratings")}</strong><small>Elo · Glicko-2 · {t("相撲偏差値", "Sumo Score")}</small></a>
            <Link href="/rate/compare"><span>02</span><strong>{t("二人を比べる", "Compare two wrestlers")}</strong><small>{t("推し・好敵手・勝機", "Favorites · rivals · forecast")}</small></Link>
            <Link href="/rate/yokozuna"><span>03</span><strong>{t("歴代横綱を比べる", "Compare yokozuna")}</strong><small>{t("全盛期・持続・時代指数", "Peak · longevity · era index")}</small></Link>
          </div>

          <div className="rate-portal-research">
            <span>{t("研究データ", "Research")}</span>
            <Link href="/rate/validation">{t("予測成績・モデル検証 →", "Forecast accuracy →")}</Link>
            <Link href="/rate/era">{t("歴代力士・時代比較 →", "Across-era comparison →")}</Link>
          </div>
        </div>

        <figure className="rate-portal-art">
          <Image src="/rating-lab-art.png" alt={t("土俵を挟む二人の力士とレート推移を描いた金箔調の図", "Gold illustration of two sumo wrestlers and a rating curve")} width={1536} height={1024} />
          <figcaption><span>1958—</span> {t("全六段・全取組を時系列で再計算", "All six divisions, recalculated chronologically")}</figcaption>
        </figure>
      </section>

      <section className="rate-shell rate-metrics" id="method" aria-labelledby="metric-title">
        <div className="rate-section-heading">
          <div>
            <p>THE TWO NUMBERS</p>
            <h2 id="metric-title">{t("三つのものさしで、強さを見る。", "Three lenses on strength.")}</h2>
          </div>
          <span>{t("算出設計", "Method")}</span>
        </div>

        <div className="rate-metric-grid">
          <article className="rate-metric-card rate-metric-elo">
            <div className="rate-card-topline"><span>01</span><em>RAW RATING</em></div>
            <h3>Elo</h3>
            <div className="rate-metric-number"><strong>1500</strong><span>{t("基準値", "Baseline")}</span></div>
            <p>{t("勝敗と対戦相手のレート差から、一番ごとに増減する生の強さ。時系列を崩さず、全取組から再計算します。", "A transparent baseline that moves after every bout according to the result and opponent strength.")}</p>
          </article>

          <article className="rate-metric-card rate-metric-glicko">
            <div className="rate-card-topline"><span>02</span><em>CURRENT STRENGTH</em></div>
            <h3>Glicko-2</h3>
            <div className="rate-metric-number"><strong>1500</strong><span>{t("初期値・RD 350", "Initial · RD 350")}</span></div>
            <p>{t("強さと推定の不確かさを別々に持つ。休場中は値を決めつけて下げず、復帰後の結果へ速く反応します。", "Tracks estimated strength and uncertainty separately, without forcing a rating drop during absence.")}</p>
          </article>

          <article className="rate-metric-card rate-metric-hensachi">
            <div className="rate-card-topline"><span>03</span><em>ERA ADJUSTED</em></div>
            <h3>{t("相撲偏差値", "Sumo Score")}</h3>
            <div className="rate-metric-number"><strong>50</strong><span>{t("同場所・同段平均", "Tournament/division mean")}</span></div>
            <p>{t("Glicko-2を同じ場所・同じ段の分布で標準化。番付層の違いを混ぜず、同時代での傑出度を見ます。", "Standardizes Glicko-2 within the same tournament and division to show dominance among true peers.")}</p>
          </article>
        </div>

        <div className="rate-formula" aria-label="計算の流れ">
          <span>{t("全取組", "All bouts")}</span><b>→</b><span>{t("Eloで基準線", "Elo baseline")}</span><b>／</b><span>{t("Glicko-2でレートと推定幅", "Glicko-2 rating and range")}</span><b>／</b><span>{t("同場所・同段で相撲偏差値", "Sumo Score within peers")}</span>
        </div>
        <a className="rate-method-jump" href="#methodology">{t("算法を詳しく読む ↓", "Read the methodology ↓")}</a>
      </section>

      <section className="rate-shell rate-methodology" id="methodology" aria-labelledby="methodology-title">
        <div className="rate-section-heading">
          <div>
            <p>RATING RESEARCH NOTE</p>
            <h2 id="methodology-title">{t("予想に強い数字と、歴史を語る数字は違う。", "Forecasting and history need different numbers.")}</h2>
          </div>
          <span>{t("算法解説", "Methodology")}</span>
        </div>

        <div className="rate-method-verdict">
          <strong>{t("一つの万能レートは作らない。", "There is no single all-purpose rating.")}</strong>
          <p>{t("順位の基準、現在のGlicko-2、一番の勝機、同時代での傑出度。それぞれに適した計算を使い、数字の役割を混ぜないのが相撲日和の方針です。", "Elo ranks a career, Glicko-2 estimates current strength, forecasts price a specific bout, and Sumo Score measures dominance among peers. Sumo Biyori keeps those roles separate.")}</p>
        </div>

        <div className="rate-method-role-grid">
          {methodRoles.map((role) => (
            <article key={role.name}>
              <div><span>{role.number}</span><em>{t(role.status, role.statusEn)}</em></div>
              <small>{role.english}</small>
              <h3>{t(role.name, role.nameEn)}</h3>
              <p>{t(role.copy, role.copyEn)}</p>
            </article>
          ))}
        </div>

        <div className="rate-method-layout">
          <nav className="rate-method-toc" aria-label="算法解説の目次">
            <strong>{t("研究ノート目次", "Research notes")}</strong>
            <a href="#note-elo"><span>壱</span>Elo</a>
            <a href="#note-glicko"><span>弐</span>Glicko-2</a>
            <a href="#note-forecast"><span>参</span>{t("勝敗予想", "Forecast")}</a>
            <a href="#note-hensachi"><span>肆</span>{t("相撲偏差値", "Sumo Score")}</a>
            <a href="#note-era"><span>伍</span>{t("時代比較", "Across eras")}</a>
            <a href="#note-limits"><span>陸</span>{t("数字の限界", "Limits")}</a>
          </nav>

          <div className="rate-method-article">
            <article id="note-elo">
              <p className="rate-method-number">壱　ELO / BASELINE</p>
              <h3>{t("まず、誰に勝ったかを数える。", "Start with whom each wrestler beat.")}</h3>
              <p>{t("Eloは、格上に勝てば大きく上がり、格下に負ければ大きく下がる仕組みです。相撲日和では全力士を1500から始め、取組順にK値20で更新しています。", "Elo rises more after an upset and falls more after an unexpected loss. Every wrestler starts at 1500 and updates chronologically with K=20.")}</p>
              <div className="rate-method-formula"><span>{t("次のElo", "New Elo")}</span><b>=</b><span>{t("現在Elo", "Current Elo")}</span><b>+</b><span>{t("20 ×（実際の勝敗 − 事前の期待勝率）", "20 × (result − expected probability)")}</span></div>
              <aside><strong>{t("苦手な場面", "Limitation")}</strong>{t("新人も横綱経験者も更新幅が同じなので、旭富士のような急成長中の力士は追いつくまで時間がかかります。", "The same update speed applies to newcomers and veterans, so a rapidly improving wrestler can be underrated for a while.")}</aside>
              <details><summary>{t("技術的な説明と前提", "Technical assumptions")}</summary><p>{t("表示用Eloは説明可能性を優先した固定K方式です。予測専用モデルとは分け、今後モデルが変わっても基準線として残します。", "The displayed Elo uses a fixed K for clarity and remains separate from the forecasting model.")}</p></details>
            </article>

            <article id="note-glicko">
              <p className="rate-method-number">弐　GLICKO-2 / CURRENT STRENGTH</p>
              <h3>{t("「強さ」と「まだ分からない」を分ける。", "Separate strength from uncertainty.")}</h3>
              <p>{t("Glicko-2では、各力士がレートだけでなく、推定幅を表すRDと、変化しやすさを表すvolatilityを持ちます。初期値は1500、RD 350、volatility 0.06です。", "Glicko-2 gives each wrestler a rating, an RD for uncertainty and volatility for how quickly strength may move. Initial values are 1500, RD 350 and volatility 0.06.")}</p>
              <p>{t("休場しても平均値を自動で下げず、RDだけを広げます。復帰後の結果が予想外なら、新しい実力へ速く追従します。関取の一場所15番と相性がよく、幕下以下の7番では参考幅を必ず併記します。", "An absence widens uncertainty without automatically lowering the central rating. Unexpected results after a return can therefore move the estimate quickly.")}</p>
              <div className="rate-method-formula"><span>Glicko-2 1740</span><b>±</b><span>{t("推定幅 86", "range 86")}</span><b>=</b><span>{t("「中心は1740、まだ幅がある」", "centered at 1740, with uncertainty")}</span></div>
              <aside><strong>{t("注意", "Note")}</strong>{t("下位相手への連勝だけから、未対戦の十両力士より強いと断定はできません。段位を越える橋は昇進後の取組が作ります。", "A winning streak against lower-division opponents cannot prove superiority over an unplayed sekitori. Promotion creates that bridge.")}</aside>
              <details><summary>{t("原典とパラメータ", "Source and parameters")}</summary><p>{t("場所を一つのrating periodとして全取組をまとめて更新し、τは0.5。最新の途中場所は取得済み取組を暫定periodとして再計算します。", "Each tournament is one rating period with τ=0.5. An ongoing tournament is recalculated provisionally from recorded bouts.")}</p><a href="https://www.glicko.net/glicko/glicko2.pdf" target="_blank" rel="noreferrer">Glicko-2 paper ↗</a></details>
            </article>

            <article id="note-forecast">
              <p className="rate-method-number">参　DOHYO FORECAST / MATCH PROBABILITY</p>
              <h3>{t("勝機は、順位表とは別に計算する。", "A bout forecast is not a ranking table.")}</h3>
              <p>{t("現在・次の取組では、両力士のGlicko-2レート差を勝率へ変換し、過去の直接対戦が十分ある場合だけ相性を少し加えます。対戦1回の1勝0敗を「相性100%」とは扱わず、8番分の事前値で強く縮めます。", "For current and upcoming bouts, the Glicko-2 gap becomes a probability. Head-to-head history contributes only when there is enough evidence and is strongly shrunk toward neutral.")}</p>
              <div className="rate-method-formula"><span>{t("勝機", "Forecast")}</span><b>=</b><span>{t("Glicko-2レート差", "Glicko-2 gap")}</span><b>+</b><span>{t("縮小した直接対戦残差", "shrunk matchup residual")}</span></div>
              <aside><strong>{t("直近成績について", "Recent form")}</strong>{t("単純な「最近5勝だから加点」は時系列検証で予測を改善しませんでした。相手の強さを二重に数えるため、初版では係数を0にしています。", "A simple recent-win bonus did not improve chronological testing because opponent strength was counted twice, so its coefficient remains zero.")}</aside>
              <aside><strong>{t("確率の較正", "Calibration")}</strong>{t("1958〜2019年で確率の傾きを整え、2020年以降は触らずに答え合わせしています。公開後の予測は計算時点の値を固定保存し、結果が出たら勝敗だけを追記します。", "Probabilities were calibrated on 1958–2019 and tested untouched from 2020 onward. Published forecasts are frozen, then matched with the official result.")}</aside>
              <p><Link className="rate-inline-link" href="/rate/validation">{t("2020年以降の予測成績・較正を見る →", "View forecast accuracy since 2020 →")}</Link></p>
              <details><summary>{t("相性補正の中身", "Matchup adjustment")}</summary><p>{t("各直接対戦で「実際の結果 − 当時のElo期待値」を合計し、対戦数＋8で割った残差だけを使用します。相撲に相性が存在しても、再戦数が少ない組合せでは補正をほぼゼロへ戻します。", "For each meeting we sum result minus the Elo expectation, then divide by meetings plus eight. Small samples therefore remain near neutral.")}</p><a href="https://doi.org/10.1515/jqas-2025-0150" target="_blank" rel="noreferrer">Pairwise-Elo rating system ↗</a></details>
            </article>

            <article id="note-hensachi">
              <p className="rate-method-number">肆　SUMO HENSACHI / ERA SCORE</p>
              <h3>{t("同じ場所、同じ段での傑出度を見る。", "Measure dominance among true peers.")}</h3>
              <p>{t("相撲偏差値はGlicko-2を、同じ場所・同じ段に在籍する力士の平均と標準偏差で変換します。全六段を一緒にせず、幕内は幕内、幕下は幕下の中で比較します。", "Sumo Score standardizes Glicko-2 using the mean and standard deviation within the same tournament and division.")}</p>
              <div className="rate-method-formula"><span>{t("相撲偏差値", "Sumo Score")}</span><b>=</b><span>{t("50 ＋ 10 ×（Glicko-2 − 段内平均）÷ 段内標準偏差", "50 + 10 × (Glicko-2 − division mean) ÷ division SD")}</span></div>
              <aside><strong>{t("読み方", "Interpretation")}</strong>{t("偏差値70の序二段力士が、偏差値65の幕内力士より絶対に強いという意味ではありません。所属集団での抜け方を示します。", "A Jonidan score of 70 does not imply absolute superiority over a Makuuchi score of 65. It measures distance from each peer group.")}</aside>
            </article>

            <article id="note-era">
              <p className="rate-method-number">伍　ACROSS ERAS / HISTORY MODE</p>
              <h3>{t("「強さ」と「支配した度合い」を分ける。", "Separate absolute strength from era dominance.")}</h3>
              <p>{t("過去場所へ切り替えると、その時点のElo・Glicko-2・相撲偏差値を見られます。異なる時代の比較では、一場所の最高値だけでなく、ベスト6場所平均と高水準を維持した期間を組み合わせる設計です。", "Switch tournaments to see Elo, Glicko-2 and Sumo Score at that point in time. Across eras, the experiment combines peak level with the best-six-tournament average.")}</p>
              <p>{t("将来は、重なり合う現役期間を橋にして全履歴を平滑化する歴代補正レートを別枠で公開します。未来の実績を過去へ反映するため、ライブ予想とは混ぜません。", "A future whole-history model will use overlapping careers as bridges. Because it lets later evidence reshape earlier estimates, it will remain separate from live forecasts.")}</p>
              <aside><strong>{t("原理的な限界", "Fundamental limit")}</strong>{t("直接つながっていない時代の「絶対的な強さ」は勝敗だけでは証明できません。歴代補正値には必ず推定区間と実験表示を添えます。", "Results alone cannot prove absolute strength across disconnected eras, so historical estimates remain explicitly experimental.")}</aside>
              <p><Link className="rate-inline-link" href="/rate/era">{t("1958年以降の歴代指数・実験版を見る →", "View the era index since 1958 →")}</Link></p>
              <details><summary>{t("歴史モデルの候補", "Historical model candidates")}</summary><p>{t("TrueSkill Through TimeやWhole-History Ratingを参考にし、年齢曲線、休場中の不確実性、世代間の橋を検証します。", "We are studying age curves, absence uncertainty and generational bridges using TrueSkill Through Time and Whole-History Rating as references.")}</p><a href="https://www.microsoft.com/en-us/research/publication/trueskill-through-time-revisiting-the-history-of-chess/" target="_blank" rel="noreferrer">TrueSkill Through Time ↗</a></details>
            </article>

            <article id="note-limits">
              <p className="rate-method-number">陸　VALIDATION / LIMITS</p>
              <h3>{t("当たったかどうかも、公開する。", "Publish whether the forecasts worked.")}</h3>
              <p>{t("モデルは過去から未来へ順番に検証し、未来の取組を学習へ混ぜません。正解率だけでなく、log loss、Brierスコア、そして「70%予想が本当に約70%勝つか」という較正を重視します。", "The model is tested chronologically without leaking future bouts into training. We publish accuracy, log loss, Brier score and calibration.")}</p>
              <p>{t("新人、昇進直後、休場明け、段位別、再戦数別に成績を分け、改善しない特徴は追加しません。現在のデータには休場理由がないため、全力士一律の休場ペナルティは使用していません。", "Results are split by newcomers, promotions, returns, divisions and rematch count. Features that do not improve held-out results are not added.")}</p>
              <div className="rate-method-formula"><span>{t("単純さ", "Simplicity")}</span><b>+</b><span>{t("時系列検証", "chronological testing")}</span><b>+</b><span>{t("推定幅", "uncertainty")}</span><b>=</b><span>{t("信頼できる数字", "trustworthy numbers")}</span></div>
            </article>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-brand">
          <div><strong>相撲日和</strong><small>{t("相撲を、もっと近くに。", "Grand sumo, closer.")}</small></div>
        </div>
        <p>{t("相撲を愛する人のための非公式ファンサイト", "An independent fan site for sumo lovers")}</p>
        <Link href="/">{t("トップへ戻る →", "Back to home →")}</Link>
      </footer>
    </main>
  );
}
