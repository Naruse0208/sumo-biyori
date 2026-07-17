import type { Metadata } from "next";
import Link from "next/link";
import ratings from "../../data/ratings-latest.json";
import { japaneseRikishiName, officialRikishiProfile, rikishiProfilePath } from "../lib/rikishi-names";
import RatingBoard from "./rating-board";
import RateLabNav from "./rate-lab-nav";

export const metadata: Metadata = {
  title: "力士レーティング研究室｜土俵日和",
  description: "1999年以降・全六段の40万件を超える取組から再計算したElo、Glicko-2による地力、相撲偏差値と土俵日和予測。",
  openGraph: {
    title: "力士レーティング研究室｜土俵日和",
    description: "Elo・Glicko-2・相撲偏差値で、力士の強さと一番の勝機を読み解く。",
    images: [
      {
        url: "/og-rating.png",
        width: 1731,
        height: 909,
        alt: "土俵日和 力士レーティング研究室",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "力士レーティング研究室｜土俵日和",
    description: "Elo・Glicko-2・相撲偏差値で、力士の強さと一番の勝機を読み解く。",
    images: ["/og-rating.png"],
  },
};

const auditStats = [
  { value: "1999—", label: "収録対象" },
  { value: "全六段", label: "幕内から序ノ口" },
  { value: ratings.counts.sourceWrestlers.toLocaleString(), label: "力士マスター" },
  { value: ratings.counts.ratedBouts.toLocaleString(), label: "Elo計算済み取組" },
];

const releaseSteps = [
  { number: "壱", title: "基準線を作る", copy: "全取組を時系列に揃え、透明なEloを一番ごとに再計算。" },
  { number: "弐", title: "不確かさを測る", copy: "場所単位のGlicko-2で、地力と推定幅を同時に記録。" },
  { number: "参", title: "勝機を読む", copy: "地力差に、十分な対戦数があるときだけ相性を加える。" },
  { number: "肆", title: "時代をつなぐ", copy: "同時代偏差値を土台に、歴代比較モデルを検証していく。" },
];

const methodRoles = [
  { number: "01", name: "Elo", english: "BASELINE", status: "公開中", copy: "一番ごとの勝敗と相手の強さから更新する、説明しやすい基準線。" },
  { number: "02", name: "地力", english: "GLICKO-2", status: "公開中", copy: "現在の強さに、どれほど確かな推定かを示すRDを添えた値。" },
  { number: "03", name: "勝機", english: "MATCH FORECAST", status: "検証公開", copy: "地力差と、強く縮めた直接対戦相性から出す一番ごとの予想勝率。" },
  { number: "04", name: "相撲偏差値", english: "ERA SCORE", status: "歴代実験公開", copy: "同じ場所・同じ段の中で、どれほど傑出しているかを50基準で表す。" },
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

export default function RatePage() {
  return (
    <main className="rate-page">
      <div className="rate-frame" aria-hidden="true" />

      <div className="notice-bar rate-notice">
        <strong>土俵日和 レーティング研究室</strong>
        <span>1999年以降・全六段・用途の違う三つのものさし</span>
      </div>

      <header className="site-header">
        <nav className="nav-shell" aria-label="メインナビゲーション">
          <div className="nav-group nav-left">
            <Link href="/#torikumi">取組</Link>
            <Link href="/#banzuke">番付</Link>
            <Link className="is-current" href="/rate">レート</Link>
          </div>

          <Link className="brand" href="/" aria-label="土俵日和 ホーム">
            <span className="brand-crest" aria-hidden="true">土</span>
            <span className="brand-title">土俵日和</span>
            <span className="brand-roman">DOHYO BIYORI</span>
          </Link>

          <div className="nav-group nav-right">
            <Link href="/#culture">相撲文化</Link>
          </div>

          <details className="mobile-menu">
            <summary aria-label="メニューを開く">目次</summary>
            <div className="mobile-menu-panel">
              <Link href="/#torikumi">取組</Link>
              <Link href="/#banzuke">番付</Link>
              <Link className="is-current" href="/rate">レート</Link>
              <Link href="/#culture">相撲文化</Link>
            </div>
          </details>
        </nav>
      </header>

      <RateLabNav active="ranking" />

      <section className="rate-hero">
        <div className="rate-hero-copy">
          <p className="rate-kicker">DOHYO BIYORI RATING LAB</p>
          <h1>強さを、<br />時代の中で測る。</h1>
          <p className="rate-lead">
            1999年以降の全取組を一番ずつ積み上げ、対戦相手の強さまで含めて数値化する。
            Elo、地力、相撲偏差値。目的の違う数字を分けて、今の強さと時代の中での傑出度を読み解きます。
          </p>
          <div className="rate-hero-actions">
            <span className="rate-status"><i aria-hidden="true" />Elo・Glicko-2 全期間計算済み</span>
            <a href="#ranking-title">順位を見る <span>↓</span></a>
          </div>
        </div>

        <div className="rate-seal" aria-label="試算版">
          <span>試</span>
          <span>算</span>
          <small>PREVIEW</small>
        </div>
      </section>

      <section className="rate-shell rate-metrics" id="method" aria-labelledby="metric-title">
        <div className="rate-section-heading">
          <div>
            <p>THE TWO NUMBERS</p>
            <h2 id="metric-title">三つのものさしで、強さを見る。</h2>
          </div>
          <span>算出設計</span>
        </div>

        <div className="rate-metric-grid">
          <article className="rate-metric-card rate-metric-elo">
            <div className="rate-card-topline"><span>01</span><em>RAW RATING</em></div>
            <h3>Elo</h3>
            <div className="rate-metric-number"><strong>1500</strong><span>基準値</span></div>
            <p>勝敗と対戦相手のレート差から、一番ごとに増減する生の強さ。時系列を崩さず、全取組から再計算します。</p>
          </article>

          <article className="rate-metric-card rate-metric-glicko">
            <div className="rate-card-topline"><span>02</span><em>CURRENT STRENGTH</em></div>
            <h3>地力 <small>Glicko-2</small></h3>
            <div className="rate-metric-number"><strong>1500</strong><span>初期値・RD 350</span></div>
            <p>強さと推定の不確かさを別々に持つ。休場中は値を決めつけて下げず、復帰後の結果へ速く反応します。</p>
          </article>

          <article className="rate-metric-card rate-metric-hensachi">
            <div className="rate-card-topline"><span>03</span><em>ERA ADJUSTED</em></div>
            <h3>相撲偏差値</h3>
            <div className="rate-metric-number"><strong>50</strong><span>同場所・同段平均</span></div>
            <p>地力を同じ場所・同じ段の分布で標準化。番付層の違いを混ぜず、同時代での傑出度を見ます。</p>
          </article>
        </div>

        <div className="rate-formula" aria-label="計算の流れ">
          <span>全取組</span><b>→</b><span>Eloで基準線</span><b>／</b><span>Glicko-2で地力と推定幅</span><b>／</b><span>同場所・同段で相撲偏差値</span>
        </div>
        <a className="rate-method-jump" href="#methodology">算法を詳しく読む ↓</a>
      </section>

      <section className="rate-shell rate-ranking" aria-labelledby="ranking-title">
        <div className="rate-section-heading">
          <div>
            <p>RIKISHI RATING</p>
            <h2 id="ranking-title">力士レート順位</h2>
          </div>
          <span className="rate-pending">1999年以降・{ratings.scope.basho}場所</span>
        </div>

        <RatingBoard
          divisions={initialDivisions}
          initialBasho={Number(ratings.scope.latestBasho)}
        />
        <div className="rate-ranking-board rate-ranking-method">
          <div className="rate-ranking-note">
            <p><strong>計算範囲</strong> 1999年一月場所〜令和八年七月場所・全六段／{ratings.counts.ratedBouts.toLocaleString()}取組・{ratings.counts.wrestlersInScope.toLocaleString()}力士</p>
            <p>基準Elo {ratings.model.startingElo}・K値 {ratings.model.kFactor}。地力は場所単位Glicko-2・初期RD {ratings.model.glicko2.initialRd}。最新場所は取得済み取組までを反映します。</p>
            <a href="https://sumo-api.com/api-guide" target="_blank" rel="noreferrer">取組データ仕様：Sumo API ↗</a>
          </div>
        </div>
      </section>

      <section className="rate-shell rate-methodology" id="methodology" aria-labelledby="methodology-title">
        <div className="rate-section-heading">
          <div>
            <p>RATING RESEARCH NOTE</p>
            <h2 id="methodology-title">予想に強い数字と、歴史を語る数字は違う。</h2>
          </div>
          <span>算法解説</span>
        </div>

        <div className="rate-method-verdict">
          <strong>一つの万能レートは作らない。</strong>
          <p>順位の基準、現在の地力、一番の勝機、同時代での傑出度。それぞれに適した計算を使い、数字の役割を混ぜないのが土俵日和の方針です。</p>
        </div>

        <div className="rate-method-role-grid">
          {methodRoles.map((role) => (
            <article key={role.name}>
              <div><span>{role.number}</span><em>{role.status}</em></div>
              <small>{role.english}</small>
              <h3>{role.name}</h3>
              <p>{role.copy}</p>
            </article>
          ))}
        </div>

        <div className="rate-method-layout">
          <nav className="rate-method-toc" aria-label="算法解説の目次">
            <strong>研究ノート目次</strong>
            <a href="#note-elo"><span>壱</span>Elo</a>
            <a href="#note-glicko"><span>弐</span>Glicko-2</a>
            <a href="#note-forecast"><span>参</span>勝敗予想</a>
            <a href="#note-hensachi"><span>肆</span>相撲偏差値</a>
            <a href="#note-era"><span>伍</span>時代比較</a>
            <a href="#note-limits"><span>陸</span>数字の限界</a>
          </nav>

          <div className="rate-method-article">
            <article id="note-elo">
              <p className="rate-method-number">壱　ELO / BASELINE</p>
              <h3>まず、誰に勝ったかを数える。</h3>
              <p>Eloは、格上に勝てば大きく上がり、格下に負ければ大きく下がる仕組みです。土俵日和では全力士を1500から始め、取組順にK値20で更新しています。</p>
              <div className="rate-method-formula"><span>次のElo</span><b>＝</b><span>現在Elo</span><b>＋</b><span>20 ×（実際の勝敗 − 事前の期待勝率）</span></div>
              <aside><strong>苦手な場面</strong>新人も横綱経験者も更新幅が同じなので、旭富士のような急成長中の力士は追いつくまで時間がかかります。</aside>
              <details><summary>技術的な説明と前提</summary><p>表示用Eloは説明可能性を優先した固定K方式です。予測専用モデルとは分け、今後モデルが変わっても基準線として残します。</p></details>
            </article>

            <article id="note-glicko">
              <p className="rate-method-number">弐　GLICKO-2 / CURRENT STRENGTH</p>
              <h3>「強さ」と「まだ分からない」を分ける。</h3>
              <p>地力にはGlicko-2を使用します。各力士はレートだけでなく、推定幅を表すRDと、変化しやすさを表すvolatilityを持ちます。初期値は1500、RD 350、volatility 0.06です。</p>
              <p>休場しても平均値を自動で下げず、RDだけを広げます。復帰後の結果が予想外なら、新しい実力へ速く追従します。関取の一場所15番と相性がよく、幕下以下の7番では参考幅を必ず併記します。</p>
              <div className="rate-method-formula"><span>地力 1740</span><b>±</b><span>推定幅 86</span><b>＝</b><span>「中心は1740、まだ幅がある」</span></div>
              <aside><strong>注意</strong>下位相手への連勝だけから、未対戦の十両力士より強いと断定はできません。段位を越える橋は昇進後の取組が作ります。</aside>
              <details><summary>原典とパラメータ</summary><p>場所を一つのrating periodとして全取組をまとめて更新し、τは0.5。最新の途中場所は取得済み取組を暫定periodとして再計算します。</p><a href="https://www.glicko.net/glicko/glicko2.pdf" target="_blank" rel="noreferrer">Glicko-2 原論文 ↗</a></details>
            </article>

            <article id="note-forecast">
              <p className="rate-method-number">参　DOHYO FORECAST / MATCH PROBABILITY</p>
              <h3>勝機は、順位表とは別に計算する。</h3>
              <p>現在・次の取組では、両力士の地力差を勝率へ変換し、過去の直接対戦が十分ある場合だけ相性を少し加えます。対戦1回の1勝0敗を「相性100%」とは扱わず、8番分の事前値で強く縮めます。</p>
              <div className="rate-method-formula"><span>勝機</span><b>＝</b><span>Glicko-2地力差</span><b>＋</b><span>縮小した直接対戦残差</span></div>
              <aside><strong>直近成績について</strong>単純な「最近5勝だから加点」は時系列検証で予測を改善しませんでした。相手の強さを二重に数えるため、初版では係数を0にしています。</aside>
              <aside><strong>確率の較正</strong>1999〜2019年で確率の傾きを整え、2020年以降は触らずに答え合わせしています。公開後の予測は計算時点の値を固定保存し、結果が出たら勝敗だけを追記します。</aside>
              <p><Link className="rate-inline-link" href="/rate/validation">2020年以降の予測成績・較正を見る →</Link></p>
              <details><summary>相性補正の中身</summary><p>各直接対戦で「実際の結果 − 当時のElo期待値」を合計し、対戦数＋8で割った残差だけを使用します。相撲に相性が存在しても、再戦数が少ない組合せでは補正をほぼゼロへ戻します。</p><a href="https://doi.org/10.1515/jqas-2025-0150" target="_blank" rel="noreferrer">Pairwise-Elo rating system ↗</a></details>
            </article>

            <article id="note-hensachi">
              <p className="rate-method-number">肆　SUMO HENSACHI / ERA SCORE</p>
              <h3>同じ場所、同じ段での傑出度を見る。</h3>
              <p>相撲偏差値は地力を、同じ場所・同じ段に在籍する力士の平均と標準偏差で変換します。全六段を一緒にせず、幕内は幕内、幕下は幕下の中で比較します。</p>
              <div className="rate-method-formula"><span>相撲偏差値</span><b>＝</b><span>50 ＋ 10 ×（地力 − 段内平均）÷ 段内標準偏差</span></div>
              <aside><strong>読み方</strong>偏差値70の序二段力士が、偏差値65の幕内力士より絶対に強いという意味ではありません。所属集団での抜け方を示します。</aside>
            </article>

            <article id="note-era">
              <p className="rate-method-number">伍　ACROSS ERAS / HISTORY MODE</p>
              <h3>「強さ」と「支配した度合い」を分ける。</h3>
              <p>過去場所へ切り替えると、その時点のElo・地力・相撲偏差値を見られます。異なる時代の比較では、一場所の最高値だけでなく、ベスト6場所平均と高水準を維持した期間を組み合わせる設計です。</p>
              <p>将来は、重なり合う現役期間を橋にして全履歴を平滑化する歴代補正レートを別枠で公開します。未来の実績を過去へ反映するため、ライブ予想とは混ぜません。</p>
              <aside><strong>原理的な限界</strong>直接つながっていない時代の「絶対的な強さ」は勝敗だけでは証明できません。歴代補正値には必ず推定区間と実験表示を添えます。</aside>
              <p><Link className="rate-inline-link" href="/rate/era">1999年以降の歴代指数・実験版を見る →</Link></p>
              <details><summary>歴史モデルの候補</summary><p>TrueSkill Through TimeやWhole-History Ratingを参考にし、年齢曲線、休場中の不確実性、世代間の橋を検証します。</p><a href="https://www.microsoft.com/en-us/research/publication/trueskill-through-time-revisiting-the-history-of-chess/" target="_blank" rel="noreferrer">TrueSkill Through Time ↗</a></details>
            </article>

            <article id="note-limits">
              <p className="rate-method-number">陸　VALIDATION / LIMITS</p>
              <h3>当たったかどうかも、公開する。</h3>
              <p>モデルは過去から未来へ順番に検証し、未来の取組を学習へ混ぜません。正解率だけでなく、log loss、Brierスコア、そして「70%予想が本当に約70%勝つか」という較正を重視します。</p>
              <p>新人、昇進直後、休場明け、段位別、再戦数別に成績を分け、改善しない特徴は追加しません。現在のデータには休場理由がないため、全力士一律の休場ペナルティは使用していません。</p>
              <div className="rate-method-formula"><span>単純さ</span><b>＋</b><span>時系列検証</span><b>＋</b><span>推定幅</span><b>＝</b><span>信頼できる数字</span></div>
            </article>
          </div>
        </div>
      </section>

      <section className="rate-shell rate-data" aria-labelledby="data-title">
        <div className="rate-section-heading">
          <div>
            <p>DATA AUDIT</p>
            <h2 id="data-title">500MBに収める設計。</h2>
          </div>
          <span>初期調査</span>
        </div>

        <div className="rate-audit-grid">
          {auditStats.map((stat) => (
            <div className="rate-audit-stat" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="rate-storage-grid">
          <div>
            <p className="rate-storage-label">DATABASE TARGET</p>
            <strong>{ratings.storage.sqliteMiB}<small> MB 実測</small></strong>
            <div className="rate-storage-bar"><span style={{ width: `${(ratings.storage.sqliteMiB / ratings.storage.targetMiB) * 100}%` }} /></div>
            <p>力士、番付、全取組、各一番の前後Elo、場所ごとのレート履歴と検索用インデックスまで含む実測値です。</p>
          </div>
          <ul>
            <li><span>保存する</span>力士マスター・番付・取組・レート履歴・予測と答え合わせ</li>
            <li><span>保存しない</span>取得元HTML・画像・同じしこ名の重複</li>
            <li><span>余裕</span>500MB上限の約{Math.round((ratings.storage.sqliteMiB / ratings.storage.targetMiB) * 100)}%を使用</li>
          </ul>
        </div>
      </section>

      <section className="rate-shell rate-roadmap" aria-labelledby="roadmap-title">
        <div className="rate-section-heading">
          <div>
            <p>ROAD TO RELEASE</p>
            <h2 id="roadmap-title">研究の四段階。</h2>
          </div>
          <span>現在地</span>
        </div>
        <ol>
          {releaseSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.copy}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rate-shell rate-next">
        <p>NOW AVAILABLE</p>
        <h2>順位から、地力と勝機へ。</h2>
        <div>
          <span>Elo／地力／偏差値切替</span><span>Glicko-2推定幅</span><span>土俵日和予測 v2.1</span><span>公開バックテスト</span><span>歴代指数・実験版</span>
        </div>
        <p>順位表や今日の取組から力士名を選ぶと、個別プロフィールと複数のレート履歴を見られます。</p>
      </section>

      <footer>
        <div className="footer-brand">
          <span className="brand-crest" aria-hidden="true">土</span>
          <div><strong>土俵日和</strong><small>相撲を、もっと近くに。</small></div>
        </div>
        <p>相撲を愛する人のための非公式ファンサイト</p>
        <Link href="/">トップへ戻る →</Link>
      </footer>
    </main>
  );
}
