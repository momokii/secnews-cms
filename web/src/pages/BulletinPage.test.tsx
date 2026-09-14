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

const PREVIEW_TICKET_ID = "c528cea2-f3e7-4673-8def-37ac36981adf";

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
          method === "POST" &&
          url === `/api/tickets/${PREVIEW_TICKET_ID}/bulletin/preview`,
        respond: () => jsonResponse({ rendered: defangedRendered }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the admin previews the ticket by its uuid
    renderPage();
    fireEvent.change(await screen.findByLabelText("Ticket ID"), {
      target: { value: PREVIEW_TICKET_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    // Then: the preview endpoint is hit and the defanged body renders
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${PREVIEW_TICKET_ID}/bulletin/preview`,
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
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "a@b.c", name: "Admin", role: "ADMIN" });
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

describe("TASK-UXB: copy bulletin", () => {
  afterEach(() => {
    Reflect.deleteProperty(window.navigator, "clipboard");
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("copies the exact preview text with line breaks intact and confirms", async () => {
    // Given: an async clipboard and a multi-line rendered preview
    setToken("test-token");
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    expect(defangedRendered.includes("\n")).toBe(true);
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url === "/api/bulletin/template",
        respond: () => jsonResponse(defaultTemplate),
      },
      {
        match: (url, method) =>
          method === "POST" &&
          url === `/api/tickets/${PREVIEW_TICKET_ID}/bulletin/preview`,
        respond: () => jsonResponse({ rendered: defangedRendered }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the operator previews a ticket then clicks Copy bulletin
    renderPage();
    fireEvent.change(await screen.findByLabelText("Ticket ID"), {
      target: { value: PREVIEW_TICKET_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const pane = await screen.findByLabelText("Bulletin preview");
    expect(pane.textContent).toContain("hxxp://203[.]0[.]113[.]7");
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Copy bulletin" }));

    // Then: the clipboard receives the raw preview string — newlines intact,
    // not innerText — and a Copied confirmation shows
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(defangedRendered),
    );
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("disables Copy bulletin until a preview exists", async () => {
    // Given: the template loaded but no preview rendered yet
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url === "/api/bulletin/template",
          respond: () => jsonResponse(defaultTemplate),
        },
      ]),
    );

    // When: the page renders
    renderPage();

    // Then: the copy button is disabled with nothing to copy
    const copy = (await screen.findByRole("button", {
      name: "Copy bulletin",
    })) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
  });
});
