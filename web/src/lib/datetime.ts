/** All timestamps render in the newsroom's local zone (WIB), never the
 * viewer's browser zone, so triage rows read identically for every editor. */

export const TIME_ZONE = "Asia/Jakarta";

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
