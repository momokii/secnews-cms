import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setUser, setToken } from "../lib/tokenStore";
import { PromptsPage } from "./PromptsPage";

const promptsFixture = [
  {
    kind: "FILL",
    content: "Fill draft: {{title}} {{iocs}}",
    updatedAt: "2026-09-01T10:00:00.000Z",
  },
  {
    kind: "ENRICH",
    content: "Enrich draft: {{overview}} {{cveIds}}",
    updatedAt: "2026-09-02T11:00:00.000Z",
  },
];

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PromptsPage />
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("FE-PRM-01: editors load prompt content", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("GETs /prompts and fills both editors with their prompt content", async () => {
    // Given: an ADMIN session and the server holding both prompts
    setToken("test-token");
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "a@b.c", name: "Admin", role: "ADMIN" });
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "GET" && url === "/api/prompts",
        respond: () => jsonResponse(promptsFixture),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the prompts page renders
    renderPage();

    // Then: each editor shows its server content
    expect(await screen.findByDisplayValue("Fill draft: {{title}} {{iocs}}")).toBeTruthy();
    expect(screen.getByDisplayValue("Enrich draft: {{overview}} {{cveIds}}")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/prompts",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("shows an error alert when the prompt list fails to load", async () => {
    // Given: the prompts endpoint answers 500
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "GET" && url === "/api/prompts",
        respond: () => jsonResponse({ error: { code: "X", message: "boom" } }, 500),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the prompts page renders
    renderPage();

    // Then: the failure surfaces as an alert
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("boom");
  });
});

describe("FE-PRM-02: save PUTs the exact body and refetches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("PUTs /prompts/FILL with {content} then refetches GET /prompts", async () => {
    // Given: an ADMIN session and the server holding prompt v1
    setToken("test-token");
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "a@b.c", name: "Admin", role: "ADMIN" });
    let getPromptsCalls = 0;
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "GET" && url === "/api/prompts",
        respond: () => {
          getPromptsCalls += 1;
          return jsonResponse(
            getPromptsCalls === 1
              ? promptsFixture
              : [{ ...promptsFixture[0], content: "v2 fill body" }, promptsFixture[1]],
          );
        },
      },
      {
        match: (url, method) => method === "PUT" && url === "/api/prompts/FILL",
        respond: () => jsonResponse({ kind: "FILL", content: "v2 fill body", updatedAt: "2026-09-03T12:00:00.000Z" }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the admin edits the Fill prompt and saves
    renderPage();
    const editor = await screen.findByLabelText("Fill prompt");
    fireEvent.change(editor, { target: { value: "v2 fill body" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Fill prompt" }));

    // Then: the PUT carries exactly {content} and the prompts query refetches
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/prompts/FILL",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ content: "v2 fill body" }),
        }),
      ),
    );
    await waitFor(() => {
      const getCalls = fetchMock.mock.calls.filter(
        ([url, init]) => String(url) === "/api/prompts" && (init?.method ?? "GET") === "GET",
      );
      expect(getCalls).toHaveLength(2);
    });
    await screen.findByDisplayValue("v2 fill body");
  });
});

describe("FE-PRM-03: placeholder legend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders the backend renderer vocabulary and the unknown-token rule", async () => {
    // Given: prompts loaded
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) => method === "GET" && url === "/api/prompts",
          respond: () => jsonResponse(promptsFixture),
        },
      ]),
    );

    // When: the prompts page renders
    renderPage();

    // Then: the legend lists the context and field tokens and states that
    // unknown placeholders stay literal
    const legend = await screen.findByLabelText("Placeholder legend");
    for (const token of [
      "{{title}}",
      "{{summary}}",
      "{{findingType}}",
      "{{tlp}}",
      "{{iocs}}",
      "{{sources}}",
      "{{overview}}",
      "{{description}}",
      "{{recommendations}}",
      "{{references}}",
      "{{cveIds}}",
      "{{affectedVersions}}",
      "{{mitigation}}",
    ]) {
      expect(legend.textContent).toContain(token);
    }
    expect(legend.textContent).toContain("Unknown placeholders stay literal");
  });
});

describe("FE-PRM-04: role gating", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("hides save buttons from non-admin editors with a read-only note", async () => {
    // Given: an EDITOR session (prompts are ADMIN-only like Integrations)
    setToken("test-token");
    setUser({ id: "6d0b8a2c-4e1f-47d3-95c7-8b9a0d1e2f3a", email: "e@b.c", name: "Editor", role: "EDITOR" });
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) => method === "GET" && url === "/api/prompts",
          respond: () => jsonResponse(promptsFixture),
        },
      ]),
    );

    // When: the prompts page renders
    renderPage();

    // Then: the editors are readable but the save buttons are gone
    expect(await screen.findByLabelText("Fill prompt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save Fill prompt" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save Enrich prompt" })).toBeNull();
    expect(screen.getByText("Only ADMIN can edit the org-wide prompts.")).toBeTruthy();
  });
});

describe("FE-PRM-05: prompt guidance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("explains when each prompt runs, its inputs, guarantees, and output", async () => {
    // Given: both prompt templates load
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) => method === "GET" && url === "/api/prompts",
          respond: () => jsonResponse(promptsFixture),
        },
      ]),
    );

    // When: the prompts page renders
    renderPage();

    // Then: analyst guidance is visible on both cards
    expect(await screen.findByText(/Runs from the Fill button/i)).toBeTruthy();
    expect(screen.getByText(/Runs from the Enrich button/i)).toBeTruthy();
    expect(screen.getAllByText(/working materials/i)).toHaveLength(2);
    expect(screen.getAllByText(/never invents/i)).toHaveLength(2);
    expect(screen.getByText(/PENDING suggestions auto-merge on accept/i)).toBeTruthy();
    expect(screen.getByText(/every addition needs Accept, Edit, or Reject/i)).toBeTruthy();
  });
});

describe("FE-PRM-06: prompt history", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("lists paginated revisions and restores a selected revision through PUT", async () => {
    // Given: history has two revisions on its first page and one on its second
    setToken("test-token");
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "a@b.c", name: "Admin", role: "ADMIN" });
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "GET" && url === "/api/prompts",
        respond: () => jsonResponse(promptsFixture),
      },
      {
        match: (url, method) => method === "GET" && url === "/api/prompts/FILL/history?page=1&pageSize=2",
        respond: () => jsonResponse({
          items: [
            { content: "fill revision newest", actorName: "Nadia", createdAt: "2026-09-03T05:00:00.000Z" },
            { content: "fill revision older", actorName: null, createdAt: "2026-09-02T05:00:00.000Z" },
          ], total: 3, page: 1, pageSize: 2,
        }),
      },
      {
        match: (url, method) => method === "GET" && url === "/api/prompts/FILL/history?page=2&pageSize=2",
        respond: () => jsonResponse({
          items: [{ content: "fill revision oldest", actorName: "Raka", createdAt: "2026-09-01T05:00:00.000Z" }],
          total: 3, page: 2, pageSize: 2,
        }),
      },
      {
        match: (url, method) => method === "PUT" && url === "/api/prompts/FILL",
        respond: () => jsonResponse({ kind: "FILL", content: "fill revision oldest", updatedAt: "2026-09-04T05:00:00.000Z" }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: history opens, the admin pages, then confirms restoring the oldest revision
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "View Fill history" }));
    expect(await screen.findByText("fill revision newest")).toBeTruthy();
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next history page for Fill" }));
    expect(await screen.findByText("fill revision oldest")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore fill revision oldest" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore prompt" }));

    // Then: the existing save endpoint receives the exact revision content
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/prompts/FILL",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ content: "fill revision oldest" }) }),
      ),
    );
  });
});
