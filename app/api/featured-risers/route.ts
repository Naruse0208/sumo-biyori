import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type RuntimeEnv = { DB: D1Database };
type RiserRow = {
  id: number;
  nskId: number | null;
  name: string | null;
  shikonaEn: string;
  heya: string | null;
  rank: string;
  division: number;
  rating: number;
  previousRating: number;
  delta: number;
  rdTenths: number | null;
};

export async function GET() {
  const database = (env as unknown as RuntimeEnv).DB;
  try {
    const bashoRows = await database.prepare(`SELECT DISTINCT basho_id AS bashoId FROM rating_snapshots
      WHERE glicko_rating IS NOT NULL ORDER BY basho_id DESC LIMIT 2`).all<{ bashoId: number }>();
    const [latestBasho, previousBasho] = (bashoRows.results ?? []).map((row) => row.bashoId);
    if (!latestBasho || !previousBasho) return Response.json({ rows: [] });
    const result = await database.prepare(`SELECT current.wrestler_id AS id, w.nsk_id AS nskId,
      w.shikona_jp AS name, w.shikona_en AS shikonaEn, w.heya,
      be.rank, current.division, current.glicko_rating AS rating,
      previous.glicko_rating AS previousRating,
      current.glicko_rating - previous.glicko_rating AS delta,
      current.glicko_rd_tenths AS rdTenths
      FROM rating_snapshots current
      JOIN rating_snapshots previous ON previous.wrestler_id = current.wrestler_id AND previous.basho_id = ?
      JOIN wrestlers w ON w.id = current.wrestler_id
      JOIN banzuke_entries be ON be.basho_id = current.basho_id
        AND be.wrestler_id = current.wrestler_id AND be.division = current.division
      WHERE current.basho_id = ? AND current.division <= 3 AND current.glicko_rating IS NOT NULL
      ORDER BY delta DESC, current.glicko_rating DESC LIMIT 5`)
      .bind(previousBasho, latestBasho).all<RiserRow>();
    return Response.json({
      latestBasho,
      previousBasho,
      rows: (result.results ?? []).map((row, index) => ({
        ...row,
        position: index + 1,
        profileUrl: `/rikishi/${row.id}`,
      })),
    }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Featured ratings unavailable" }, { status: 503 });
  }
}
