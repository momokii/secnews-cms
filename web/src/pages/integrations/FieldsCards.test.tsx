import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntegrationsPage } from "../IntegrationsPage";
import { setToken } from "../../lib/tokenStore";
import type { IntegrationConfigResponse } from "../../lib/integrationsApi";

const SMTP_CONFIG: IntegrationConfigResponse = {
  kind: "SMTP",
  model: null,
  hasKey: true,
  maskedKey: null,
  updatedAt: "2026-09-15T08:00:00.000Z",
  host: "smtp.corp.io",
  port: 587,
  user: "alerts@corp.io",
  from: "alerts@corp.io",
  maskedPassword: "s3…et9",
};

const WAHA_UNCONFIGURED: IntegrationConfigResponse = {
  kind: "WAHA",
  model: null,
  hasKey: false,
  maskedKey: null,
  updatedAt: "1970-01-01T00:00:00.000Z",
  baseUrl: null,
  session: null,
  maskedApiKey: null,
};

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <IntegrationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function routeFetch(
  routes: Array<{
    match: (url: string, method: string) => boolean;
    respond: () => Response;
  }>,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const route = routes.find((candidate) => candidate.match(url, method));
    if (route === undefined) {
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }
    return route.respond();
  });
}

type FetchMock = ReturnType<typeof routeFetch>;

function callsTo(
  fetchMock: FetchMock,
  method: string,
  url: string,
): Array<[string, RequestInit]> {
  return fetchMock.mock.calls.filter(
    ([callUrl, init]) =>
      String(callUrl) === url && (init?.method ?? "GET") === method,
  ) as Array<[string, RequestInit]>;
}

function keyedKindRoutes(): Array<{
  match: (url: string, method: string) => boolean;
  respond: () => Response;
}> {
  return [
    {
      match: (url, method) =>
        method === "GET" && /^\/api\/integrations\/(OPENAI|ANTHROPIC|GEMINI|DEEPSEEK|OTX)$/.test(url),
      respond: () =>
        new Response(
          JSON.stringify({
            kind: "OTX",
            model: null,
            hasKey: false,
            maskedKey: null,
            updatedAt: "1970-01-01T00:00:00.000Z",
          }),
          { status: 200 },
        ),
    },
  ];
}

describe("FE-INT-03: Messaging and Email relay grouping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("groups the WAHA card under 'Messaging' and the SMTP card under 'Email relay'", async () => {
    // Given: the integrations page with SMTP configured and WAHA empty
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        ...keyedKindRoutes(),
        {
          match: (url, method) => method === "GET" && url === "/api/integrations/SMTP",
          respond: () => new Response(JSON.stringify(SMTP_CONFIG), { status: 200 }),
        },
        {
          match: (url, method) => method === "GET" && url === "/api/integrations/WAHA",
          respond: () => new Response(JSON.stringify(WAHA_UNCONFIGURED), { status: 200 }),
        },
      ]),
    );
    renderPage();

    // Then: each new group has its own header and only its own card
    const messaging = await screen.findByRole("region", { name: "Messaging" });
    const email = screen.getByRole("region", { name: "Email relay" });
    expect(within(messaging).getByRole("heading", { name: "Messaging" })).toBeTruthy();
    expect(within(email).getByRole("heading", { name: "Email relay" })).toBeTruthy();

    expect(within(messaging).getByRole("region", { name: "WAHA" })).toBeTruthy();
    expect(within(email).getByRole("region", { name: "SMTP" })).toBeTruthy();
    expect(within(email).queryByRole("region", { name: "WAHA" })).toBeNull();
    expect(within(messaging).queryByRole("region", { name: "SMTP" })).toBeNull();
  });
});

describe("FE-INT-04: SMTP card fields, masked password, save and test", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders plain host/port/user/from, masks the password, and PUTs the full body", async () => {
    // Given: SMTP is configured — password exists only as the masked form
    setToken("test-token");
    const fetchMock = routeFetch([
      ...keyedKindRoutes(),
      {
        match: (url, method) => method === "GET" && url === "/api/integrations/SMTP",
        respond: () => new Response(JSON.stringify(SMTP_CONFIG), { status: 200 }),
      },
      {
        match: (url, method) => method === "GET" && url === "/api/integrations/WAHA",
        respond: () => new Response(JSON.stringify(WAHA_UNCONFIGURED), { status: 200 }),
      },
      {
        match: (url, method) => method === "PUT" && url === "/api/integrations/SMTP",
        respond: () => new Response(JSON.stringify(SMTP_CONFIG), { status: 200 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const card = await screen.findByRole("region", { name: "SMTP" });

    // Then: plain fields are seeded from the server, password shows only masked
    const hostInput = within(card).getByLabelText("Host");
    await waitFor(() => expect(hostInput).toHaveProperty("value", "smtp.corp.io"));
    expect(within(card).getByLabelText("Port")).toHaveProperty("value", "587");
    expect(within(card).getByLabelText("User")).toHaveProperty("value", "alerts@corp.io");
    expect(within(card).getByLabelText("From")).toHaveProperty("value", "alerts@corp.io");
    expect(within(card).getByLabelText("Password")).toHaveProperty("value", "");
    expect(within(card).getAllByText(/s3…et9/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("mail-secret-raw");

    // When: the admin types a fresh password and saves
    fireEvent.change(within(card).getByLabelText("Password"), {
      target: { value: "mail-secret-raw" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));

    // Then: the PUT carries the whole contract body — port numeric, masked value never sent
    await waitFor(() =>
      expect(callsTo(fetchMock, "PUT", "/api/integrations/SMTP")).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, "PUT", "/api/integrations/SMTP")[0];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      host: "smtp.corp.io",
      port: 587,
      user: "alerts@corp.io",
      password: "mail-secret-raw",
      from: "alerts@corp.io",
    });
    expect(typeof body.port).toBe("number");
    expect(JSON.stringify(body)).not.toContain("s3…et9");
  });

  it("POSTs /api/integrations/SMTP/test and renders the OK badge", async () => {
    // Given: the configured SMTP card
    setToken("test-token");
    const fetchMock = routeFetch([
      ...keyedKindRoutes(),
      {
        match: (url, method) => method === "GET" && url === "/api/integrations/SMTP",
        respond: () => new Response(JSON.stringify(SMTP_CONFIG), { status: 200 }),
      },
      {
        match: (url, method) => method === "GET" && url === "/api/integrations/WAHA",
        respond: () => new Response(JSON.stringify(WAHA_UNCONFIGURED), { status: 200 }),
      },
      {
        match: (url, method) =>
          method === "POST" && url === "/api/integrations/SMTP/test",
        respond: () =>
          new Response(JSON.stringify({ ok: true, latencyMs: 212 }), { status: 200 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const card = await screen.findByRole("region", { name: "SMTP" });

    // When: the admin runs Test connection
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));

    // Then: the POST hits the SMTP test route and the badge reports OK
    await waitFor(() =>
      expect(callsTo(fetchMock, "POST", "/api/integrations/SMTP/test")).toHaveLength(1),
    );
    expect(await within(card).findByText(/OK\s*·\s*212\s*ms/)).not.toBeNull();
  });
});

describe("FE-INT-05: WAHA card fields, save payload, and test route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("PUTs {baseUrl, session, apiKey} and POSTs /api/integrations/WAHA/test", async () => {
    // Given: an unconfigured WAHA card
    setToken("test-token");
    const fetchMock = routeFetch([
      ...keyedKindRoutes(),
      {
        match: (url, method) => method === "GET" && url === "/api/integrations/SMTP",
        respond: () => new Response(JSON.stringify(SMTP_CONFIG), { status: 200 }),
      },
      {
        match: (url, method) => method === "GET" && url === "/api/integrations/WAHA",
        respond: () => new Response(JSON.stringify(WAHA_UNCONFIGURED), { status: 200 }),
      },
      {
        match: (url, method) => method === "PUT" && url === "/api/integrations/WAHA",
        respond: () =>
          new Response(
            JSON.stringify({
              ...WAHA_UNCONFIGURED,
              hasKey: true,
              maskedApiKey: "waha…k31",
            }),
            { status: 200 },
          ),
      },
      {
        match: (url, method) =>
          method === "POST" && url === "/api/integrations/WAHA/test",
        respond: () =>
          new Response(
            JSON.stringify({ ok: false, detail: "WAHA session 'default' not found" }),
            { status: 200 },
          ),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const card = await screen.findByRole("region", { name: "WAHA" });

    // When: the admin fills base URL, session, and API key, then saves
    fireEvent.change(within(card).getByLabelText("Base URL"), {
      target: { value: "https://waha.corp.io" },
    });
    fireEvent.change(within(card).getByLabelText("Session"), {
      target: { value: "default" },
    });
    fireEvent.change(within(card).getByLabelText("API key"), {
      target: { value: "waha-key-raw" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));

    // Then: the PUT body is exactly the WAHA contract shape
    await waitFor(() =>
      expect(callsTo(fetchMock, "PUT", "/api/integrations/WAHA")).toHaveLength(1),
    );
    const [, putInit] = callsTo(fetchMock, "PUT", "/api/integrations/WAHA")[0];
    expect(JSON.parse(String(putInit.body))).toEqual({
      baseUrl: "https://waha.corp.io",
      session: "default",
      apiKey: "waha-key-raw",
    });

    // When: the admin runs Test connection and upstream reports ok:false
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));

    // Then: the failure detail lands in a red badge, not an error boundary
    await waitFor(() =>
      expect(callsTo(fetchMock, "POST", "/api/integrations/WAHA/test")).toHaveLength(1),
    );
    expect(await within(card).findByText(/session 'default' not found/)).not.toBeNull();
  });
});
