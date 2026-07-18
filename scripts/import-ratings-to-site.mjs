import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(ROOT, "public", "rating-seed", "manifest.json"), "utf8"));
const siteUrl = process.env.RATINGS_SITE_URL;
const token = process.env.RATINGS_IMPORT_TOKEN;
const sitesToken = process.env.RATINGS_SITES_AUTH_TOKEN;
const CONCURRENCY = Math.min(6, Math.max(1, Number(process.env.RATINGS_IMPORT_CONCURRENCY ?? 4)));
if (!siteUrl || !token) throw new Error("RATINGS_SITE_URL and RATINGS_IMPORT_TOKEN are required");

async function request(url, options = {}, attempt = 1) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(sitesToken ? { "OAI-Sites-Authorization": `Bearer ${sitesToken}` } : {}),
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(180_000),
  });
  if (response.ok) return response.json();
  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    return request(url, options, attempt + 1);
  }
  throw new Error(`${response.status}: ${await response.text()}`);
}

const endpoint = `${siteUrl.replace(/\/$/, "")}/api/admin/import-ratings`;
let completed = 0;
const groups = [];
for (const batch of manifest.batches) {
  const current = groups.at(-1);
  if (current?.table === batch.table) current.batches.push(batch);
  else groups.push({ table: batch.table, batches: [batch] });
}

for (const group of groups) {
  let cursor = 0;
  async function worker() {
    while (cursor < group.batches.length) {
      const index = cursor;
      cursor += 1;
      const batch = group.batches[index];
      try {
        await request(endpoint, { method: "POST", body: JSON.stringify(batch) });
      } catch (error) {
        throw new Error(`Batch ${completed + index + 1}/${manifest.batches.length} ${batch.file} failed`, { cause: error });
      }
      const progress = completed + index + 1;
      if (progress % 20 === 0 || progress === manifest.batches.length) {
        console.log(`${progress}/${manifest.batches.length} batches (${batch.table})`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, group.batches.length) }, () => worker()));
  completed += group.batches.length;
  console.log(`${group.table} complete (${completed}/${manifest.batches.length})`);
}
console.log(await request(endpoint));
