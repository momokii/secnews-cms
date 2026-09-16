/** NDJSON export serialization: one JSON line per row, then a trailing meta
 * line carrying the row count and the per-status breakdown. Both export row
 * shapes (TicketExportRow, FeedExportRow) are statused, so the generic bound
 * `{ status: string }` covers every export type. Each line, meta included,
 * is newline-terminated — the standard NDJSON wire shape. */

import { Transform, type TransformCallback } from "node:stream";

export interface NdjsonMeta {
  readonly rowCount: number;
  readonly byStatus: Readonly<Record<string, number>>;
}

const META_KEY = "meta";

export function formatNdjson<T extends { readonly status: string }>(rows: readonly T[]): string {
  // byStatus is a builder accumulator; mutation is its documented purpose.
  const byStatus: Record<string, number> = {};
  const lines = rows.map((row) => {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    return JSON.stringify(row);
  });
  const meta: NdjsonMeta = { rowCount: rows.length, byStatus };
  lines.push(JSON.stringify({ [META_KEY]: meta }));
  return `${lines.join("\n")}\n`;
}

/** Streaming twin of formatNdjson: an object-mode Transform the export flow
 * pipes row iterables into. Serializes each row on arrival (memory stays
 * bounded by the window, not the row count) and appends the meta line on
 * flush. Emits exactly the bytes formatNdjson would for the same rows. */
export class NdjsonFormatterStream extends Transform {
  readonly #byStatus: Record<string, number> = {};
  #rowCount = 0;

  constructor() {
    super({ writableObjectMode: true });
  }

  override _transform(
    row: { readonly status: string },
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    // JSON.stringify can throw (cyclic payload); the callback must hear about
    // it or the pipeline would hang instead of erroring.
    try {
      this.#byStatus[row.status] = (this.#byStatus[row.status] ?? 0) + 1;
      this.#rowCount += 1;
      this.push(`${JSON.stringify(row)}\n`);
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    const meta: NdjsonMeta = { rowCount: this.#rowCount, byStatus: this.#byStatus };
    this.push(`${JSON.stringify({ [META_KEY]: meta })}\n`);
    callback();
  }
}

export function createNdjsonFormatter(): NdjsonFormatterStream {
  return new NdjsonFormatterStream();
}
