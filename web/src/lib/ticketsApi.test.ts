import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptSuggestion,
  addIoc,
  addTicketSource,
  aiEnrich,
  aiFill,
  deleteIoc,
  deleteTicketSource,
  getTicket,
  listDeliveryAudit,
  listSuggestions,
  listTickets,
  patchTicketFields,
  pushOtx,
  rejectSuggestion,
  sendTicket,
  transitionTicket,
  updateIoc,
} from "./ticketsApi";

const TICKET_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => jsonResponse({}));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (call === undefined) throw new Error("fetch was never called");
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ticketsApi: list", () => {
  it("GETs /tickets with q, status, origin, findingType and page filters", async () => {
    const fetchMock = stubFetch();
    await listTickets({
      q: "openssl",
      status: "READY",
      origin: "AUTO_FEED",
      findingType: "VULNERABILITY_CVE",
      page: 3,
    });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(
      "/api/tickets?q=openssl&status=READY&origin=AUTO_FEED&findingType=VULNERABILITY_CVE&page=3&pageSize=20",
    );
    expect(init.method).toBe("GET");
  });

  it("omits undefined filters from the query string", async () => {
    const fetchMock = stubFetch();
    await listTickets({ page: 1 });
    const { url } = lastCall(fetchMock);
    expect(url).toBe("/api/tickets?page=1&pageSize=20");
  });
});

describe("ticketsApi: detail + workflow", () => {
  it("GETs /tickets/:id", async () => {
    const fetchMock = stubFetch();
    await getTicket(TICKET_ID);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}`);
    expect(init.method).toBe("GET");
  });

  it("POSTs the transition body to /tickets/:id/transition", async () => {
    const fetchMock = stubFetch();
    await transitionTicket(TICKET_ID, "SENT");
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/transition`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ to: "SENT" }));
  });

  it("PATCHes final fields to /tickets/:id/fields", async () => {
    const fetchMock = stubFetch();
    await patchTicketFields(TICKET_ID, { overview: "x", tlp: "GREEN", references: ["https://a.example"] });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/fields`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(
      JSON.stringify({ overview: "x", tlp: "GREEN", references: ["https://a.example"] }),
    );
  });
});

describe("ticketsApi: sources", () => {
  it("POSTs a source with url or note", async () => {
    const fetchMock = stubFetch();
    await addTicketSource(TICKET_ID, { note: "vendor advisory" });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/sources`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ note: "vendor advisory" }));
  });

  it("DELETEs /tickets/:id/sources/:sourceId", async () => {
    const fetchMock = stubFetch();
    await deleteTicketSource(TICKET_ID, "22222222-2222-4222-8222-222222222222");
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/sources/22222222-2222-4222-8222-222222222222`);
    expect(init.method).toBe("DELETE");
  });
});

describe("ticketsApi: iocs", () => {
  const IOC_ID = "33333333-3333-4333-8333-333333333333";

  it("POSTs an IOC with type, value and includeInBulletin", async () => {
    const fetchMock = stubFetch();
    await addIoc(TICKET_ID, { type: "DOMAIN", value: "evil.example", includeInBulletin: true });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/iocs`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ type: "DOMAIN", value: "evil.example", includeInBulletin: true }),
    );
  });

  it("PATCHes includeInBulletin on /tickets/:id/iocs/:iocId", async () => {
    const fetchMock = stubFetch();
    await updateIoc(TICKET_ID, IOC_ID, { includeInBulletin: false });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/iocs/${IOC_ID}`);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ includeInBulletin: false }));
  });

  it("DELETEs /tickets/:id/iocs/:iocId", async () => {
    const fetchMock = stubFetch();
    await deleteIoc(TICKET_ID, IOC_ID);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/iocs/${IOC_ID}`);
    expect(init.method).toBe("DELETE");
  });
});

describe("ticketsApi: AI suggestions", () => {
  it("POSTs empty bodies to ai/fill and ai/enrich by default", async () => {
    const fetchMock = stubFetch();
    await aiFill(TICKET_ID);
    expect(lastCall(fetchMock)).toMatchObject({
      url: `/api/tickets/${TICKET_ID}/ai/fill`,
      init: expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
    });
    await aiEnrich(TICKET_ID);
    expect(lastCall(fetchMock)).toMatchObject({
      url: `/api/tickets/${TICKET_ID}/ai/enrich`,
      init: expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
    });
  });

  it("POSTs the selected provider and model overrides", async () => {
    const fetchMock = stubFetch();
    await aiFill(TICKET_ID, { provider: "OPENAI", model: "gpt-4o" });
    expect(lastCall(fetchMock).init.body).toBe(
      JSON.stringify({ provider: "OPENAI", model: "gpt-4o" }),
    );
    await aiEnrich(TICKET_ID, { provider: "GEMINI" });
    expect(lastCall(fetchMock).init.body).toBe(JSON.stringify({ provider: "GEMINI" }));
  });

  it("GETs suggestions and POSTs accept/reject", async () => {
    const fetchMock = stubFetch();
    await listSuggestions(TICKET_ID);
    expect(lastCall(fetchMock).url).toBe(`/api/tickets/${TICKET_ID}/suggestions?page=1&pageSize=20`);
    await listSuggestions(TICKET_ID, "PENDING");
    expect(lastCall(fetchMock).url).toBe(
      `/api/tickets/${TICKET_ID}/suggestions?status=PENDING&page=1&pageSize=20`,
    );
    const SUGGESTION_ID = "44444444-4444-4444-8444-444444444444";
    await acceptSuggestion(TICKET_ID, SUGGESTION_ID);
    expect(lastCall(fetchMock)).toMatchObject({
      url: `/api/tickets/${TICKET_ID}/suggestions/${SUGGESTION_ID}/accept`,
      init: expect.objectContaining({ method: "POST" }),
    });
    await rejectSuggestion(TICKET_ID, SUGGESTION_ID);
    expect(lastCall(fetchMock)).toMatchObject({
      url: `/api/tickets/${TICKET_ID}/suggestions/${SUGGESTION_ID}/reject`,
      init: expect.objectContaining({ method: "POST" }),
    });
  });
});

describe("ticketsApi: delivery", () => {
  it("POSTs {all:true} to /tickets/:id/send", async () => {
    const fetchMock = stubFetch();
    await sendTicket(TICKET_ID, { all: true });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/send`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ all: true }));
  });

  it("POSTs explicit channelIds to /tickets/:id/send", async () => {
    const fetchMock = stubFetch();
    const channelIds = [
      "11aa22bb-33cc-44dd-85ee-66ff77008899",
      "99aa88bb-77cc-46dd-a5ee-44ff33221100",
    ];
    await sendTicket(TICKET_ID, { channelIds });
    expect(lastCall(fetchMock).init.body).toBe(JSON.stringify({ channelIds }));
  });

  it("GETs /tickets/:id/delivery-audit", async () => {
    const fetchMock = stubFetch();
    await listDeliveryAudit(TICKET_ID, 2);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/delivery-audit?page=2&pageSize=20`);
    expect(init.method).toBe("GET");
  });
});

describe("ticketsApi: otx", () => {
  it("POSTs empty body to /tickets/:id/otx", async () => {
    const fetchMock = stubFetch();
    await pushOtx(TICKET_ID);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`/api/tickets/${TICKET_ID}/otx`);
    expect(init.method).toBe("POST");
  });
});
