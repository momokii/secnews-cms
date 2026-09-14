import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  paginated,
  renderWithProviders,
  routeFetch,
  suggestionFixture,
} from "./testUtils";
import { AiPanel } from "./AiPanel";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function routes(): Array<{
  match: (url: string, method: string) => boolean;
  respond: () => Response;
}> {
  return [
    {
      match: (url, method) =>
        method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
      respond: () => jsonResponse(paginated([suggestionFixture()])),
    },
    {
      match: (url, method) => method === "POST" && url.endsWith("/ai/fill"),
      respond: () => jsonResponse({ suggestions: [suggestionFixture()] }),
    },
    {
      match: (url, method) => method === "POST" && url.endsWith("/ai/enrich"),
      respond: () => jsonResponse({ suggestions: [suggestionFixture()] }),
    },
    {
      match: (url, method) => method === "POST" && url.endsWith("/accept"),
      respond: () => jsonResponse({ suggestion: suggestionFixture({ status: "ACCEPTED" }) }),
    },
    {
      match: (url, method) => method === "POST" && url.endsWith("/reject"),
      respond: () => jsonResponse({ suggestion: suggestionFixture({ status: "REJECTED" }) }),
    },
  ];
}

describe("FE-AI-01: AI panel", () => {
  it("POSTs to ai/fill when AI fill (strict) is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(routes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "AI fill (strict)" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/fill`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("POSTs to ai/enrich when AI enrich is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(routes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "AI enrich" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/enrich`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("lists suggestions with PENDING badges and accept/reject only for pending rows", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () =>
            jsonResponse(
              paginated([
                suggestionFixture({ status: "PENDING" }),
                suggestionFixture({
                  id: "66666666-6666-4666-8666-666666666666",
                  field: "description",
                  status: "ACCEPTED",
                }),
              ]),
            ),
        },
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={1} blocked={false} />,
    );

    expect((await screen.findAllByText("PENDING")).length).toBe(1);
    expect(screen.getByText("ACCEPTED")).toBeTruthy();
    const acceptButtons = screen.getAllByRole("button", { name: "Accept" });
    const rejectButtons = screen.getAllByRole("button", { name: "Reject" });
    expect(acceptButtons).toHaveLength(1);
    expect(rejectButtons).toHaveLength(1);
  });

  it("POSTs accept when Accept is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(routes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={1} blocked={false} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/suggestions/${suggestionFixture().id}/accept`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("shows the hard-block banner when pendingSuggestions > 0", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={2} blocked={false} />,
    );

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("2 unresolved AI suggestion");
    expect(banner.textContent).toContain("Send");
    expect(banner.textContent).toContain("OTX");
  });

  it("shows the banner on a 409 block flag even with zero pending suggestions", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={true} />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("hides the banner when nothing blocks delivery", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
