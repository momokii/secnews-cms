import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setUser, setToken } from "../lib/tokenStore";
import { EmailTemplatePage } from "./EmailTemplatePage";

const storedTemplate = {
  subject: "Security Bulletin: {{title}}",
  htmlBody: "<h1>{{title}}</h1><p>{{overview}}</p><pre>{{iocs}}</pre>",
  updatedAt: "2026-09-16T00:00:00.000Z",
};

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EmailTemplatePage />
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

describe("FE-EML-01: loads the stored subject + html body", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("GETs /email-template and fills both editors", async () => {
    // Given: an ADMIN session and the server holding the stored template
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url === "/api/email-template",
          respond: () => jsonResponse(storedTemplate),
        },
      ]),
    );

    // When: the page renders
    renderPage();

    // Then: both editors carry the stored values
    expect(await screen.findByDisplayValue(storedTemplate.subject)).toBeTruthy();
    expect(await screen.findByDisplayValue(storedTemplate.htmlBody)).toBeTruthy();
  });
});

describe("FE-EML-02: save persists subject + htmlBody and refetches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("PUTs the edited template then refetches GET /email-template", async () => {
    // Given: an ADMIN session and the server holding template v1
    setToken("test-token");
    setUser({ id: "c528cea2-f3e7-4673-8def-37ac36981adf", email: "a@b.c", name: "Admin", role: "ADMIN" });
    let getCalls = 0;
    const updated = { subject: "Alert: {{title}}", htmlBody: "<p>{{title}}</p>" };
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "GET" && url === "/api/email-template",
        respond: () => {
          getCalls += 1;
          return jsonResponse(getCalls === 1 ? storedTemplate : { ...updated, updatedAt: storedTemplate.updatedAt });
        },
      },
      {
        match: (url, method) =>
          method === "PUT" && url === "/api/email-template",
        respond: () => jsonResponse({ ...updated, updatedAt: storedTemplate.updatedAt }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    // When: the admin edits both editors and saves
    renderPage();
    fireEvent.change(await screen.findByLabelText("Subject"), {
      target: { value: updated.subject },
    });
    fireEvent.change(screen.getByLabelText("HTML body"), {
      target: { value: updated.htmlBody },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    // Then: the PUT carries both fields and the template query refetches
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/email-template",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(updated),
        }),
      ),
    );
    await waitFor(() => expect(getCalls).toBe(2));
    await screen.findByDisplayValue("Alert: {{title}}");
  });
});

describe("FE-EML-03: preview renders sample ticket data into the iframe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("substitutes the sample ticket values and escapes markup", async () => {
    // Given: the stored template loaded
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url === "/api/email-template",
          respond: () => jsonResponse(storedTemplate),
        },
      ]),
    );

    // When: the page renders
    renderPage();

    // Then: the preview iframe srcdoc carries sample data with defanged IOCs
    // and escaped markup
    const frame = await screen.findByTitle("Email preview");
    await waitFor(() =>
      expect(frame.getAttribute("srcdoc") ?? "").toContain("VPN appliance takeover"),
    );
    const srcdoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("evil[.]example");
    expect(srcdoc).not.toContain("<script>");
  });
});
