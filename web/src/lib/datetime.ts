/** All timestamps render in the newsroom's local zone (WIB), never the
 * viewer's browser zone, so triage rows read identically for every editor. */

export const TIME_ZONE = "Asia/Jakarta";

export interface DateRange {
  from?: string;
  to?: string;
}

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO string -> "YYYY-MM-DD HH:mm" (24h) in TIME_ZONE. */
export function formatTimestamp(iso: string): string {
  const parts = formatter.formatToParts(new Date(iso));
  const segment = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${segment("year")}-${segment("month")}-${segment("day")} ${segment("hour")}:${segment("minute")}`;
}

export function dateInJakarta(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function jakartaDayBounds(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function subtractDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function subtractMonths(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
}
