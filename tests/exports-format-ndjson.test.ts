import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import {
  createNdjsonFormatter,
  formatNdjson,
} from "../src/modules/exports/formatters/ndjson.js";

/** NDJSON export serialization: one JSON line per row, then a trailing meta
 * line carrying the row count and the per-status breakdown. Pure unit tests —
 * both export row shapes (TICKET, FEED) are statused, so one generic works. */

type Row = { readonly id: string; readonly status: string };

const row = (id: string, status: string): Row => ({ id, status });

const parseLine = (line: string): Record<string, unknown> =>
  JSON.parse(line) as Record<string, unknown>;

describe("formatNdjson", () => {
  it("serializes each row to exactly one JSON line, in order", () => {
    // Given: two export rows
    const rows = [row("t-1", "READY"), row("t-2", "TAKEN")];

    // When: the rows are formatted as NDJSON
    const output = formatNdjson(rows);

    // Then: every row is one parseable line, preserving order
    const lines = output.replace(/\n$/, "").split("\n");
    expect(lines).toHaveLength(3); // 2 rows + meta line
    expect(parseLine(lines[0] ?? "")).toEqual({ id: "t-1", status: "READY" });
    expect(parseLine(lines[1] ?? "")).toEqual({ id: "t-2", status: "TAKEN" });
  });

  it("appends a trailing meta line with rowCount and byStatus breakdown", () => {
    // Given: rows across three statuses, with duplicates
    const rows = [row("t-1", "READY"), row("f-1", "NEW"), row("t-2", "READY"), row("t-3", "TAKEN")];

    // When: the rows are formatted as NDJSON
    const output = formatNdjson(rows);

    // Then: the last line is the meta breakdown, and it is not a data row
    const lines = output.replace(/\n$/, "").split("\n");
    expect(lines).toHaveLength(5);
    expect(parseLine(lines[4] ?? "")).toEqual({
      meta: { rowCount: 4, byStatus: { READY: 2, NEW: 1, TAKEN: 1 } },
    });
  });

  it("produces only the meta line for an empty export", () => {
    // Given: no rows matched the export window

    // When: the empty row set is formatted
    const output = formatNdjson<Row>([]);

    // Then: a single meta line reports rowCount 0 and an empty breakdown
    expect(output.replace(/\n$/, "").split("\n")).toHaveLength(1);
    expect(parseLine(output.replace(/\n$/, ""))).toEqual({
      meta: { rowCount: 0, byStatus: {} },
    });
  });

  it("keeps rows containing newlines and quotes on a single escaped line", () => {
    // Given: a row whose title embeds newlines, quotes and a JSON-looking blob
    const rows = [row('t-1\n"quoted"', "READY"), row('{"injection": true}\nsecond line', "TAKEN")];

    // When: the rows are formatted as NDJSON
    const output = formatNdjson(rows);

    // Then: the output is still exactly one line per row plus meta
    const lines = output.replace(/\n$/, "").split("\n");
    expect(lines).toHaveLength(3);
    expect(parseLine(lines[0] ?? "")).toEqual({ id: 't-1\n"quoted"', status: "READY" });
    expect(parseLine(lines[1] ?? "")).toEqual({
      id: '{"injection": true}\nsecond line',
      status: "TAKEN",
    });
  });
});

describe("createNdjsonFormatter", () => {
  it("emits byte-identical output to formatNdjson for the same rows", async () => {
    // Given: three rows and the streaming formatter piped after them
    const rows = [row("t-1", "READY"), row("f-1", "NEW"), row("t-2", "READY")];
    const chunks: string[] = [];

    // When: the rows stream through the formatter
    await pipeline(
      Readable.from(rows),
      createNdjsonFormatter(),
      async function* (source: AsyncIterable<unknown>) {
        for await (const chunk of source) {
          chunks.push(String(chunk));
        }
      },
    );

    // Then: the streamed bytes equal the eager formatter's output
    expect(chunks.join("")).toBe(formatNdjson(rows));
  });

  it("errors the pipeline instead of hanging when a row cannot be stringified", async () => {
    // Given: a cyclic row that JSON.stringify refuses
    const cyclic: Record<string, unknown> = { status: "OPEN" };
    cyclic["self"] = cyclic;

    // When: the row is written into the formatter
    const stream = createNdjsonFormatter();
    const failure = new Promise<Error>((resolve) => {
      stream.once("error", resolve);
    });
    stream.write(cyclic);

    // Then: the write surfaces as a stream error
    const error = await failure;
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toMatch(/circular|cyclic/i);
  });
});
