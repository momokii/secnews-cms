import { PassThrough, Readable, type Readable as ReadableStream } from "node:stream";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { FastifyReply } from "fastify";
import type { ExportAuditInput } from "../src/modules/exports/audit.js";
import {
  runExport,
  type ExportDeps,
  type ExportReply,
  type ExportRow,
} from "../src/modules/exports/flow.js";

/**
 * Centralized streaming export flow: runExport wires fetcher rows through the
 * format-specific formatter into the reply sink, sets the download headers,
 * and writes one SUCCESS/FAILED audit row. Pure unit tests — fetchers, audit
 * writer and reply are fakes, no DB.
 */

type WindowArgs = readonly [
  type: string,
  from: string | undefined,
  to: string | undefined,
];

function fakeReply(): {
  readonly reply: ExportReply;
  readonly headers: Map<string, unknown>;
  readonly sent: () => unknown;
  readonly calls: string[];
} {
  const headers = new Map<string, unknown>();
  const calls: string[] = [];
  let sent: unknown;
  const reply: ExportReply = {
    header(name, value) {
      calls.push(name);
      headers.set(name, value);
      return reply;
    },
    send(payload) {
      calls.push("send");
      sent = payload;
      return reply;
    },
  };
  return { reply, headers, calls, sent: () => sent };
}

function fakeDeps(rows: AsyncIterable<ExportRow>, breakdown: Record<string, number> = {}): {
  readonly deps: ExportDeps;
  readonly audits: ExportAuditInput[];
  readonly breakdownCalls: WindowArgs[];
  readonly rowsCalls: WindowArgs[];
} {
  const audits: ExportAuditInput[] = [];
  const breakdownCalls: WindowArgs[] = [];
  const rowsCalls: WindowArgs[] = [];
  const deps: ExportDeps = {
    rows: (type, from, to) => {
      rowsCalls.push([type, from, to] as const);
      return rows;
    },
    breakdown: async (type, from, to) => {
      breakdownCalls.push([type, from, to] as const);
      return breakdown;
    },
    audit: async (input) => {
      audits.push(input);
    },
  };
  return { deps, audits, breakdownCalls, rowsCalls };
}

async function drain(stream: ReadableStream): Promise<{ readonly buffer: Buffer; readonly error?: unknown }> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
  } catch (error) {
    return { buffer: Buffer.concat(chunks), error };
  }
  return { buffer: Buffer.concat(chunks) };
}

async function* rowsThenError(row: ExportRow, error: Error): AsyncGenerator<ExportRow> {
  yield row;
  throw error;
}

async function readWorkbook(stream: ReadableStream): Promise<ExcelJS.Workbook> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(new Uint8Array(chunk as Buffer));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(chunks));
  return workbook;
}

describe("runExport", () => {
  it("streams a CSV export to the reply sink, sets download headers, audits SUCCESS", async () => {
    // Given: two ticket rows in a bounded window and recording reply/deps fakes
    const source = Readable.from([
      { id: "t-1", title: "A", status: "OPEN" },
      { id: "t-2", title: "B", status: "SENT" },
    ]);
    const fake = fakeReply();
    const { deps, audits, rowsCalls } = fakeDeps(source);

    // When: the export runs as CSV
    const done = runExport(
      { type: "TICKET", format: "CSV", from: "2026-01-01", to: "2026-01-02", actor: { id: "u-1" } },
      fake.reply,
      deps,
    );
    const { buffer } = await drain(fake.sent() as ReadableStream);
    await done;

    // Then: headers precede send, the sink carries CSV plus the breakdown
    // trailer, and one SUCCESS audit row records window and row count
    expect(fake.calls).toEqual(["Content-Type", "Content-Disposition", "send"]);
    expect(rowsCalls).toEqual([["TICKET", "2026-01-01", "2026-01-02"]]);
    expect(fake.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(fake.headers.get("Content-Disposition")).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent("export-ticket-2026-01-01-2026-01-02.csv")}`,
    );
    expect(fake.sent()).toBeInstanceOf(PassThrough);
    expect(buffer.toString("utf8")).toBe(
      "id,title,status\n" +
        "t-1,A,OPEN\n" +
        "t-2,B,SENT\n" +
        "\n" +
        "status,count\n" +
        "OPEN,1\n" +
        "SENT,1\n",
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toEqual({
      actorId: "u-1",
      type: "TICKET",
      format: "CSV",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-02T23:59:59.999Z"),
      status: "SUCCESS",
      rowCount: 2,
      error: null,
    });
  });

  it("streams NDJSON with a trailing meta line for JSON format and unbounded windows", async () => {
    // Given: feed rows with no window and a system actor (null id)
    const source = Readable.from([{ id: "f-1", status: "NEW" }, { id: "f-2", status: "TAKEN" }]);
    const { reply, headers, sent } = fakeReply();
    const { deps, audits } = fakeDeps(source);

    // When: the export runs as JSON
    await runExport({ type: "FEED", format: "JSON", actor: { id: null } }, reply, deps);
    const { buffer } = await drain(sent() as Readable);

    // Then: the ndjson wire shape holds (row lines + meta line), the filename
    // uses "all" for the missing bounds, and the audit bounds are null
    expect(headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(headers.get("Content-Disposition")).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent("export-feed-all-all.ndjson")}`,
    );
    const lines = buffer.toString("utf8").split("\n");
    expect(lines).toEqual([
      JSON.stringify({ id: "f-1", status: "NEW" }),
      JSON.stringify({ id: "f-2", status: "TAKEN" }),
      JSON.stringify({ meta: { rowCount: 2, byStatus: { NEW: 1, TAKEN: 1 } } }),
      "",
    ]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toEqual({
      actorId: null,
      type: "FEED",
      format: "JSON",
      from: null,
      to: null,
      status: "SUCCESS",
      rowCount: 2,
      error: null,
    });
  });

  it("builds the XLSX workbook through the breakdown fetcher and audits SUCCESS", async () => {
    // Given: feed rows whose summary needs the per-status breakdown fetcher
    const source = Readable.from([
      { id: "f-1", title: "Phishing alert", status: "NEW", raw: { source: "rss" } },
      { id: "f-2", title: "Patch release", status: "REVIEW", raw: null },
    ]);
    const { reply, headers, sent } = fakeReply();
    const { deps, audits, breakdownCalls } = fakeDeps(source, { NEW: 1, REVIEW: 1 });

    // When: the export runs as XLSX
    await runExport(
      { type: "FEED", format: "XLSX", from: "2026-02-01", to: "2026-02-28", actor: { id: "u-2" } },
      reply,
      deps,
    );
    const workbook = await readWorkbook(sent() as Readable);

    // Then: the workbook carries the rows and the fetched breakdown, the
    // fetcher saw the raw window strings, and the audit counts both rows
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Feed Items", "Breakdown"]);
    expect(workbook.getWorksheet("Breakdown")?.getRow(2).values).toEqual([, "NEW", 1]);
    expect(breakdownCalls).toEqual([["FEED", "2026-02-01", "2026-02-28"]]);
    expect(headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(headers.get("Content-Disposition")).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent("export-feed-2026-02-01-2026-02-28.xlsx")}`,
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toEqual({
      actorId: "u-2",
      type: "FEED",
      format: "XLSX",
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-02-28T23:59:59.999Z"),
      status: "SUCCESS",
      rowCount: 2,
      error: null,
    });
  });

  it("audits FAILED and destroys the sink when row streaming fails mid-export", async () => {
    // Given: a fetcher that yields one row then blows up
    const boom = new Error("db boom");
    const source = rowsThenError({ id: "t-1", status: "OPEN" }, boom);
    const { reply, sent } = fakeReply();
    const { deps, audits } = fakeDeps(source);

    // When: the CSV export runs to failure
    const done = runExport(
      { type: "TICKET", format: "CSV", from: "2026-01-01", to: "2026-01-02", actor: { id: "u-1" } },
      reply,
      deps,
    );
    const { error } = await drain(sent() as Readable);
    await done;

    // Then: the sink surfaces the error downstream, the run resolves (headers
    // were already sent), and one FAILED audit row carries message + count
    expect(error).toBe(boom);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      status: "FAILED",
      error: "db boom",
      rowCount: 1,
      type: "TICKET",
      format: "CSV",
    });
  });

  it("audits FAILED when the breakdown fetch fails before the workbook streams", async () => {
    // Given: an XLSX export whose breakdown fetcher rejects
    const boom = new Error("groupby boom");
    const { reply, sent } = fakeReply();
    const { deps, audits } = fakeDeps(Readable.from([{ id: "f-1", status: "NEW" }]));
    const failing: ExportDeps = {
      ...deps,
      breakdown: async () => {
        throw boom;
      },
    };

    // When: the export runs to failure
    await runExport({ type: "FEED", format: "XLSX", actor: { id: "u-3" } }, reply, failing);
    const { error } = await drain(sent() as Readable);

    // Then: the sink is destroyed with the cause and the audit records FAILED
    expect(error).toBe(boom);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      status: "FAILED",
      error: "groupby boom",
      rowCount: 0,
      format: "XLSX",
    });
  });

  it("accepts a real FastifyReply as the reply port", () => {
    // Given: the compile-time question "does FastifyReply satisfy the port?"
    type ReplyCompatibility = FastifyReply extends ExportReply ? true : false;

    // When/Then: it does — routes can pass their reply to runExport directly
    const compatible: ReplyCompatibility = true;
    expect(compatible).toBe(true);
  });
});
