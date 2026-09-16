import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { createCsvFormatter, type CsvFormatterRow } from "../src/modules/exports/formatters/csv.js";

/** CSV export formatter: flattens nested arrays/objects to JSON-stringified
 * columns and appends a status-breakdown trailer after the data rows. Pure
 * unit tests — no DB. */

async function formatCsv(rows: readonly CsvFormatterRow[]): Promise<string> {
  const chunks: string[] = [];
  await pipeline(
    Readable.from(rows),
    createCsvFormatter(),
    async function* (source: AsyncIterable<unknown>) {
      for await (const chunk of source) {
        chunks.push(String(chunk));
      }
    },
  );
  return chunks.join("");
}

describe("createCsvFormatter", () => {
  it("is a Transform stream (pipe-able)", () => {
    expect(createCsvFormatter()).toBeInstanceOf(Transform);
  });

  it("formats a flat row as a header plus values in field order", async () => {
    // Given: a single ticket-shaped row with only scalar fields
    const row = { id: "t-1", title: "Ticket one", status: "OPEN", pendingSuggestions: 0 };

    // When: the row is formatted
    const out = await formatCsv([row]);

    // Then: header comes from the first row's keys; the trailer follows after
    // a blank separator line and counts the single OPEN row
    expect(out).toBe(
      "id,title,status,pendingSuggestions\n" +
        "t-1,Ticket one,OPEN,0\n" +
        "\n" +
        "status,count\n" +
        "OPEN,1\n",
    );
  });

  it("flattens nested arrays to JSON-stringified columns", async () => {
    // Given: a ticket row carrying array fields and nested sources/iocs
    const row = {
      id: "t-2",
      status: "RESEARCH",
      cveIds: ["CVE-2026-1234", "CVE-2026-5678"],
      references: ["https://example.com/a"],
      sources: [{ id: "s-1", url: "https://example.com/src" }],
      iocs: [{ type: "IPV4", value: "1.2.3.4" }],
    };

    // When: the row is formatted
    const out = await formatCsv([row]);

    // Then: each array becomes a JSON string cell (CSV-quoted)
    expect(out).toBe(
      "id,status,cveIds,references,sources,iocs\n" +
        't-2,RESEARCH,"[""CVE-2026-1234"",""CVE-2026-5678""]","[""https://example.com/a""]",' +
        '"[{""id"":""s-1"",""url"":""https://example.com/src""}]",' +
        '"[{""type"":""IPV4"",""value"":""1.2.3.4""}]"\n' +
        "\n" +
        "status,count\n" +
        "RESEARCH,1\n",
    );
  });

  it("flattens the feed raw payload object to a JSON-stringified column", async () => {
    // Given: a feed export row whose verbatim raw payload is a nested object
    const row = {
      id: "f-1",
      status: "NEW",
      raw: { event: "alert", tags: ["phishing"] },
    };

    // When: the row is formatted
    const out = await formatCsv([row]);

    // Then: the object is serialized as one JSON string cell
    expect(out).toBe(
      "id,status,raw\n" +
        'f-1,NEW,"{""event"":""alert"",""tags"":[""phishing""]}"\n' +
        "\n" +
        "status,count\n" +
        "NEW,1\n",
    );
  });

  it("serializes null and undefined fields as empty cells", async () => {
    // Given: a row with null and missing optional fields
    const row = { id: "t-3", affectedProduct: null, status: "CLOSED", threatName: undefined };

    // When: the row is formatted
    const out = await formatCsv([row]);

    // Then: both serialize to empty cells
    expect(out).toBe(
      "id,affectedProduct,status,threatName\n" +
        "t-3,,CLOSED,\n" +
        "\n" +
        "status,count\n" +
        "CLOSED,1\n",
    );
  });

  it("escapes commas, quotes and newlines inside values", async () => {
    // Given: a title containing a comma, doubled quotes and a newline
    const row = { title: 'He said "run, now"\nsecond line', status: "OPEN" };

    // When: the row is formatted
    const out = await formatCsv([row]);

    // Then: the value is quoted, quotes doubled, newline preserved in-cell
    expect(out).toBe(
      "title,status\n" +
        '"He said ""run, now""\nsecond line",OPEN\n' +
        "\n" +
        "status,count\n" +
        "OPEN,1\n",
    );
  });

  it("appends the status breakdown sorted by count desc then name asc", async () => {
    // Given: rows across four statuses with a tie between RESEARCH and SENT
    const rows: CsvFormatterRow[] = [
      { id: "1", status: "OPEN" },
      { id: "2", status: "SENT" },
      { id: "3", status: "OPEN" },
      { id: "4", status: "RESEARCH" },
    ];

    // When: the rows are formatted
    const out = await formatCsv(rows);

    // Then: the trailer lists OPEN (2) first, then the count-1 statuses
    // alphabetically
    expect(out.endsWith("\nstatus,count\nOPEN,2\nRESEARCH,1\nSENT,1\n")).toBe(true);
  });

  it("emits only the trailer for zero rows", async () => {
    // Given: no rows at all
    // When: the formatter flushes
    const out = await formatCsv([]);

    // Then: no header, no leading blank line, just the empty breakdown
    expect(out).toBe("status,count\n");
  });
});
