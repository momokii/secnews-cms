import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { formatXlsx } from "../src/modules/exports/formatters/xlsx.js";

async function readWorkbook(
  exportStream: Readable,
): Promise<ExcelJS.Workbook> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of exportStream) {
    chunks.push(Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : new TextEncoder().encode(String(chunk)));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(chunks));
  return workbook;
}

describe("formatXlsx", () => {
  it("writes feed items and a status breakdown to separate sheets", async () => {
    // Given: feed rows streamed as an async iterable
    const rows = Readable.from([
      { id: "f-1", title: "Phishing alert", status: "NEW", raw: { source: "rss" } },
      { id: "f-2", title: "Patch release", status: "REVIEW", raw: null },
    ]);

    // When: the feed export is formatted
    const workbook = await readWorkbook(
      await formatXlsx({ type: "FEED", rows, breakdown: { NEW: 1, REVIEW: 1 } }),
    );

    // Then: the workbook contains readable data and summary sheets
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Feed Items",
      "Breakdown",
    ]);
    expect(workbook.getWorksheet("Feed Items")?.getRow(2).values).toEqual([
      ,
      "f-1",
      "Phishing alert",
      "NEW",
      '{"source":"rss"}',
    ]);
    expect(workbook.getWorksheet("Breakdown")?.getRow(2).values).toEqual([, "NEW", 1]);
  });

  it("splits ticket rows, activities, audits and breakdown into their sheets", async () => {
    // Given: a ticket stream with nested activity and delivery audit history
    const rows = Readable.from([
      {
        id: "t-1",
        title: "Investigate IOC",
        status: "OPEN",
        activities: [{ id: "a-1", action: "CREATED", detail: "Ingested" }],
        deliveryAudits: [{ id: "d-1", status: "SENT", channel: "EMAIL" }],
      },
    ]);

    // When: the ticket export is formatted
    const workbook = await readWorkbook(
      await formatXlsx({ type: "TICKET", rows, breakdown: { OPEN: 1 } }),
    );

    // Then: each ticket concern has a dedicated sheet and ticketId links history
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Tickets",
      "Activities",
      "Audits",
      "Breakdown",
    ]);
    expect(workbook.getWorksheet("Tickets")?.getRow(1).values).toEqual([, "id", "title", "status"]);
    expect(workbook.getWorksheet("Activities")?.getRow(2).values).toEqual([
      ,
      "t-1",
      "a-1",
      "CREATED",
      "Ingested",
    ]);
    expect(workbook.getWorksheet("Audits")?.getRow(2).values).toEqual([, "t-1", "d-1", "SENT", "EMAIL"]);
  });
});
