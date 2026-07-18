import {
  LiveBanzukeCard,
  LiveHeaderStatus,
  LiveHeroBout,
  LiveResultsBoard,
  LiveSumoProvider,
} from "./components/LiveSumo";
import SiteHeader from "./components/SiteHeader";
import FeaturedRisers from "./components/FeaturedRisers";

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

        <FeaturedRisers />

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
