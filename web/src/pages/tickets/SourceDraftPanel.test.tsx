import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TicketSource } from "../../lib/ticketsApi";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  paginated,
  renderWithProviders,
  routeFetch,
  suggestionFixture,
} from "./testUtils";
import { SourceDraftPanel } from "./SourceDraftPanel";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const SOURCE_A_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_B_ID = "33333333-3333-4333-8333-333333333333";

function sourceA(): TicketSource {
  return {
    id: SOURCE_A_ID,
    ticketId: TICKET_ID,
    url: "https://openssl.org/secadv-2026.html",
    note: null,
    title: "OpenSSL security advisory",
    notes: "Confirms CVE-2026-1234 and the fixed versions",
    createdById: null,
    createdAt: "2026-09-13T10:00:00.000Z",
  };
}

function sourceB(): TicketSource {
  return {
    id: SOURCE_B_ID,
    ticketId: TICKET_ID,
    url: "https://vendor.example/bulletin",
    note: "Vendor-confirmed mitigation steps",
    title: "Vendor bulletin",
    notes: null,
    createdById: null,
    createdAt: "2026-09-13T11:00:00.000Z",
  };
}

interface PanelRouteOverrides {
  draftRespond?: () => Response | Promise<Response>;
  suggestionsTotal?: number;
}

function panelRoutes(overrides: PanelRouteOverrides = {}): Array<{
  match: (url: string, method: string) => boolean;
  respond: () => Response | Promise<Response>;
}> {
  return [
    {
      match: (url, method) =>
        method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
      respond: () =>
        jsonResponse({
          ...paginated([suggestionFixture()]),
          total: overrides.suggestionsTotal ?? 1,
        }),
    },
    {
      match: (url, method) => method === "POST" && url.endsWith("/ai/source-draft"),
      respond:
        overrides.draftRespond ?? (() => jsonResponse({ suggestions: [suggestionFixture()] })),
    },
  ];
}

function renderPanel(sources: TicketSource[]): void {
  renderWithProviders(<SourceDraftPanel ticketId={TICKET_ID} sources={sources} />);
}

describe("FE-SD: Source Draft panel", () => {
  it("renders every ticket source with title, url and notes preview", async () => {
    // Given: a ticket with two sources (one with notes, one with the legacy note)
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(panelRoutes()));

    // When: the panel renders
    renderPanel([sourceA(), sourceB()]);

    // Then: each source is a labelled checkbox showing title, url and notes preview
    expect(
      await screen.findByRole("checkbox", { name: "Select source: OpenSSL security advisory" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Select source: Vendor bulletin" }),
    ).toBeTruthy();
    expect(screen.getByText("https://openssl.org/secadv-2026.html")).toBeTruthy();
    expect(screen.getByText(/Confirms CVE-2026-1234/)).toBeTruthy();
    expect(screen.getByText(/Vendor-confirmed mitigation/)).toBeTruthy();
  });

  it("select all / select none toggles every source checkbox", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(panelRoutes()));
    renderPanel([sourceA(), sourceB()]);
    const first = (await screen.findByRole("checkbox", {
      name: "Select source: OpenSSL security advisory",
    })) as HTMLInputElement;
    const second = screen.getByRole("checkbox", {
      name: "Select source: Vendor bulletin",
    }) as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(first.checked).toBe(false);
    expect(second.checked).toBe(false);
  });

  it("starts with all four target fields checked", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(panelRoutes()));
    renderPanel([sourceA()]);

    await screen.findByRole("checkbox", { name: "Select source: OpenSSL security advisory" });
    for (const label of ["Overview", "Description", "Recommendations", "References"]) {
      const box = screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
      expect(box.checked).toBe(true);
    }
  });

  it("describes the web-search toggle as online reference search", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(panelRoutes()));
    renderPanel([sourceA()]);

    expect(
      await screen.findByRole("checkbox", { name: "Allow web search for References" }),
    ).toBeTruthy();
    expect(screen.getByText(/online reference search/i)).toBeTruthy();
  });

  it("keeps Run disabled until at least one source and one field are selected", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(panelRoutes()));
    renderPanel([sourceA()]);
    const runButton = () => screen.getByRole("button", { name: "Run" }) as HTMLButtonElement;
    const source = await screen.findByRole("checkbox", {
      name: "Select source: OpenSSL security advisory",
    });

    expect(runButton().disabled).toBe(true);

    fireEvent.click(source);
    expect(runButton().disabled).toBe(false);

    for (const label of ["Overview", "Description", "Recommendations", "References"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: label }));
    }
    expect(runButton().disabled).toBe(true);
  });

  it("POSTs picked sources, target fields and the web-search flag to ai/source-draft", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(panelRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderPanel([sourceA(), sourceB()]);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select source: OpenSSL security advisory" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select source: Vendor bulletin" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Recommendations" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Allow web search for References" }));

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/source-draft`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            sourceIds: [SOURCE_A_ID, SOURCE_B_ID],
            targetFields: ["overview", "description", "references"],
            allowWebSearch: true,
          }),
        }),
      ),
    );
  });

  it("sends allowWebSearch false and the full field set by default", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(panelRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderPanel([sourceA()]);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select source: OpenSSL security advisory" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/source-draft`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            sourceIds: [SOURCE_A_ID],
            targetFields: ["overview", "description", "recommendations", "references"],
            allowWebSearch: false,
          }),
        }),
      ),
    );
  });

  it("shows a disabled Drafting… state while the run is in flight", async () => {
    // Given: ai/source-draft never answers
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch(
        panelRoutes({ draftRespond: () => new Promise<Response>(() => {}) }),
      ),
    );
    renderPanel([sourceA()]);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select source: OpenSSL security advisory" }),
    );

    // When: Run is clicked
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    // Then: the button flips to the in-flight label and locks
    const drafting = (await screen.findByRole("button", {
      name: "Drafting…",
    })) as HTMLButtonElement;
    expect(drafting.disabled).toBe(true);
  });

  it("surfaces a failed run inline and re-enables Run", async () => {
    // Given: the draft endpoint answers 502
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch(
        panelRoutes({
          draftRespond: () =>
            jsonResponse(
              { error: { code: "AI_PROVIDER_UNREACHABLE", message: "AI provider unreachable" } },
              502,
            ),
        }),
      ),
    );
    renderPanel([sourceA()]);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select source: OpenSSL security advisory" }),
    );

    // When: Run is clicked and fails
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    // Then: an inline alert carries the failure and Run unlocks
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("AI provider unreachable");
    expect((screen.getByRole("button", { name: "Run" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("renders run results with provenance and server pagination at 5 per page", async () => {
    // Given: 12 suggestions on the server and a successful run
    setToken("test-token");
    const fetchMock = routeFetch(panelRoutes({ suggestionsTotal: 12 }));
    vi.stubGlobal("fetch", fetchMock);
    renderPanel([sourceA()]);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select source: OpenSSL security advisory" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    // Then: the results list shows the suggestion row with provenance,
    // paged at 5 per page like AI assist
    expect(await screen.findByText("overview", { ignore: "option" })).toBeTruthy();
    expect(screen.getByText("2026-09-14 15:00 WIB · Auto · gemini")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3 — 12 suggestions")).toBeTruthy();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/tickets/${TICKET_ID}/suggestions?page=1&pageSize=5`),
        expect.anything(),
      ),
    );
  });
});
