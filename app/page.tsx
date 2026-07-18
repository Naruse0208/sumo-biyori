import {
  LiveBanzukeCard,
  LiveHeaderStatus,
  LiveHeroBout,
  LiveResultsBoard,
  LiveSumoProvider,
} from "./components/LiveSumo";
import SiteHeader from "./components/SiteHeader";

export default function Home() {
  return (
    <LiveSumoProvider>
    <main>
      <div className="arena-frame" aria-hidden="true" />

      <div className="notice-bar">
        <LiveHeaderStatus />
      </div>

      <SiteHeader active="home" />

      <section className="hero" id="top">
        <div className="banner banner-left" aria-hidden="true">
          <span>満員御礼</span>
        </div>

        <div className="hero-core">
          <LiveHeroBout />
        </div>

        <div className="banner banner-right" aria-hidden="true">
          <span>大相撲名古屋場所</span>
        </div>
      </section>

      <LiveResultsBoard />

      <section className="feature-grid section-shell" aria-label="今場所の見どころ">
        <LiveBanzukeCard />

        <article className="feature-card rikishi-card" id="rikishi">
          <div className="section-heading">
            <h2>今場所の力士</h2>
            <span>RIKISHI PROFILE</span>
          </div>
          <div className="rikishi-body">
            <a className="name-plaque" href="/rikishi/nsk-4227" aria-label="大の里 力士プロフィール">大<br />の<br />里</a>
            <div>
              <p className="eyebrow">西・横綱 / 二所ノ関部屋</p>
              <h3><a className="profile-name-link" href="/rikishi/nsk-4227">大の里 泰輝</a></h3>
              <p>堂々たる押し相撲と、土俵際で見せる冷静さ。故郷・石川への思いを胸に、綱への責任を背負う。</p>
              <dl className="profile-facts">
                <div><dt>身長</dt><dd>192cm</dd></div>
                <div><dt>得意手</dt><dd>突き・押し</dd></div>
                <div><dt>注目</dt><dd>初動の速さ</dd></div>
              </dl>
            </div>
          </div>
        </article>

      </section>

      <footer>
        <div className="footer-brand">
          <div><strong>土俵日和</strong><small>相撲を、もっと近くに。</small></div>
        </div>
        <p>相撲を愛する人のための非公式ファンサイト</p>
        <a href="#top">上へ戻る ↑</a>
      </footer>
    </main>
    </LiveSumoProvider>
  );
}
