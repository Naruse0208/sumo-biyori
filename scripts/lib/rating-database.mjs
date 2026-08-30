import { readdir } from "node:fs/promises";
import { join } from "node:path";

export function currentOrNextBashoId(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const bashoMonth = [1, 3, 5, 7, 9, 11].find((candidate) => candidate >= month) ?? 1;
  const bashoYear = bashoMonth === 1 && month > 11 ? year + 1 : year;
  return `${bashoYear}${String(bashoMonth).padStart(2, "0")}`;
}

export async function findBestRatingDatabase(directory) {
  if (process.env.RATING_DATABASE_PATH) return join(process.cwd(), process.env.RATING_DATABASE_PATH);
  const candidates = (await readdir(directory))
    .flatMap((name) => {
      const match = name.match(/^rating-audit-(\d{6})-(\d{6})\.sqlite$/);
      return match ? [{ name, start: Number(match[1]), end: Number(match[2]) }] : [];
    })
    .sort((first, second) => second.end - first.end || first.start - second.start);
  if (!candidates.length) throw new Error("Rating audit database was not found");
  return join(directory, candidates[0].name);
}
