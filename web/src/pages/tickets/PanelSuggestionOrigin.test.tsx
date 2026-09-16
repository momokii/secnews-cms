import { screen } from "@testing-library/react";
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
import { AiPanel } from "./AiPanel";
import { SourceDraftPanel } from "./SourceDraftPanel";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const SOURCE_A_ID = "22222222-2222-4222-8222-222222222222";

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

function suggestionRoutes(): Array<{
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
      match: (url, method) => method === "GET" && url.endsWith("/integrations/available"),
      respond: () => jsonResponse([]),
    },
  ];
}

function calledUrls(fetchMock: ReturnType<typeof routeFetch>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe("FE-ORIGIN: each ticket detail panel lists only its own suggestions", () => {
  it("AI assist fetches suggestions with the FILL,ENRICH origin filter", async () => {
    // Given: the AI assist panel rendered
    setToken("test-token");
    const fetchMock = routeFetch(suggestionRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />);

    // When: the panel's suggestion list loads
    await screen.findByText("Attackers exploit CVE-2026-1234 via crafted certs.");

    // Then: the list query is scoped to the assist origins
    expect(calledUrls(fetchMock).some((url) => url.includes("origin=FILL%2CENRICH"))).toBe(true);
  });

  it("Source draft fetches suggestions with the SOURCE_DRAFT origin filter", async () => {
    // Given: the source draft panel rendered
    setToken("test-token");
    const fetchMock = routeFetch(suggestionRoutes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<SourceDraftPanel ticketId={TICKET_ID} sources={[sourceA()]} />);

    // When: the panel's suggestion list loads
    await screen.findByRole("checkbox", { name: "Select source: OpenSSL security advisory" });

    // Then: the list query is scoped to source-draft rows only
    expect(calledUrls(fetchMock).some((url) => url.includes("origin=SOURCE_DRAFT"))).toBe(true);
  });

  it("wraps long source titles and notes instead of truncating them", async () => {
    // Given: a source whose title and notes are long enough to need wrapping
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(suggestionRoutes()));
    const longTitle =
      "judul 1 dengan penjelasan sangat panjang mengenai kerentanan yang ditemukan pada sistem autentikasi internal";
    const longNotes =
      "Catatan lengkap: analisis mendalam, langkah mitigasi sementara, daftar versi yang terdampak, dan tautan referensi tambahan yang harus diverifikasi ulang";
    renderWithProviders(<SourceDraftPanel ticketId={TICKET_ID} sources={[{ ...sourceA(), title: longTitle, notes: longNotes }]} />);

    // When: the source list renders
    const titleEl = await screen.findByText(longTitle);
    const notesEl = screen.getByText(longNotes);

    // Then: the text wraps (break-words) and is no longer clipped (truncate)
    expect(titleEl.className).toContain("break-words");
    expect(titleEl.className).not.toContain("truncate");
    expect(notesEl.className).toContain("break-words");
    expect(notesEl.className).not.toContain("truncate");
  });
});
