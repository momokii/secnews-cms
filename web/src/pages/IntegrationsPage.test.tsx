import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntegrationsPage } from "./IntegrationsPage";
import { setToken } from "../lib/tokenStore";
import type { IntegrationConfigResponse } from "../lib/integrationsApi";

const OPENAI_CONFIG: IntegrationConfigResponse = {
  kind: "OPENAI",
  model: "gpt-4o",
  hasKey: true,
  maskedKey: "sk-…ab12",
  updatedAt: "2026-09-14T08:00:00.000Z",
};

const UNCONFIGURED = (kind: IntegrationConfigResponse["kind"]): IntegrationConfigResponse => ({
  kind,
  model: null,
  hasKey: false,
  maskedKey: null,
  updatedAt: "1970-01-01T00:00:00.000Z",
});

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

function openAiConfigRoute(): {
  match: (url: string, method: string) => boolean;
  respond: () => Response;
} {
  return {
    match: (url: string, method: string) =>
      method === "GET" && url === "/api/integrations/OPENAI",
    respond: () => new Response(JSON.stringify(OPENAI_CONFIG), { status: 200 }),
  };
}

function otherKindsRoute(): {
  match: (url: string, method: string) => boolean;
  respond: () => Response;
} {
  return {
    match: (url, method) =>
      method === "GET" &&       /^\/api\/integrations\/(ANTHROPIC|GEMINI|DEEPSEEK|OTX|SMTP|WAHA)$/.test(url),
    respond: () => new Response(JSON.stringify(UNCONFIGURED("OTX")), { status: 200 }),
  };
}

type FetchMock = ReturnType<typeof routeFetch>;

/** Mock calls hitting exactly `method url` — GETs and PUTs share the path. */
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

describe("FE-INT-01: masked key is never resubmitted", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("shows only the masked key and sends the raw key only when freshly typed", async () => {
    // Given: OPENAI is configured with masked key "sk-…ab12" and model gpt-4o
    setToken("test-token");
    const fetchMock = routeFetch([
      openAiConfigRoute(),
      otherKindsRoute(),
      {
        match: (url, method) =>
          method === "PUT" && url === "/api/integrations/OPENAI",
        respond: () => new Response(JSON.stringify(OPENAI_CONFIG), { status: 200 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // Then: the full key is nowhere in the DOM — only the masked form
    const card = await screen.findByRole("region", { name: "OPENAI" });
    expect(await within(card).findByText(/sk-…ab12/)).not.toBeNull();
    expect(document.body.textContent).not.toContain("sk-live-full-secret");

    // When: the admin clicks Save without typing a new key
    const save = within(card).getByRole("button", { name: "Save" });
    fireEvent.click(save);

    // Then: no PUT fires — the masked key must never be sent back
    expect(callsTo(fetchMock, "PUT", "/api/integrations/OPENAI")).toHaveLength(0);

    // When: the admin types a fresh raw key and saves
    const keyInput = within(card).getByLabelText("API key");
    fireEvent.change(keyInput, { target: { value: "sk-live-full-secret" } });
    fireEvent.click(save);

    // Then: the PUT carries the raw key + current model, never the masked value
    await waitFor(() =>
      expect(callsTo(fetchMock, "PUT", "/api/integrations/OPENAI")).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, "PUT", "/api/integrations/OPENAI")[0];
    expect(init.method).toBe("PUT");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.apiKey).toBe("sk-live-full-secret");
    expect(body.model).toBe("gpt-4o");
    expect(JSON.stringify(body)).not.toContain("sk-…ab12");
  });

  it("PUTs OTX without a model field", async () => {
    // Given: the OTX card with a freshly typed key
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url === "/api/integrations/OTX",
        respond: () => new Response(JSON.stringify(UNCONFIGURED("OTX")), { status: 200 }),
      },
      {
        match: (url, method) =>
          method === "GET" &&
          /^\/api\/integrations\/(OPENAI|ANTHROPIC|GEMINI|DEEPSEEK|SMTP|WAHA)$/.test(url),
        respond: () => new Response(JSON.stringify(UNCONFIGURED("OPENAI")), { status: 200 }),
      },
      {
        match: (url, method) =>
          method === "PUT" && url === "/api/integrations/OTX",
        respond: () => new Response(JSON.stringify(UNCONFIGURED("OTX")), { status: 200 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const card = await screen.findByRole("region", { name: "OTX" });
    const keyInput = within(card).getByLabelText("API key");
    fireEvent.change(keyInput, { target: { value: "otx-key-raw" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));

    // Then: the body is exactly { apiKey } — OTX forbids model (contract #38)
    await waitFor(() =>
      expect(callsTo(fetchMock, "PUT", "/api/integrations/OTX")).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, "PUT", "/api/integrations/OTX")[0];
    expect(JSON.parse(String(init.body))).toEqual({ apiKey: "otx-key-raw" });
  });
});

describe("FE-INT-02: test connection call and result badge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("POSTs the test endpoint and renders an OK badge with latency", async () => {
    // Given: the OPENAI card is configured
    setToken("test-token");
    const fetchMock = routeFetch([
      openAiConfigRoute(),
      otherKindsRoute(),
      {
        match: (url, method) =>
          method === "POST" && url === "/api/integrations/OPENAI/test",
        respond: () =>
          new Response(JSON.stringify({ ok: true, latencyMs: 87 }), { status: 200 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // When: the admin runs Test connection on the OpenAI card
    const card = await screen.findByRole("region", { name: "OPENAI" });
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));

    // Then: an empty-body POST fires and the badge reports OK with latency
    await waitFor(() =>
      expect(callsTo(fetchMock, "POST", "/api/integrations/OPENAI/test")).toHaveLength(1),
    );
    const [, init] = callsTo(fetchMock, "POST", "/api/integrations/OPENAI/test")[0];
    expect(JSON.parse(String(init.body))).toEqual({});

    expect(await within(card).findByText(/OK\s*·\s*87\s*ms/)).not.toBeNull();
  });

  it("renders upstream failures inline as a failed badge with detail", async () => {
    // Given: the OTX test reports ok:false (not an HTTP error, contract #39)
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url === "/api/integrations/OTX",
        respond: () => new Response(JSON.stringify(UNCONFIGURED("OTX")), { status: 200 }),
      },
      {
        match: (url, method) =>
          method === "GET" &&
          /^\/api\/integrations\/(OPENAI|ANTHROPIC|GEMINI|DEEPSEEK|SMTP|WAHA)$/.test(url),
        respond: () => new Response(JSON.stringify(UNCONFIGURED("OTX")), { status: 200 }),
      },
      {
        match: (url, method) =>
          method === "POST" && url === "/api/integrations/OTX/test",
        respond: () =>
          new Response(
            JSON.stringify({ ok: false, detail: "otx request failed with upstream status 401" }),
            { status: 200 },
          ),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // When: the admin runs Test connection on the OTX card
    const card = await screen.findByRole("region", { name: "OTX" });
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));

    // Then: the failure lands in the badge, not an error boundary
    expect(await within(card).findByText(/upstream status 401/)).not.toBeNull();
  });
});

describe("TASK-UIFE: integrations grouping and DeepSeek", () => {
  function groupedRoutes(): Array<{
    match: (url: string, method: string) => boolean;
    respond: () => Response;
  }> {
    return [
      {
        match: (url, method) => method === "GET" && url === "/api/integrations/OPENAI",
        respond: () => new Response(JSON.stringify(OPENAI_CONFIG), { status: 200 }),
      },
      {
        match: (url, method) =>
          method === "GET" &&
          /^\/api\/integrations\/(ANTHROPIC|GEMINI|DEEPSEEK|OTX|SMTP|WAHA)$/.test(url),
        respond: () => new Response(JSON.stringify(UNCONFIGURED("OTX")), { status: 200 }),
      },
    ];
  }

  it("groups AI provider cards under 'AI providers' and OTX under 'Threat intel'", async () => {
    // Given: the integrations page with all five kinds configured-server-side
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(groupedRoutes()));
    renderPage();

    // Then: each group has a header, description, and only its own cards
    const aiSection = await screen.findByRole("region", { name: "AI providers" });
    const threatSection = screen.getByRole("region", { name: "Threat intel" });
    expect(within(aiSection).getByRole("heading", { name: "AI providers" })).toBeTruthy();
    expect(within(threatSection).getByRole("heading", { name: "Threat intel" })).toBeTruthy();

    for (const kind of ["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK"] as const) {
      expect(within(aiSection).getByRole("region", { name: kind })).toBeTruthy();
    }
    expect(within(threatSection).getByRole("region", { name: "OTX" })).toBeTruthy();
    expect(within(threatSection).queryByRole("region", { name: "OPENAI" })).toBeNull();

    // Group descriptions render as one-liners under each header
    expect(aiSection.textContent).toContain("Fill and Enrich");
    expect(threatSection.textContent).toContain("OTX");
  });

  it("shows a DeepSeek card with a provider blurb and server default model hint", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        ...groupedRoutes().filter((route) => !route.match("/api/integrations/DEEPSEEK", "GET")),
        {
          match: (url, method) => method === "GET" && url === "/api/integrations/DEEPSEEK",
          respond: () =>
            new Response(
              JSON.stringify({
                kind: "DEEPSEEK",
                model: "deepseek-chat",
                hasKey: true,
                maskedKey: "sk-ds…9f2e",
                updatedAt: "2026-09-14T08:00:00.000Z",
              }),
              { status: 200 },
            ),
        },
      ]),
    );
    renderPage();

    // Then: the DeepSeek card renders with blurb and default model hint
    const card = await screen.findByRole("region", { name: "DEEPSEEK" });
    expect(within(card).getByText(/strong reasoning/)).toBeTruthy();
    expect(await within(card).findByText(/deepseek-chat/)).toBeTruthy();
  });

  it("POSTs the DeepSeek test endpoint and renders the OK badge", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      ...groupedRoutes(),
      {
        match: (url, method) =>
          method === "POST" && url === "/api/integrations/DEEPSEEK/test",
        respond: () =>
          new Response(JSON.stringify({ ok: true, latencyMs: 143 }), { status: 200 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const card = await screen.findByRole("region", { name: "DEEPSEEK" });
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));

    await waitFor(() =>
      expect(callsTo(fetchMock, "POST", "/api/integrations/DEEPSEEK/test")).toHaveLength(1),
    );
    expect(await within(card).findByText(/OK\s*·\s*143\s*ms/)).not.toBeNull();
  });
});
