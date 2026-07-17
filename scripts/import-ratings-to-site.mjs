import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(ROOT, "public", "rating-seed", "manifest.json"), "utf8"));
const siteUrl = process.env.RATINGS_SITE_URL;
const token = process.env.RATINGS_IMPORT_TOKEN;
const sitesToken = process.env.RATINGS_SITES_AUTH_TOKEN;
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
  });
  if (response.ok) return response.json();
  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    return request(url, options, attempt + 1);
  }
  throw new Error(`${response.status}: ${await response.text()}`);
}

const endpoint = `${siteUrl.replace(/\/$/, "")}/api/admin/import-ratings`;
for (const [index, batch] of manifest.batches.entries()) {
  let result;
  try {
    result = await request(endpoint, { method: "POST", body: JSON.stringify(batch) });
  } catch (error) {
    throw new Error(`Batch ${index + 1}/${manifest.batches.length} ${batch.file} failed`, { cause: error });
  }
  if ((index + 1) % 20 === 0 || index === manifest.batches.length - 1) {
    console.log(`${index + 1}/${manifest.batches.length} batches (${result.table ?? batch.table})`);
  }
}
console.log(await request(endpoint));
