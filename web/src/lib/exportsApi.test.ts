import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToken, setToken } from "./tokenStore";
import {
  createExport,
  listExportAudits,
  parseContentDisposition,
} from "./exportsApi";

function routeFetch(
  routes: Array<{
    match: (url: string, method: string) => boolean;
    respond: () => Response | Promise<Response>;
  }>,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const route = routes.find((candidate) => candidate.match(url, method));
    if (route === undefined) throw new Error(`Unexpected fetch: ${method} ${url}`);
    return route.respond();
  });
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>): {
  url: string;
  init: RequestInit;
} {
  const call = fetchMock.mock.calls.at(-1);
  if (call === undefined) throw new Error("fetch was never called");
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

const auditRow = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  actorId: "11111111-1111-4111-8111-111111111111",
  actorName: "Admin",
  type: "FEED",
  format: "CSV",
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-09-15T23:59:59.999Z",
  status: "SUCCESS",
  rowCount: 12,
  error: null,
  createdAt: "2026-09-15T10:00:00.000Z",
};

describe("EXP-EXPORT-01: createExport posts body and parses download headers", () => {
  beforeEach(() => {
    localStorage.clear();
    setToken("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("POSTs {format, from, to} to /exports/feeds and parses Content-Disposition filename*", async () => {
    // Given: the export endpoint answers with a blob + RFC 5987 Content-Disposition
    const disposition = "attachment; filename*=UTF-8''export-feed-2026-09-01-2026-09-15.csv";
    const fetchMock = routeFetch([
      {
        match: (url, method) => url === "/api/exports/feeds" && method === "POST",
        respond: () =>
          new Response("a,b\n1,2", {
            status: 200,
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": disposition,
            },
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: createExport requests a FEED CSV export with a date window
    const result = await createExport("FEED", {
      format: "CSV",
      from: "2026-09-01",
      to: "2026-09-15",
    });

    // Then: the request is POST /api/exports/feeds with the JSON body and the filename is decoded
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("/api/exports/feeds");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ format: "CSV", from: "2026-09-01", to: "2026-09-15" }),
    );
    expect(result.filename).toBe("export-feed-2026-09-01-2026-09-15.csv");
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(await result.blob.text()).toBe("a,b\n1,2");
  });

  it("POSTs to /exports/tickets for TICKET exports and falls back to quoted filename", async () => {
    // Given: a TICKET JSON export with a legacy quoted filename
    const fetchMock = routeFetch([
      {
        match: (url, method) => url === "/api/exports/tickets" && method === "POST",
        respond: () =>
          new Response('{"id":"1"}', {
            status: 200,
            headers: {
              "Content-Type": "application/x-ndjson",
              "Content-Disposition": 'attachment; filename="export-ticket-all-all.ndjson"',
            },
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: createExport requests a TICKET JSON export without bounds
    const result = await createExport("TICKET", { format: "JSON" });

    // Then: the request hits /api/exports/tickets and the quoted filename is used
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("/api/exports/tickets");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ format: "JSON" }));
    expect(result.filename).toBe("export-ticket-all-all.ndjson");
    expect(result.contentType).toBe("application/x-ndjson");
  });

  it("decodes percent-encoded filename* and falls back to default when header is absent", async () => {
    // Given: an XLSX export whose Content-Disposition is percent-encoded, and one with no header
    const encoded = encodeURIComponent("export-feed-all-all.xlsx");
    const fetchWithEncoded = routeFetch([
      {
        match: (url, method) => url === "/api/exports/feeds" && method === "POST",
        respond: () =>
          new Response("xlsx", {
            status: 200,
            headers: {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
            },
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchWithEncoded);

    // When: createExport fetches with an encoded disposition
    const withHeader = await createExport("FEED", { format: "XLSX" });

    // Then: the filename is decoded
    expect(withHeader.filename).toBe("export-feed-all-all.xlsx");

    // When: the endpoint omits Content-Disposition
    const fetchWithoutHeader = routeFetch([
      {
        match: (url, method) => url === "/api/exports/feeds" && method === "POST",
        respond: () =>
          new Response("csv", {
            status: 200,
            headers: { "Content-Type": "text/csv; charset=utf-8" },
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchWithoutHeader);
    const fallback = await createExport("FEED", { format: "CSV" });

    // Then: the default filename for the format is used
    expect(fallback.filename).toBe("export-feed.csv");
  });

  it("parseContentDisposition handles extended, quoted, bare and missing headers", () => {
    // Given / When / Then: the parser covers the variants seen in the wild
    expect(parseContentDisposition("attachment; filename*=UTF-8''export-feed-all-all.csv")).toBe(
      "export-feed-all-all.csv",
    );
    expect(parseContentDisposition('attachment; filename="my export.csv"')).toBe("my export.csv");
    expect(parseContentDisposition("attachment; filename=my-export.csv")).toBe("my-export.csv");
    expect(parseContentDisposition(null)).toBeNull();
    expect(parseContentDisposition("")).toBeNull();
  });
});

describe("EXP-AUDIT-01: listExportAudits pagination and filters", () => {
  beforeEach(() => {
    localStorage.clear();
    setToken("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("GETs /exports/audit with page, pageSize and all filter params", async () => {
    // Given: the audit endpoint answers with a paginated envelope
    const fetchMock = routeFetch([
      {
        match: (url, method) => url.startsWith("/api/exports/audit") && method === "GET",
        respond: () =>
          new Response(
            JSON.stringify({ items: [auditRow], total: 1, page: 2, pageSize: 20 }),
            { status: 200 },
          ),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: listExportAudits is called with type, format, status, from, to and page
    const result = await listExportAudits({
      page: 2,
      type: "FEED",
      format: "CSV",
      status: "SUCCESS",
      from: "2026-09-01",
      to: "2026-09-15",
    });

    // Then: the request carries every filter and the envelope is returned
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = lastCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toBe(
      "/api/exports/audit?page=2&pageSize=20&type=FEED&format=CSV&status=SUCCESS&from=2026-09-01&to=2026-09-15",
    );
    expect(result).toEqual({ items: [auditRow], total: 1, page: 2, pageSize: 20 });
  });

  it("omits undefined filters and defaults page/pageSize", async () => {
    // Given: a stubbed audit list
    const fetchMock = routeFetch([
      {
        match: (url, method) => url.startsWith("/api/exports/audit") && method === "GET",
        respond: () =>
          new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), {
            status: 200,
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: listExportAudits is called with no filters
    await listExportAudits({});

    // Then: only the default pagination is sent
    const { url } = lastCall(fetchMock);
    expect(url).toBe("/api/exports/audit?page=1&pageSize=20");
  });

  it("passes custom pageSize and type-only filter", async () => {
    // Given: a stubbed audit list
    const fetchMock = routeFetch([
      {
        match: (url, method) => url.startsWith("/api/exports/audit") && method === "GET",
        respond: () =>
          new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), {
            status: 200,
          }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: listing audits for tickets at a custom page size
    await listExportAudits({ type: "TICKET", page: 1, pageSize: 50 });

    // Then: the query string reflects the narrow filter
    const { url } = lastCall(fetchMock);
    expect(url).toBe("/api/exports/audit?page=1&pageSize=50&type=TICKET");
  });
});
