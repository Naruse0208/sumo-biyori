import { env } from "cloudflare:workers";

export type OfficialNameEntry = {
  nskId: number;
  shikonaJp: string;
};

type OfficialNameRow = {
  nsk_id: number;
  shikona_jp: string;
};

export async function readOfficialNames(nskIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(nskIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length || !env.DB) return new Map();

  try {
    const placeholders = ids.map(() => "?").join(",");
    const result = await env.DB
      .prepare(`SELECT nsk_id, shikona_jp FROM official_name_cache WHERE nsk_id IN (${placeholders})`)
      .bind(...ids)
      .all<OfficialNameRow>();
    return new Map((result.results ?? []).map((row) => [Number(row.nsk_id), row.shikona_jp]));
  } catch {
    return new Map();
  }
}
export async function saveOfficialNames(entries: OfficialNameEntry[]): Promise<void> {
  if (!env.DB) return;
  const unique = new Map<number, string>();
  for (const entry of entries) {
    if (Number.isInteger(entry.nskId) && entry.nskId > 0 && entry.shikonaJp.trim()) {
      unique.set(entry.nskId, entry.shikonaJp.trim());
    }
  }
  if (!unique.size) return;

  try {
    await env.DB.batch(
      [...unique].map(([nskId, shikonaJp]) =>
        env.DB
          .prepare(
            `INSERT INTO official_name_cache (nsk_id, shikona_jp, profile_url)
             VALUES (?, ?, ?)
             ON CONFLICT(nsk_id) DO UPDATE SET
               shikona_jp = excluded.shikona_jp,
               profile_url = excluded.profile_url,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(nskId, shikonaJp, `https://www.sumo.or.jp/ResultRikishiData/profile/${nskId}/`),
      ),
    );
  } catch {
    // The live result remains usable even if the durable cache is temporarily unavailable.
  }
}
