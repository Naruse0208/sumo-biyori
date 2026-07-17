import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type RuntimeEnv = {
  ASSETS: Fetcher;
  DB: D1Database;
  RATINGS_IMPORT_TOKEN?: string;
};

const insertSql: Record<string, string> = {
  wrestlers: `INSERT OR IGNORE INTO wrestlers
    (id, sumodb_id, nsk_id, shikona_jp, shikona_en, heya, birth_date, shusshin,
     height_mm, weight_kg, debut_basho_id, intai_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  basho: "INSERT OR IGNORE INTO basho (id) VALUES (?)",
  banzuke_entries: `INSERT OR REPLACE INTO banzuke_entries
    (basho_id, division, wrestler_id, side, rank, rank_value) VALUES (?, ?, ?, ?, ?, ?)`,
  bouts: `INSERT OR IGNORE INTO bouts
    (id, basho_id, division, day, wrestler_a_id, wrestler_b_id, winner_wrestler_id, kimarite,
     wrestler_a_elo_before, wrestler_b_elo_before, wrestler_a_elo_after, wrestler_b_elo_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  rating_snapshots: `INSERT OR REPLACE INTO rating_snapshots
    (wrestler_id, basho_id, division, elo, peak_elo, dohyo_score_tenths, bouts, wins, losses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  official_name_cache: `INSERT OR REPLACE INTO official_name_cache
    (nsk_id, shikona_jp, profile_url) VALUES (?, ?, ?)`,
};

function runtime(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

function authorized(request: Request) {
  const token = runtime().RATINGS_IMPORT_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const database = runtime().DB;
  const [wrestlers, bouts, snapshots, batches] = await database.batch([
    database.prepare("SELECT COUNT(*) AS count FROM wrestlers"),
    database.prepare("SELECT COUNT(*) AS count FROM bouts"),
    database.prepare("SELECT COUNT(*) AS count FROM rating_snapshots"),
    database.prepare("SELECT COUNT(*) AS count FROM rating_import_batches"),
  ]);
  return Response.json({
    wrestlers: wrestlers.results[0]?.count ?? 0,
    bouts: bouts.results[0]?.count ?? 0,
    ratingSnapshots: snapshots.results[0]?.count ?? 0,
    batches: batches.results[0]?.count ?? 0,
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { file?: string; table?: string; rows?: number };
  const table = body.table ?? "";
  const file = body.file ?? "";
  if (!insertSql[table] || !new RegExp(`^${table}-\\d{4}\\.json\\.gz$`).test(file)) {
    return Response.json({ error: "Invalid import batch" }, { status: 400 });
  }

  const database = runtime().DB;
  const checkpoint = await database
    .prepare("SELECT row_count FROM rating_import_batches WHERE batch_id = ?")
    .bind(file)
    .first<{ row_count: number }>();
  if (checkpoint) return Response.json({ file, status: "already-imported", rows: checkpoint.row_count });

  const asset = await runtime().ASSETS.fetch(new Request(new URL(`/rating-seed/${file}`, request.url)));
  if (!asset.ok || !asset.body) return Response.json({ error: "Seed asset unavailable" }, { status: 404 });
  const decompressed = asset.body.pipeThrough(new DecompressionStream("gzip"));
  const rows = await new Response(decompressed).json() as unknown[][];
  if (!Array.isArray(rows) || rows.length !== body.rows) {
    return Response.json({ error: "Seed row count mismatch" }, { status: 422 });
  }

  const statement = insertSql[table];
  for (let offset = 0; offset < rows.length; offset += 100) {
    await database.batch(rows.slice(offset, offset + 100).map((row) => database.prepare(statement).bind(...row)));
  }
  await database.prepare(`INSERT INTO rating_import_batches
    (batch_id, table_name, row_count) VALUES (?, ?, ?)`)
    .bind(file, table, rows.length)
    .run();
  return Response.json({ file, table, status: "imported", rows: rows.length });
}
