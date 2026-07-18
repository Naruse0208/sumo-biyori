import nameData from "../../data/rikishi-names.json";

const names = nameData.names as Record<string, string>;

export function japaneseRikishiName(wrestlerId: number, storedName: string | null) {
  return storedName?.trim() || names[String(wrestlerId)] || null;
}

export function rikishiProfilePath(wrestlerId: number) {
  return `/rikishi/${wrestlerId}`;
}

export function officialRikishiProfile(nskId: number | null) {
  return nskId
    ? `https://www.sumo.or.jp/ResultRikishiData/profile/${nskId}/`
    : null;
}

