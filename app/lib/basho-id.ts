const REIWA_OFFSET = 2018;
const HEISEI_OFFSET = 1988;
const SHOWA_OFFSET = 1925;

export function calendarBashoIdFromDayHead(dayHead?: string): number | null {
  if (!dayHead) return null;
  const match = dayHead.match(/(令和|平成|昭和)\s*(\d+|元)年\s*(\d{1,2})月/);
  if (!match) return null;
  const eraYear = match[2] === "元" ? 1 : Number(match[2]);
  const month = Number(match[3]);
  const offset = match[1] === "令和" ? REIWA_OFFSET : match[1] === "平成" ? HEISEI_OFFSET : SHOWA_OFFSET;
  const year = offset + eraYear;
  return year >= 1958 && month >= 1 && month <= 12 ? year * 100 + month : null;
}

export function normalizeCalendarBashoId(
  bashoId: number | undefined,
  dayHead?: string,
): { bashoId?: number; officialBashoId?: number } {
  const calendarId = calendarBashoIdFromDayHead(dayHead);
  if (calendarId) {
    return {
      bashoId: calendarId,
      officialBashoId: bashoId && bashoId !== calendarId ? bashoId : undefined,
    };
  }
  return bashoId && bashoId >= 195801 ? { bashoId } : { officialBashoId: bashoId };
}
