import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setUser, setToken } from "../lib/tokenStore";
import { BulletinPage } from "./BulletinPage";

const defaultTemplate = {
  template: "# {{title}}\n\n{{overview}}\n\n{{ioc_block}}",
};

const defangedRendered =
  "# VPN 0day\n\nhxxp://203[.]0[.]113[.]7 and admin[.]evil[.]example";

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BulletinPage />
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

describe("FE-BUL-01: preview renders the defanged bulletin body", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("POSTs /tickets/:id/bulletin/preview and renders the rendered text", async () => {
    // Given: the stored template and a preview endpoint returning defanged IOCs
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url === "/api/bulletin/template",
        respond: () => jsonResponse(defaultTemplate),
      },
      {
        match: (url, method) =>
          method === "POST" && url === "/api/tickets/12/bulletin/preview",
        respond: () => jsonResponse({ rendered: defangedRendered }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the admin previews ticket 12
    renderPage();
    fireEvent.change(await screen.findByLabelText("Ticket ID"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    // Then: the preview endpoint is hit and the defanged body renders
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tickets/12/bulletin/preview",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const pane = await screen.findByLabelText("Bulletin preview");
    expect(pane.textContent).toContain("hxxp://203[.]0[.]113[.]7");
  });
});

describe("FE-BUL-02: save persists the template and refetches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("PUTs the edited template then refetches GET /bulletin/template", async () => {
    // Given: an ADMIN session and the server holding template v1
    setToken("test-token");
    setUser({ id: 1, email: "a@b.c", name: "Admin", role: "ADMIN" });
    let getTemplateCalls = 0;
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url === "/api/bulletin/template",
        respond: () => {
          getTemplateCalls += 1;
          return jsonResponse(
            getTemplateCalls === 1 ? defaultTemplate : { template: "v2 body" },
          );
        },
      },
      {
        match: (url, method) =>
          method === "PUT" && url === "/api/bulletin/template",
        respond: () => jsonResponse({ template: "v2 body" }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the admin edits the template and saves
    renderPage();
    const editor = await screen.findByLabelText("Template");
    fireEvent.change(editor, { target: { value: "v2 body" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    // Then: the PUT carries the new body and the template query refetches
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/bulletin/template",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ template: "v2 body" }),
        }),
      ),
    );
    await waitFor(() => {
      const getCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url) === "/api/bulletin/template" &&
          (init?.method ?? "GET") === "GET",
      );
      expect(getCalls).toHaveLength(2);
    });
    await screen.findByDisplayValue("v2 body");
  });
});
