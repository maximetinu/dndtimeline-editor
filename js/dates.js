// js/dates.js
const MIN_PER_DAY = 1440;
function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z) {
  z += 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: y + (m <= 2 ? 1 : 0), month: m, day: d };
}
const BASE = daysFromCivil(1, 1, 1);
export function minutesToYMD(min) { return civilFromDays(BASE + Math.round(min / MIN_PER_DAY)); }
export function ymdToMinutes(y, m, d) { return (daysFromCivil(y, m, d) - BASE) * MIN_PER_DAY; }
export function yearLabel(year) { return year > 0 ? `${year} CE` : `${1 - year} BCE`; }
export function dateText(min) { return yearLabel(minutesToYMD(min).year); }
export function relativeLabel(prevMin, curMin) {
  if (prevMin == null) return "";
  const a = minutesToYMD(prevMin), b = minutesToYMD(curMin);
  let years = b.year - a.year;
  if (b.month < a.month || (b.month === a.month && b.day < a.day)) years -= 1;
  if (years >= 1) return `${years} year${years === 1 ? "" : "s"} later`;
  const days = Math.round((curMin - prevMin) / MIN_PER_DAY);
  if (days === 0) return "same day";
  return `${days} day${days === 1 ? "" : "s"} later`;
}
