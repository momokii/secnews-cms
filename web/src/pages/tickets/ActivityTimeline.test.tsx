import { screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import { activityFixture, jsonResponse, paginated, renderWithProviders, routeFetch, TICKET_ID } from "./testUtils";
import { ActivityTimeline } from "./ActivityTimeline";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("FE-ACT-01: ticket activity timeline", () => {
  it("renders actor, action, WIB timestamp, and detail", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([{
      match: (url, method) => method === "GET" && url.includes("/activity"),
      respond: () => jsonResponse(paginated([activityFixture()])),
    }]));
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);

    expect(await screen.findByText("STATUS_CHANGED")).toBeTruthy();
    expect(screen.getByText(/by Editor/)).toBeTruthy();
    expect(screen.getByText("2026-09-14 16:00 WIB")).toBeTruthy();
    expect(screen.getByText("status OPEN→RESEARCH")).toBeTruthy();
  });

  it("requests the next page", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([{
      match: (url, method) => method === "GET" && url.includes("/activity"),
      respond: () => jsonResponse({ ...paginated([activityFixture()]), total: 41 }),
    }]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);
    await screen.findByText("STATUS_CHANGED");
    fireEvent.click(screen.getByRole("button", { name: "Next activity page" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=2"),
      expect.anything(),
    ));
  });
});
