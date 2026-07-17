import {
  LiveHeaderStatus,
  LiveHeroBout,
  LiveResultsBoard,
  LiveSumoProvider,
} from "./components/LiveSumo";

const banzuke = [
  { rank: "横綱", east: "豊昇龍", west: "照ノ富士" },
  { rank: "大関", east: "琴櫻", west: "大の里" },
  { rank: "関脇", east: "若隆景", west: "霧島" },
  { rank: "小結", east: "高安", west: "欧勝馬" },
];

const stories = [
  {
    eyebrow: "力士名鑑",
    title: "静けさの奥に宿る、立ち合いの決意。",
    copy: "土俵際の粘り、寄りの圧力、仕切りに見える集中。観戦が深くなる三つの見どころを紹介します。",
    link: "力士の見方を知る",
    href: "#rikishi",
  },
  {
    eyebrow: "相撲文化",
    title: "塩に込められた、清めと勝負のこころ。",
    copy: "所作を知れば、一瞬の静寂まで面白くなる。土俵を彩る作法と、その背景をやさしく紐解きます。",
    link: "土俵の作法を読む",
    href: "#culture",
  },
  {
    eyebrow: "決まり手入門",
    title: "押す、組む、いなす。八十二手への入口。",
    copy: "まず覚えたい基本の技を、勝負の流れとともに。次の一番から使える観戦の言葉を集めました。",
    link: "決まり手を学ぶ",
    href: "#culture",
  },
];

export default function Home() {
  return (
    <LiveSumoProvider>
    <main>
      <div className="arena-frame" aria-hidden="true" />

      <div className="notice-bar">
        <span>令和八年 七月場所</span>
        <LiveHeaderStatus />
        <span className="notice-detail">公式結果をもとに10秒ごと表示確認</span>
      </div>

      <header className="site-header">
        <nav className="nav-shell" aria-label="メインナビゲーション">
          <div className="nav-group nav-left">
            <a href="#torikumi">取組</a>
            <a href="#banzuke">番付</a>
            <a href="#rikishi">力士名鑑</a>
          </div>

          <a className="brand" href="#top" aria-label="土俵日和 ホーム">
            <span className="brand-crest" aria-hidden="true">土</span>
            <span className="brand-title">土俵日和</span>
            <span className="brand-roman">DOHYO BIYORI</span>
          </a>

          <div className="nav-group nav-right">
            <a href="#culture">相撲文化</a>
            <a href="#stories">読み物</a>
            <a href="#guide">観戦暦</a>
          </div>

          <details className="mobile-menu">
            <summary aria-label="メニューを開く">目次</summary>
            <div className="mobile-menu-panel">
              <a href="#torikumi">取組</a>
              <a href="#banzuke">番付</a>
              <a href="#rikishi">力士名鑑</a>
              <a href="#culture">相撲文化</a>
              <a href="#stories">読み物</a>
            </div>
          </details>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="banner banner-left" aria-hidden="true">
          <span>満員御礼</span>
        </div>

        <div className="hero-core">
          <p className="kicker"><span />本日の結びの一番<span /></p>
          <h1>土俵に、夏が鳴る。</h1>
          <p className="hero-copy">
            一瞬の立ち合い、揺れる館内。今日の熱戦を、<br className="desktop-break" />
            見どころとともに味わう相撲ファンのための場所です。
          </p>

          <LiveHeroBout />
        </div>

        <div className="banner banner-right" aria-hidden="true">
          <span>大相撲名古屋場所</span>
        </div>
      </section>

      <LiveResultsBoard />

      <section className="feature-grid section-shell" aria-label="今場所の見どころ">
        <article className="feature-card banzuke-card" id="banzuke">
          <div className="section-heading">
            <h2>幕内番付</h2>
            <span>BANZUKE</span>
          </div>
          <div className="rank-list">
            {banzuke.map((row) => (
              <div className="rank-row" key={row.rank}>
                <span>{row.east}</span>
                <em>{row.rank}</em>
                <span>{row.west}</span>
              </div>
            ))}
          </div>
          <a className="text-link" href="#stories">番付の読み方をひらく →</a>
        </article>

        <article className="feature-card rikishi-card" id="rikishi">
          <div className="section-heading">
            <h2>今場所の力士</h2>
            <span>RIKISHI PROFILE</span>
          </div>
          <div className="rikishi-body">
            <div className="name-plaque" aria-hidden="true">大<br />の<br />里</div>
            <div>
              <p className="eyebrow">東・大関 / 二所ノ関部屋</p>
              <h3>大の里 泰輝</h3>
              <p>堂々たる押し相撲と、土俵際で見せる冷静さ。故郷・石川への思いを胸に、綱への責任を背負う。</p>
              <dl className="profile-facts">
                <div><dt>身長</dt><dd>192cm</dd></div>
                <div><dt>得意手</dt><dd>突き・押し</dd></div>
                <div><dt>注目</dt><dd>初動の速さ</dd></div>
              </dl>
              <a className="text-link" href="#stories">詳しい観戦帖を見る →</a>
            </div>
          </div>
        </article>

        <article className="feature-card culture-card" id="culture">
          <div className="section-heading">
            <h2>土俵の美学</h2>
            <span>SUMO CULTURE</span>
          </div>
          <span className="tag">相撲文化</span>
          <h3>塩に込められた、<br />清めと勝負のこころ。</h3>
          <p>力士が土俵に撒く塩には、古くから続く神事の記憶があります。所作を知れば、取組前の静けさももっと面白い。</p>
          <a className="text-link" href="#stories">続きを読む →</a>
        </article>
      </section>

      <section className="stories section-shell" id="stories">
        <div className="stories-intro">
          <p className="kicker"><span />土俵の外側へ<span /></p>
          <h2>知れば、一番がもっと深くなる。</h2>
          <p>勝敗だけでは終わらない。力士、技、作法をめぐる小さな読み物。</p>
        </div>
        <div className="story-list">
          {stories.map((story, index) => (
            <article className="story" key={story.title}>
              <span className="story-number">0{index + 1}</span>
              <div>
                <p className="eyebrow">{story.eyebrow}</p>
                <h3>{story.title}</h3>
                <p>{story.copy}</p>
              </div>
              <a href={story.href}>{story.link} →</a>
            </article>
          ))}
        </div>
      </section>

      <section className="guide section-shell" id="guide">
        <div className="guide-seal" aria-hidden="true">観</div>
        <div>
          <p className="eyebrow">はじめての観戦帖</p>
          <h2>立ち合い前の静けさから、相撲は始まっている。</h2>
          <p>仕切り、呼出、行司、懸賞旗。会場でも中継でも楽しめる、五分で読める観戦の手引きです。</p>
        </div>
        <a className="gold-button" href="#top">観戦の要点を読む <span>→</span></a>
      </section>

      <footer>
        <div className="footer-brand">
          <span className="brand-crest" aria-hidden="true">土</span>
          <div><strong>土俵日和</strong><small>相撲を、もっと近くに。</small></div>
        </div>
        <p>相撲を愛する人のための非公式ファンサイト</p>
        <a href="#top">上へ戻る ↑</a>
      </footer>
    </main>
    </LiveSumoProvider>
  );
}
