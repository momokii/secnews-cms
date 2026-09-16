import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";

export type XlsxRow = Readonly<Record<string, unknown>>;
export type XlsxRows = AsyncIterable<XlsxRow> | Iterable<XlsxRow>;

export type FeedXlsxExport = {
  readonly type: "FEED";
  readonly rows: XlsxRows;
  readonly breakdown: Readonly<Record<string, number>>;
};

export type TicketXlsxExport = {
  readonly type: "TICKET";
  readonly rows: XlsxRows;
  readonly breakdown: Readonly<Record<string, number>>;
};

export type XlsxExport = FeedXlsxExport | TicketXlsxExport;

type Cell = ExcelJS.CellValue;

const HISTORY_FIELDS = ["activities", "deliveryAudits"] as const;

function cellValue(value: unknown): Cell {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  return JSON.stringify(value);
}

function rowValues(row: XlsxRow, excluded: readonly string[] = []): Cell[] {
  return Object.entries(row)
    .filter(([key]) => !excluded.includes(key))
    .map(([, value]) => cellValue(value));
}

async function addStreamingRows(
  sheet: ExcelJS.Worksheet,
  rows: XlsxRows,
  excluded: readonly string[] = [],
): Promise<void> {
  let headersWritten = false;
  for await (const row of rows) {
    if (!headersWritten) {
      sheet.addRow(Object.keys(row).filter((key) => !excluded.includes(key))).commit();
      headersWritten = true;
    }
    sheet.addRow(rowValues(row, excluded)).commit();
  }
}

function addBreakdown(sheet: ExcelJS.Worksheet, breakdown: Readonly<Record<string, number>>): void {
  sheet.addRow(["status", "count"]).commit();
  const entries = Object.entries(breakdown).sort(
    ([statusA, countA], [statusB, countB]) => countB - countA || statusA.localeCompare(statusB),
  );
  for (const [status, count] of entries) {
    sheet.addRow([status, count]).commit();
  }
}

async function writeFeed(workbook: ExcelJS.stream.xlsx.WorkbookWriter, input: FeedXlsxExport): Promise<void> {
  await addStreamingRows(workbook.addWorksheet("Feed Items"), input.rows);
  addBreakdown(workbook.addWorksheet("Breakdown"), input.breakdown);
}

async function writeTickets(
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  input: TicketXlsxExport,
): Promise<void> {
  const tickets = workbook.addWorksheet("Tickets");
  const activities = workbook.addWorksheet("Activities");
  const audits = workbook.addWorksheet("Audits");
  let ticketHeadersWritten = false;
  let activityHeadersWritten = false;
  let auditHeadersWritten = false;
  for await (const row of input.rows) {
    if (!ticketHeadersWritten) {
      tickets
        .addRow(Object.keys(row).filter((key) => key !== "activities" && key !== "deliveryAudits"))
        .commit();
      ticketHeadersWritten = true;
    }
    tickets.addRow(rowValues(row, HISTORY_FIELDS)).commit();
  const historySheets = [
    { field: "activities", sheet: activities },
    { field: "deliveryAudits", sheet: audits },
  ] as const;
  for (const { field, sheet } of historySheets) {
      const history = row[field];
      if (!Array.isArray(history)) {
        continue;
      }
      for (const entry of history) {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          continue;
        }
        const historyRow = { ticketId: row["id"], ...entry };
        if (field === "activities" && !activityHeadersWritten) {
          activities.addRow(Object.keys(historyRow)).commit();
          activityHeadersWritten = true;
        }
        if (field === "deliveryAudits" && !auditHeadersWritten) {
          audits.addRow(Object.keys(historyRow)).commit();
          auditHeadersWritten = true;
        }
        sheet.addRow(rowValues(historyRow)).commit();
      }
    }
  }
  addBreakdown(workbook.addWorksheet("Breakdown"), input.breakdown);
}

export async function formatXlsx(input: XlsxExport): Promise<PassThrough> {
  const stream = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream });
  if (input.type === "FEED") {
    await writeFeed(workbook, input);
  } else {
    await writeTickets(workbook, input);
  }
  await workbook.commit();
  return stream;
}

export function createXlsxFormatter(input: XlsxExport): Promise<PassThrough> {
  return formatXlsx(input);
}
