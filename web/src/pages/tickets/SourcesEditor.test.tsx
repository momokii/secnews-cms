import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  renderWithProviders,
  routeFetch,
} from "./testUtils";
import { SourcesEditor } from "./SourcesEditor";
import type { TicketSource } from "../../lib/ticketsApi";

const TOOLTIP =
  "Working materials — links, docs, or references the analyst used; add what you learned from each source in Notes";

function sourceFixture(overrides: Partial<TicketSource> = {}): TicketSource {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    ticketId: TICKET_ID,
    url: null,
    note: null,
    title: null,
    notes: null,
    createdById: null,
    createdAt: "2026-09-14T08:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Sources editor", () => {
  it("shows the section tooltip explaining what Sources are for", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(<SourcesEditor ticketId={TICKET_ID} sources={[]} />);
    expect(screen.getByTitle(TOOLTIP)).toBeTruthy();
    expect(screen.getByRole("button", { name: "About sources" })).toBeTruthy();
  });

  it("renders a url source as a link with no title text", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <SourcesEditor
        ticketId={TICKET_ID}
        sources={[sourceFixture({ url: "https://openssl.org/advisory" })]}
      />,
    );
    const link = screen.getByRole("link", { name: "https://openssl.org/advisory" });
    expect(link.getAttribute("href")).toBe("https://openssl.org/advisory");
  });

  it("renders a non-URL source by its title with persisted notes", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <SourcesEditor
        ticketId={TICKET_ID}
        sources={[
          sourceFixture({ title: "Vendor PDF: openssl-advisory.pdf", notes: "Confirmed the CVE affects 3.2.1." }),
        ]}
      />,
    );
    expect(screen.getByText("Vendor PDF: openssl-advisory.pdf")).toBeTruthy();
    expect(screen.getByText("Confirmed the CVE affects 3.2.1.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("saves a non-URL source with title and notes via the add modal", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "POST" && url === `/api/tickets/${TICKET_ID}/sources`,
        respond: () =>
          jsonResponse(
            sourceFixture({ title: "Slack thread #incident-42", notes: "Timeline reconstructed." }),
            201,
          ),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<SourcesEditor ticketId={TICKET_ID} sources={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add source" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Slack thread #incident-42" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Timeline reconstructed." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/sources`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Slack thread #incident-42", notes: "Timeline reconstructed." }),
        }),
      ),
    );
  });

  it("truncates long notes to a 120-char preview expandable in place", () => {
    const longNotes = "a".repeat(200);
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <SourcesEditor ticketId={TICKET_ID} sources={[sourceFixture({ title: "PDF", notes: longNotes })]} />,
    );
    expect(screen.getByText("a".repeat(120))).toBeTruthy();
    expect(screen.queryByText(longNotes)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByText(longNotes)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText(longNotes)).toBeNull();
  });

  it("edits a source through the modal and PATCHes the changes", async () => {
    const sourceId = "22222222-2222-4222-8222-222222222222";
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "PATCH" && url === `/api/tickets/${TICKET_ID}/sources/${sourceId}`,
        respond: () => jsonResponse(sourceFixture({ title: "Vendor PDF", notes: "Updated notes." })),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <SourcesEditor
        ticketId={TICKET_ID}
        sources={[sourceFixture({ id: sourceId, title: "Vendor PDF", notes: "Old notes." })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit source" }));
    const notesField = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(notesField.value).toBe("Old notes.");
    fireEvent.change(notesField, { target: { value: "Updated notes." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/sources/${sourceId}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ notes: "Updated notes." }),
        }),
      ),
    );
  });

  it("asks for confirmation before deleting a source", async () => {
    const sourceId = "22222222-2222-4222-8222-222222222222";
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "DELETE" && url === `/api/tickets/${TICKET_ID}/sources/${sourceId}`,
        respond: () => new Response(null, { status: 204 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <SourcesEditor ticketId={TICKET_ID} sources={[sourceFixture({ id: sourceId, title: "Vendor PDF" })]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete source" }));
    expect(screen.queryByRole("button", { name: "Delete" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/sources/${sourceId}`,
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});

describe("TASK-UXT: sources taller notes editor", () => {
  it("opens the notes textarea at 8 rows and vertically resizable", () => {
    // Given: the add-source modal is open
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(<SourcesEditor ticketId={TICKET_ID} sources={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add source" }));

    // When: the notes textarea renders
    const notes = screen.getByLabelText("Notes") as HTMLTextAreaElement;

    // Then: it starts at 8 rows and can be resized vertically
    expect(notes.rows).toBe(8);
    expect(notes.className).toContain("resize-y");
  });
});

describe("TASK-UXT: sources pagination and search", () => {
  function sevenSources(): TicketSource[] {
    return Array.from({ length: 7 }, (_, index) =>
      sourceFixture({
        id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
        title: `Source ${index + 1}`,
      }),
    );
  }

  function editCount(): number {
    return screen.getAllByRole("button", { name: "Edit source" }).length;
  }

  it("pages long source lists at 5 per page via the shared Pagination", () => {
    // Given: seven sources exist on the ticket
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <SourcesEditor ticketId={TICKET_ID} sources={sevenSources()} />,
    );

    // Then: only the first five rows show and the footer reports 2 pages
    expect(editCount()).toBe(5);
    expect(screen.getByText("Page 1 of 2 — 7 sources")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(editCount()).toBe(2);
    expect(screen.getByText("Source 6")).toBeTruthy();
    expect(screen.getByText("Source 7")).toBeTruthy();
  });

  it("filters sources by title case-insensitively after a 300ms debounce", () => {
    // Given: seven sources with one titled "Vendor PDF"
    vi.useFakeTimers();
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    const sources = sevenSources();
    sources[2] = sourceFixture({
      id: sources[2].id,
      title: "Vendor PDF: advisory",
    });
    renderWithProviders(<SourcesEditor ticketId={TICKET_ID} sources={sources} />);

    // When: a title fragment is typed into the search box
    fireEvent.change(screen.getByLabelText("Search sources"), {
      target: { value: "vendor pdf" },
    });

    // Then: before the debounce elapses the unfiltered page still shows
    expect(editCount()).toBe(5);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(editCount()).toBe(1);
    expect(screen.getByText("Vendor PDF: advisory")).toBeTruthy();
    expect(screen.queryByText("Source 1")).toBeNull();
    vi.useRealTimers();
  });

  it("matches search against the url when the source has no title", () => {
    // Given: one url-only source among titled ones
    vi.useFakeTimers();
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    const sources = sevenSources();
    sources[0] = sourceFixture({
      id: sources[0].id,
      title: null,
      url: "https://openssl.org/advisory",
    });
    renderWithProviders(<SourcesEditor ticketId={TICKET_ID} sources={sources} />);

    // When: a url fragment is searched
    fireEvent.change(screen.getByLabelText("Search sources"), {
      target: { value: "OPENSSL.ORG" },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Then: the url-only source matches case-insensitively
    expect(
      screen.getByRole("link", { name: "https://openssl.org/advisory" }),
    ).toBeTruthy();
    expect(editCount()).toBe(1);
    vi.useRealTimers();
  });

  it("resets to page 1 when the search narrows the list", () => {
    // Given: seven sources paged to page 2
    vi.useFakeTimers();
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    const sources = sevenSources();
    sources[2] = sourceFixture({
      id: sources[2].id,
      title: "Needle in haystack",
    });
    renderWithProviders(<SourcesEditor ticketId={TICKET_ID} sources={sources} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Source 6")).toBeTruthy();

    // When: a search matching one source on page 1 is applied
    fireEvent.change(screen.getByLabelText("Search sources"), {
      target: { value: "needle" },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Then: the view restarts at page 1 and shows the match
    expect(screen.getByText("Page 1 of 1 — 1 source")).toBeTruthy();
    expect(screen.getByText("Needle in haystack")).toBeTruthy();
    vi.useRealTimers();
  });
});
