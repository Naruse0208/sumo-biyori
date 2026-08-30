const SITE_URL = (process.env.DAILY_UPDATE_SITE_URL ?? "https://dohyo-biyori.uwaaaan.chatgpt.site").replace(/\/$/, "");
const TOKEN = process.env.DAILY_UPDATE_TOKEN?.trim();
const forced = process.argv.includes("--force");

if (!TOKEN) throw new Error("DAILY_UPDATE_TOKEN is required in .env.local");

function tokyoClock() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, hour: Number(read("hour")) };
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${SITE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(240_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body.error ?? body.reason ?? "request failed"}`);
  return body;
}

const clock = tokyoClock();
if (!forced && (clock.hour < 5 || clock.hour >= 11)) {
  console.log(`No action outside the 05:00–10:59 JST generation window (${clock.hour}:xx JST)`);
  process.exit(0);
}

await fetch(`${SITE_URL}/api/live-sumo`, { signal: AbortSignal.timeout(120_000) }).then((response) => {
  if (!response.ok) throw new Error(`Live cache refresh failed: ${response.status}`);
});

const status = await jsonRequest("/api/admin/daily-update");
if (forced || status.dateKey !== clock.date) {
  const update = await jsonRequest("/api/admin/daily-update", { method: "POST", body: "{}" });
  console.log(`Ratings updated: ${update.bashoId}, through day ${update.completedDay}, ${update.snapshots} wrestlers`);
} else {
  console.log(`Ratings already updated today: ${status.bashoId}, through day ${status.completedDay}`);
}

const highlights = await jsonRequest("/api/admin/generate-highlights", {
  method: "POST",
  body: JSON.stringify({ batchSize: 5 }),
});
console.log(`Highlights: ${highlights.generated} generated, ${highlights.fallback} fallback, ${highlights.remaining} remaining`);
