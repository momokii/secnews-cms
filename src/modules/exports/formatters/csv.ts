import { Transform, type TransformCallback } from "node:stream";
import { stringify as stringifyRecords } from "csv-stringify/sync";

/**
 * CSV export formatter — a writable-in-objects / readable-as-text Transform
 * the export service can pipe DB row streams into. Each row's nested arrays
 * and objects (ticket sources/iocs, feed raw payload, …) collapse into
 * JSON-stringified columns; after the data rows the stream appends a
 * status-breakdown trailer (blank line, `status,count` header, one line per
 * status sorted count-desc then name-asc). Rows of one export share the
 * read-side detail shape (see ../schema.ts), so the leading header row comes
 * from the first row's keys.
 */

export type CsvFormatterRow = Record<string, unknown>;

const STATUS_FIELD = "status";

/** Nested values become JSON strings; null/undefined become empty cells;
 * scalars pass through to csv-stringify's casting. */
function flattenRow(row: CsvFormatterRow): CsvFormatterRow {
  const flat: CsvFormatterRow = {};
  for (const [key, value] of Object.entries(row)) {
    flat[key] =
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : value;
  }
  return flat;
}

function statusBreakdownTrailer(counts: ReadonlyMap<string, number>): string {
  const entries = [...counts.entries()].sort(
    ([statusA, countA], [statusB, countB]) =>
      countB - countA || (statusA < statusB ? -1 : 1),
  );
  return stringifyRecords([[STATUS_FIELD, "count"], ...entries]);
}

export class CsvFormatterStream extends Transform {
  readonly #statusCounts = new Map<string, number>();
  #rowsSeen = 0;
  #headerPending = true;

  constructor() {
    super({ writableObjectMode: true });
  }

  override _transform(
    row: CsvFormatterRow,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const status = row[STATUS_FIELD];
    if (typeof status === "string") {
      this.#statusCounts.set(status, (this.#statusCounts.get(status) ?? 0) + 1);
    }
    // JSON.stringify can throw (cyclic payload); the callback must hear about
    // it or the pipeline would hang instead of erroring.
    try {
      this.push(stringifyRecords([flattenRow(row)], { header: this.#headerPending }));
      this.#headerPending = false;
      this.#rowsSeen += 1;
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (this.#rowsSeen > 0) {
      this.push("\n");
    }
    this.push(statusBreakdownTrailer(this.#statusCounts));
    callback();
  }
}

export function createCsvFormatter(): CsvFormatterStream {
  return new CsvFormatterStream();
}
