export type Locale = "ja" | "en";

export const LOCALE_COOKIE = "sumo_biyori_locale";

export function normalizeLocale(value: string | null | undefined): Locale {
  return value?.toLowerCase().startsWith("en") ? "en" : "ja";
}

export const divisionEnglish: Record<number, string> = {
  1: "Makuuchi",
  2: "Juryo",
  3: "Makushita",
  4: "Sandanme",
  5: "Jonidan",
  6: "Jonokuchi",
};

export function englishBashoLabel(bashoId: number | null | undefined, japaneseLabel?: string | null) {
  const japaneseMatch = japaneseLabel?.match(/令和([元〇零一二三四五六七八九十]+)年\s*([〇零一二三四五六七八九十]+)月場所/);
  const year = japaneseMatch ? 2018 + parseKanjiNumber(japaneseMatch[1]) : bashoId ? Math.floor(bashoId / 100) : 0;
  const month = japaneseMatch ? parseKanjiNumber(japaneseMatch[2]) : bashoId ? bashoId % 100 : 0;
  if (!year || month < 1 || month > 12) return "Grand Sumo Tournament";
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "Asia/Tokyo" })
    .format(new Date(Date.UTC(2020, month - 1, 1)));
  return `${monthLabel} ${year} Tournament`;
}

export function englishDayLabel(day: number | null | undefined) {
  return day ? `Day ${day}` : "";
}

export function englishScore(score: string) {
  const match = score.match(/(\d+)勝(\d+)敗/);
  return match ? `${match[1]}–${match[2]}` : score;
}

const kimariteEnglish: Record<string, string> = {
  "押し出し": "Oshidashi",
  "押し倒し": "Oshitaoshi",
  "寄り切り": "Yorikiri",
  "寄り倒し": "Yoritaoshi",
  "突き出し": "Tsukidashi",
  "突き倒し": "Tsukitaoshi",
  "上手投げ": "Uwatenage",
  "下手投げ": "Shitatenage",
  "掬い投げ": "Sukuinage",
  "小手投げ": "Kotenage",
  "引き落とし": "Hikiotoshi",
  "叩き込み": "Hatakikomi",
  "突き落とし": "Tsukiotoshi",
  "送り出し": "Okuridashi",
  "送り倒し": "Okuritaoshi",
  "肩透かし": "Katasukashi",
  "とったり": "Tottari",
  "切り返し": "Kirikaeshi",
  "浴びせ倒し": "Abisetaoshi",
  "不戦勝": "Fusen",
};

export function englishTechnique(technique: string | null | undefined) {
  if (!technique) return "Result";
  return kimariteEnglish[technique] ?? technique;
}

export function englishRank(rank: string, divisionName = "") {
  const side = rank.match(/^(東|西)[・\s]?/)?.[1];
  const sideLabel = side === "東" ? "East " : side === "西" ? "West " : "";
  let value = rank.replace(/^(東|西)[・\s]?/, "");
  if (divisionName && value.startsWith(divisionName)) value = value.slice(divisionName.length);
  const rankNames: Array<[RegExp, string]> = [
    [/^横綱$/, "Yokozuna"],
    [/^大関$/, "Ozeki"],
    [/^関脇$/, "Sekiwake"],
    [/^小結$/, "Komusubi"],
    [/^前頭/, "Maegashira "],
    [/^十両/, "Juryo "],
    [/^幕下/, "Makushita "],
    [/^三段目/, "Sandanme "],
    [/^序二段/, "Jonidan "],
    [/^序ノ口/, "Jonokuchi "],
  ];
  for (const [pattern, label] of rankNames) {
    if (pattern.test(value)) {
      const translated = value.replace(pattern, label)
        .replace(/筆頭/, "1")
        .replace(/([一二三四五六七八九十百〇零]+)枚目/g, (_, number: string) => String(parseKanjiNumber(number)));
      return `${sideLabel}${translated}`.trim();
    }
  }
  const translated = value
    .replace(/筆頭/, "1")
    .replace(/([一二三四五六七八九十百〇零]+)枚目/g, (_, number: string) => String(parseKanjiNumber(number)));
  return `${sideLabel}${translated || "—"}`.trim();
}

export function englishRankAbbreviated(rank: string, divisionName = "") {
  return englishRank(rank, divisionName)
    .replace(/^East\s+/, "E ")
    .replace(/^West\s+/, "W ")
    .replace(/\bYokozuna\b/, "Y")
    .replace(/\bOzeki\b/, "O")
    .replace(/\bSekiwake\b/, "S")
    .replace(/\bKomusubi\b/, "K")
    .replace(/\bMaegashira\b/, "M")
    .replace(/\bJuryo\b/, "J")
    .replace(/\bMakushita\b/, "Ms")
    .replace(/\bSandanme\b/, "Sd")
    .replace(/\bJonidan\b/, "Jd")
    .replace(/\bJonokuchi\b/, "Jk");
}

function parseKanjiNumber(value: string) {
  if (value === "元") return 1;
  const digits: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0;
  let current = 0;
  for (const character of value) {
    if (character === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (character === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else {
      current = digits[character] ?? current;
    }
  }
  return total + current;
}
