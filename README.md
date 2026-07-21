# Sumo Biyori / 相撲日和

[日本語版](./README.ja.md)

> A bilingual sumo companion that combines live bout tracking, ratings rebuilt from historical results, transparent win forecasts, cross-era comparison, and fact-grounded GPT-5.6 bout previews.

[![Sumo Biyori social preview](./public/og.png)](https://dohyo-biyori.uwaaaan.chatgpt.site/)

**[Live demo](https://dohyo-biyori.uwaaaan.chatgpt.site/)** · **[Source code](https://github.com/Naruse0208/sumo-biyori)**

## Why Sumo Biyori

Official sumo information is rich, but the live card, wrestler context, historical strength, and model forecasts are usually viewed separately. Sumo Biyori brings them into one coherent experience for both Japanese and international fans.

The project is more than an AI wrapper. Its core is a structured sumo data and rating system; GPT-5.6 turns verified bout facts into concise, bilingual editorial context without inventing new statistics.

## What it does

- Tracks the current day's bouts and results across all six divisions.
- Recalculates Elo and Glicko-2 from recorded bouts since 1958.
- Shows a same-basho Sumo Deviation Score for era-aware comparison.
- Publishes pre-bout win probabilities and keeps forecasts visible after the result.
- Provides wrestler profiles, rating curves, head-to-head comparison, model validation, era rankings, and yokozuna comparison.
- Generates three bilingual bout-preview perspectives with GPT-5.6: east wrestler, west wrestler, and the key matchup question.
- Supports Japanese and English on desktop, tablet, and mobile.

## OpenAI Build Week

Sumo Biyori was built with Codex and uses GPT-5.6 in the running product.

### How Codex accelerated the build

Codex was used as a collaborative engineering agent throughout the project to:

- inspect and normalize official bout, banzuke, and wrestler data;
- design the central D1 cache so public traffic does not scale requests to the official source;
- build the historical rating pipeline and rating-research pages;
- implement bilingual and responsive interfaces through iterative browser feedback;
- diagnose data-identity, navigation, caching, and profile-route bugs;
- add tests, security boundaries, structured AI output, provider switching, and safe fallbacks; and
- review implementation decisions with the product owner instead of treating generated code as the final authority.

Key human decisions included the rating definitions, the distinction between deterministic forecasts and AI copy, which bouts receive previews, the lower-division-first generation order, and the fallback policy.

### How GPT-5.6 is used

GPT-5.6 is used only for the editorial **"What to watch"** copy shown with a bout. The server prepares a compact facts object containing:

- basho, day, division, rank, and current record;
- wrestler identity and bilingual names;
- Elo, Glicko-2, rating uncertainty, height, and weight; and
- forecast probability, confidence, and recorded head-to-head results.

The facts are sent to the OpenAI **Responses API** with a fixed instruction and strict JSON Schema. The model must return exactly three perspectives in matching Japanese and English. The response is validated, stored in D1's `bout_highlights` table, and reused by every visitor.

```text
Official sumo pages
        │
        ▼
Central D1 cache and wrestler identity store
        │
        ├──► deterministic ratings and win forecast
        │
        ▼
Verified bout-facts JSON
        │
        ▼
GPT-5.6 + strict structured output
        │
        ▼
bout_highlights in D1 ──► bilingual public UI
```

Example input (shortened):

```json
{
  "bashoId": 202607,
  "day": 8,
  "division": { "id": 1, "nameJa": "幕内" },
  "east": {
    "nameJa": "大の里",
    "nameEn": "Onosato",
    "rankJa": "東横綱",
    "wins": 6,
    "losses": 1,
    "elo": 2300,
    "glicko2": 1910
  },
  "west": {
    "nameJa": "豊昇龍",
    "nameEn": "Hoshoryu",
    "rankJa": "西横綱",
    "wins": 5,
    "losses": 2,
    "elo": 2350,
    "glicko2": 1906
  },
  "matchup": {
    "eastWinProbability": 52,
    "westWinProbability": 48,
    "confidence": "high"
  }
}
```

Example output shape:

```json
{
  "east": { "ja": "…", "en": "…" },
  "west": { "ja": "…", "en": "…" },
  "key": { "ja": "…", "en": "…" }
}
```

### What GPT-5.6 does not do

Elo, Glicko-2, Sumo Deviation Score, win probabilities, bout results, and wrestler records are calculated or retrieved by application code. GPT-5.6 does **not** create or modify those values. It explains only the supplied facts, and the prompt explicitly forbids invented injuries, promotion stakes, streaks, techniques, quotations, or history.

## Reliability and safety

- API keys and the highlight-generation token remain server-side.
- Public highlight APIs are read-only; generation requires an admin bearer token.
- One central cache fetches official live information, while visitors read shared D1 data.
- Generated output is constrained by JSON Schema and validated again before storage.
- Each batch contains at most five bouts and is deduplicated by facts, prompt, schema, and bout identity.
- If a provider is unavailable or its limit is reached, deterministic bilingual fallback copy is stored instead of exposing an error.
- Daily generation begins after 05:00 JST, works from lower to higher divisions, and retries partial work at ten-minute intervals.

## Tech stack

- Next.js 16, React 19, TypeScript, and vinext
- Cloudflare Workers and D1
- Drizzle ORM
- OpenAI Responses API with GPT-5.6
- Optional Gemini provider using the same facts and output contract
- Node.js test runner for model, rendering, and integration checks

## Local setup

### Prerequisites

- Node.js 22.13 or later
- npm
- An OpenAI API key only if you want to generate fresh AI previews

### 1. Install

```bash
git clone https://github.com/Naruse0208/sumo-biyori.git
cd sumo-biyori
npm install
```

### 2. Configure local secrets

Copy `.env.example` to `.env.local`, then add your own values. Never commit `.env.local`.

```env
AI_PROVIDER=openai
OPENAI_MODEL=gpt-5.6-luna
OPENAI_API_KEY=your_openai_api_key
AI_HIGHLIGHT_ADMIN_TOKEN=choose_a_private_admin_token
```

Gemini can be used without changing the facts, schema, UI, or database format:

```env
AI_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_API_KEY=your_gemini_api_key
AI_HIGHLIGHT_ADMIN_TOKEN=choose_a_private_admin_token
```

Without provider credentials, the non-AI interface, included historical datasets, and deterministic fallback behavior can still be inspected locally.

### 3. Run

```bash
npm run dev
```

Open the local URL printed by the development server. The local runtime provides the project D1 binding; hosted D1 and secrets are provisioned separately by Sites.

### 4. Build and test

```bash
npm run build
npm test
```

Focused tests are also available:

```bash
node --test tests/rendered-html.test.mjs
node --test tests/glicko2.test.mjs
node --test tests/model-lab.test.mjs
```

## Testing the GPT-5.6 flow

1. Start the app with the OpenAI environment variables above.
2. Load the home page once so the shared live card can be populated.
3. Call the protected generator from a trusted server or terminal:

```bash
curl -X POST http://localhost:3000/api/admin/generate-highlights \
  -H "Authorization: Bearer $AI_HIGHLIGHT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"batchSize":5}'
```

4. Browse a selected bout on the home page, or inspect the read-only endpoint:

```text
GET /api/highlights?bashoId=<id>&day=<day>&division=<division>&east=<nskId>&west=<nskId>
```

The generator intentionally waits until a complete daily card is available. Already-current highlights are reused unless generation is explicitly forced.

## Included sample data

The repository includes reproducible, non-secret project data for judging and local inspection:

- `data/ratings-latest.json` — current rating summary
- `data/model-evaluation.json` — held-out forecast evaluation
- `data/era-rankings.json` — experimental across-era index
- `data/featured-risers.json` — featured rating movers
- `public/rating-model-v2/` — per-basho historical rating snapshots
- `public/rating-seed/` — compressed seed data for hosted import

## Useful project commands

```bash
npm run ratings:build   # rebuild the historical rating dataset
npm run ratings:lab     # rebuild model-evaluation assets
npm run ratings:audit   # audit the imported rating data
npm run db:generate     # generate a migration after a schema change
```

Large rebuilds are not required to run the submitted application because the generated datasets are included in the repository.

## Data, attribution, and limitations

Bout, banzuke, and wrestler-profile information is attributed to the [Japan Sumo Association](https://www.sumo.or.jp/). Sumo Biyori is an unofficial fan project and is not endorsed by the Association.

Ratings, forecasts, the across-era index, and AI commentary are independent estimates intended to enrich viewing. They are not official results and must not be used for gambling or financial decisions. Cross-era scores measure dominance relative to a wrestler's recorded contemporaries; they do not prove the result of a hypothetical bout between eras.

The repository does not redistribute source-page HTML or profile images. Third-party names, marks, and source data remain the property of their respective owners.

## Repository map

```text
app/                 UI, routes, prediction service, and AI integration
db/                  D1 schema and shared-cache access
drizzle/             versioned database migrations
worker/              Cloudflare Worker entry and scheduled generation sweep
scripts/             rating, evaluation, import, and name-enrichment pipelines
data/                generated research and display assets
public/               historical snapshots and visual assets
tests/                rendering, rating, model, and integration tests
docs/ai-highlights.md detailed AI-generation notes
```

## Further documentation

- [AI highlight generation](./docs/ai-highlights.md)
- [OpenAI GPT-5.6 guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)
- [Codex documentation](https://learn.chatgpt.com/docs)

## License

The original source code in this repository is released under the [MIT License](./LICENSE), Copyright © 2026 Naruse0208.

The MIT License applies to the project source code only. Third-party names, marks, source data, and other externally owned materials remain subject to their respective rights and terms.

## Disclaimer

This is an unofficial, non-commercial fan and research project created for OpenAI Build Week. No API key, secret, or private user data is included in the repository.
