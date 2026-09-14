import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  renderWithProviders,
  routeFetch,
} from "./testUtils";
import { SourcesEditor } from "./SourcesEditor";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Sources editor", () => {
  it("renders existing sources as links and notes", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <SourcesEditor
        ticketId={TICKET_ID}
        sources={[
          {
            id: "22222222-2222-4222-8222-222222222222",
            ticketId: TICKET_ID,
            url: "https://openssl.org/advisory",
            note: "Vendor advisory",
            createdById: null,
            createdAt: "2026-09-14T08:00:00.000Z",
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: "https://openssl.org/advisory" });
    expect(link.getAttribute("href")).toBe("https://openssl.org/advisory");
    const note = screen.getByText("Vendor advisory");
    expect(link.textContent).toBe("https://openssl.org/advisory");
    expect(link.contains(note)).toBe(false);
  });

  it("stacks the url link and note as separate lines in one row column", () => {
    // Given: a source row carrying both a url and a note
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <SourcesEditor
        ticketId={TICKET_ID}
        sources={[
          {
            id: "22222222-2222-4222-8222-222222222222",
            ticketId: TICKET_ID,
            url: "https://openssl.org/advisory",
            note: "Vendor advisory",
            createdById: null,
            createdAt: "2026-09-14T08:00:00.000Z",
          },
        ]}
      />,
    );

    // When: the row renders
    const link = screen.getByRole("link", { name: "https://openssl.org/advisory" });
    const note = screen.getByText("Vendor advisory");

    // Then: link and note are stacked siblings in a single column container —
    // never run together on one inline line
    expect(link.parentElement).not.toBeNull();
    expect(link.parentElement).toBe(note.parentElement);
    expect(link.parentElement?.className).toContain("flex-col");
  });

  it("POSTs the new source when Add source is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "POST" && url === `/api/tickets/${TICKET_ID}/sources`,
        respond: () =>
          jsonResponse(
            {
              id: "22222222-2222-4222-8222-222222222222",
              ticketId: TICKET_ID,
              url: null,
              note: "vendor advisory",
              createdById: null,
              createdAt: "2026-09-14T08:00:00.000Z",
            },
            201,
          ),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<SourcesEditor ticketId={TICKET_ID} sources={[]} />);

    fireEvent.change(screen.getByLabelText("Source note"), {
      target: { value: "vendor advisory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add source" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/sources`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ note: "vendor advisory" }),
        }),
      ),
    );
  });

  it("DELETEs a source when its delete button is clicked", async () => {
    setToken("test-token");
    const sourceId = "22222222-2222-4222-8222-222222222222";
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "DELETE" && url === `/api/tickets/${TICKET_ID}/sources/${sourceId}`,
        respond: () => new Response(null, { status: 204 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <SourcesEditor
        ticketId={TICKET_ID}
        sources={[
          {
            id: sourceId,
            ticketId: TICKET_ID,
            url: null,
            note: "Vendor advisory",
            createdById: null,
            createdAt: "2026-09-14T08:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete source" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/sources/${sourceId}`,
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("keeps Add source disabled until a url or note is entered", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <SourcesEditor ticketId={TICKET_ID} sources={[]} />,
    );
    expect(
      (screen.getByRole("button", { name: "Add source" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
