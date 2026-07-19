import {
  LiveBanzukeCard,
  LiveHeaderStatus,
  LiveHeroBout,
  LiveResultsBoard,
  LiveSumoProvider,
} from "./components/LiveSumo";
import SiteHeader from "./components/SiteHeader";
import FeaturedRisers from "./components/FeaturedRisers";
import Bilingual from "./components/Bilingual";

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
        <div className="hero-core">
          <LiveHeroBout />
        </div>
      </section>

      <LiveResultsBoard />

      <section className="feature-grid section-shell" aria-label="今場所の見どころ">
        <LiveBanzukeCard />

        <FeaturedRisers />

      </section>

      <footer>
        <div className="footer-brand">
          <div><strong>相撲日和</strong><small><Bilingual ja="相撲を、もっと近くに。" en="Grand sumo, closer." /></small></div>
        </div>
        <p><Bilingual ja="相撲を愛する人のための非公式ファンサイト" en="An independent fan site for sumo lovers" /></p>
        <a href="#top"><Bilingual ja="上へ戻る ↑" en="Back to top ↑" /></a>
      </footer>
    </main>
    </LiveSumoProvider>
  );
}
