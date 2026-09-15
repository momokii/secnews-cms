import { screen, fireEvent, waitFor, within } from "@testing-library/react";
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

    // The action filter select also carries the raw action names as options,
    // so entry assertions scope away from option elements.
    expect(await screen.findByText(/by Editor/)).toBeTruthy();
    expect(screen.getByText("STATUS_CHANGED", { ignore: "option" })).toBeTruthy();
    expect(screen.getByText("2026-09-14 16:00 WIB")).toBeTruthy();
    expect(screen.getByText("Status: OPEN → RESEARCH")).toBeTruthy();
  });

  it("requests the next page via the shared Pagination controls", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([{
      match: (url, method) => method === "GET" && url.includes("/activity"),
      respond: () => jsonResponse({ ...paginated([activityFixture()]), total: 41 }),
    }]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/by Editor/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=2"),
      expect.anything(),
    ));
  });
});

describe("TASK-UIC: activity page size", () => {
  it("defaults to 5 per page and honors the 5/10/20 selector", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([{
      match: (url, method) => method === "GET" && url.includes("/activity"),
      respond: () => jsonResponse({ ...paginated([activityFixture()]), pageSize: 5 }),
    }]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/by Editor/);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=1&pageSize=5"),
      expect.anything(),
    );

    fireEvent.change(screen.getByLabelText("Items per page"), { target: { value: "10" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=1&pageSize=10"),
      expect.anything(),
    ));
  });

  it("resets to page 1 when the page size changes", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([{
      match: (url, method) => method === "GET" && url.includes("/activity"),
      respond: () => jsonResponse({ ...paginated([activityFixture()]), total: 41, pageSize: 5 }),
    }]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/by Editor/);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=2"),
      expect.anything(),
    ));

    fireEvent.change(screen.getByLabelText("Items per page"), { target: { value: "20" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=1&pageSize=20"),
      expect.anything(),
    ));
  });
});

describe("TASK-UIB: activity detail rendering", () => {
  const OTX_PULSE_ID = "4d5e6f70-a1b2-4c3d-8e9f-001122334455";

  function stubActivity(entry: Partial<ReturnType<typeof activityFixture>>): void {
    vi.stubGlobal("fetch", routeFetch([{
      match: (url, method) => method === "GET" && url.includes("/activity"),
      respond: () => jsonResponse(paginated([activityFixture(entry)])),
    }]));
  }

  it("lists edited field names for legacy rows with names-only detail", async () => {
    // Given: a legacy FIELDS_UPDATED row whose detail predates value capture
    setToken("test-token");
    stubActivity({ action: "FIELDS_UPDATED", detail: "title, overview" });

    // When: the timeline renders the FIELDS_UPDATED entry
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);

    // Then: the field names are listed with an explicit note, no invented values
    expect(await screen.findByText("Updated fields: title, overview")).toBeTruthy();
    expect(screen.getByText("previous values are not recorded")).toBeTruthy();
  });

  it("renders per-field old → new rows when values are recorded", async () => {
    // Given: a FIELDS_UPDATED row whose detail carries recorded values
    setToken("test-token");
    stubActivity({
      action: "FIELDS_UPDATED",
      detail: JSON.stringify({
        title: { from: "Old title", to: "New title" },
        tlp: { from: "AMBER", to: "GREEN" },
      }),
    });

    // When: the timeline renders the entry
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);

    // Then: each changed field renders old → new, without the fallback note
    expect(await screen.findByText("title:")).toBeTruthy();
    expect(screen.getByText("Old title")).toBeTruthy();
    expect(screen.getByText("New title")).toBeTruthy();
    expect(screen.getByText("tlp:")).toBeTruthy();
    expect(screen.getByText("AMBER")).toBeTruthy();
    expect(screen.getByText("GREEN")).toBeTruthy();
    expect(screen.queryByText("previous values are not recorded")).toBeNull();
  });

  it("truncates long recorded values for display with the full text in the title", async () => {
    // Given: a recorded change from an unset overview to a 200-char value
    const longTo = "z".repeat(200);
    const displayed = `${"z".repeat(120)}…`;
    setToken("test-token");
    stubActivity({
      action: "FIELDS_UPDATED",
      detail: JSON.stringify({ overview: { from: null, to: longTo } }),
    });

    // When: the timeline renders the entry
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);

    // Then: the display shows the 120-char truncation (null → "(empty)") and
    // the title attribute carries the full value
    expect(await screen.findByText("(empty)")).toBeTruthy();
    expect(screen.getByText(displayed)).toBeTruthy();
    expect(screen.queryByText(longTo)).toBeNull();
    expect(screen.getByText(displayed).getAttribute("title")).toBe(longTo);
  });

  it("expands OTX pushes to the pulse id with a View-on-OTX link", async () => {
    // Given: an OTX_PUSHED entry whose pulse id matches the ticket's pulse
    setToken("test-token");
    stubActivity({ action: "OTX_PUSHED", detail: `${OTX_PULSE_ID} (updated)` });

    // When: the timeline renders with the confirmed pulse url
    renderWithProviders(
      <ActivityTimeline
        ticketId={TICKET_ID}
        pulseId={OTX_PULSE_ID}
        pulseUrl={`https://otx.alienvault.com/pulse/${OTX_PULSE_ID}`}
      />,
    );

    // Then: the expandable row shows the pulse id, the update marker, and a
    // View on OTX link pointing at the pulse url
    fireEvent.click(await screen.findByText("OTX push detail"));
    expect(screen.getByText(`${OTX_PULSE_ID} (updated)`)).toBeTruthy();
    const link = screen.getByRole("link", { name: "View on OTX" });
    expect(link.getAttribute("href")).toBe(`https://otx.alienvault.com/pulse/${OTX_PULSE_ID}`);
  });

  it("shows only the pulse id when no confirmed pulse url is available", async () => {
    // Given: an OTX_PUSHED entry and no pulse props on the timeline
    setToken("test-token");
    stubActivity({ action: "OTX_PUSHED", detail: OTX_PULSE_ID });

    // When: the timeline renders without pulse context
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);

    // Then: the id is shown without an invented link
    fireEvent.click(await screen.findByText("OTX push detail"));
    expect(screen.getByText(OTX_PULSE_ID)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View on OTX" })).toBeNull();
  });

  it("renders suggestion accept/reject decisions from the detail JSON", async () => {
    // Given: a SUGGESTION_ACCEPTED row whose detail is {field, value, decision}
    setToken("test-token");
    stubActivity({
      action: "SUGGESTION_ACCEPTED",
      detail: JSON.stringify({
        field: "overview",
        value: "Attackers exploit CVE-2026-1234.",
        decision: "ACCEPTED",
      }),
    });

    // When: the timeline renders the entry
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);

    // Then: field, merged value and decision render without raw JSON
    expect(await screen.findByText("overview:")).toBeTruthy();
    expect(screen.getByText("Attackers exploit CVE-2026-1234.")).toBeTruthy();
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(screen.queryByText(/\{"field"/)).toBeNull();
  });

  it("renders a rejected decision with the rejected value", async () => {
    setToken("test-token");
    stubActivity({
      action: "SUGGESTION_REJECTED",
      detail: JSON.stringify({
        field: "description",
        value: "Speculative vendor blame.",
        decision: "REJECTED",
      }),
    });
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);

    expect(await screen.findByText("description:")).toBeTruthy();
    expect(screen.getByText("Speculative vendor blame.")).toBeTruthy();
    expect(screen.getByText("rejected")).toBeTruthy();
  });

  it("renders suggestion rows with unparseable details verbatim", async () => {
    setToken("test-token");
    stubActivity({ action: "SUGGESTION_ACCEPTED", detail: "legacy freeform note" });
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);

    expect(await screen.findByText("legacy freeform note")).toBeTruthy();
  });
});

describe("TASK-UIF: activity action filter", () => {
  function stubFilteredActivity(total = 41): ReturnType<typeof vi.fn> {
    const fetchMock = routeFetch([{
      match: (url, method) => method === "GET" && url.includes("/activity"),
      respond: () =>
        jsonResponse({ ...paginated([activityFixture()]), total }),
    }]);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("offers All actions plus every activity action, defaulting to unfiltered", async () => {
    // Given: the timeline is rendered with no action filter chosen
    setToken("test-token");
    const fetchMock = stubFilteredActivity();

    // When: the filter select renders
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);
    const select = (await screen.findByLabelText(
      "Filter by action",
    )) as HTMLSelectElement;
    await screen.findByText("STATUS_CHANGED");

    // Then: All actions is first/default and IOC_ADDED is among the options,
    // and the initial request carries no action param
    const names = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(names[0]).toBe("All actions");
    expect(names).toContain("IOC_ADDED");
    expect(names).toContain("SUGGESTION_ACCEPTED");
    expect(select.value).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=1&pageSize=5"),
      expect.anything(),
    );
  });

  it("requests the selected action server-side via ?action=", async () => {
    // Given: the timeline shows unfiltered activity
    setToken("test-token");
    const fetchMock = stubFilteredActivity();
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/by Editor/);

    // When: IOC_ADDED is chosen in the action filter
    fireEvent.change(screen.getByLabelText("Filter by action"), {
      target: { value: "IOC_ADDED" },
    });

    // Then: the refetch URL carries action=IOC_ADDED
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=1&pageSize=5&action=IOC_ADDED"),
      expect.anything(),
    ));
  });

  it("resets to page 1 when the action filter changes", async () => {
    // Given: the timeline is paged to page 2
    setToken("test-token");
    const fetchMock = stubFilteredActivity();
    renderWithProviders(<ActivityTimeline ticketId={TICKET_ID} />);
    await screen.findByText(/by Editor/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=2"),
      expect.anything(),
    ));

    // When: a different action filter is picked
    fireEvent.change(screen.getByLabelText("Filter by action"), {
      target: { value: "OTX_PUSHED" },
    });

    // Then: the refetch starts over at page 1 with the action applied
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity?page=1&pageSize=5&action=OTX_PUSHED"),
      expect.anything(),
    ));
  });
});
