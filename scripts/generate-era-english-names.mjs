import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const era = JSON.parse(fs.readFileSync(path.join(root, "data", "era-rankings.json"), "utf8"));
const wanted = new Set(era.ranking.map((row) => Number(row.id)));
const names = {};

for (const filename of fs.readdirSync(path.join(root, "public", "rating-seed"))) {
  if (!/^wrestlers-.*\.json\.gz$/.test(filename)) continue;
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, "public", "rating-seed", filename))));
  for (const row of rows) {
    const id = Number(row[0]);
    if (wanted.has(id) && row[4]) names[id] = String(row[4]);
  }
}

fs.writeFileSync(
  path.join(root, "data", "era-english-names.json"),
  `${JSON.stringify({ names }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${Object.keys(names).length} era-index English names.`);
