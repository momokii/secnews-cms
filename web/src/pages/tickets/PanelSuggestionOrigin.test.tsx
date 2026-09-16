import { fireEvent, screen } from "@testing-library/react";
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

  it("wraps long source titles and truncates notes preview to 100 chars with toggle", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(suggestionRoutes()));
    const longTitle =
      "judul 1 dengan penjelasan sangat panjang mengenai kerentanan yang ditemukan pada sistem autentikasi internal";
    const longNotes =
      "Catatan lengkap: analisis mendalam, langkah mitigasi sementara, daftar versi yang terdampak, dan tautan referensi tambahan yang harus diverifikasi ulang";
    renderWithProviders(
      <SourceDraftPanel ticketId={TICKET_ID} sources={[{ ...sourceA(), title: longTitle, notes: longNotes }]} />,
    );

    const titleEl = await screen.findByText(longTitle);
    expect(titleEl.className).toContain("break-words");
    expect(titleEl.className).not.toContain("truncate");

    const preview = longNotes.slice(0, 100);
    expect(screen.getByText((c) => c.includes(preview))).toBeTruthy();
    expect(screen.queryByText(longNotes)).toBeNull();
    const toggle = screen.getByRole("button", { name: /Show more/i });
    expect(toggle).toBeTruthy();

    fireEvent.click(toggle);
    const expandedEl = await screen.findByText(longNotes);
    expect(expandedEl.className).toContain("break-words");
    expect(expandedEl.className).not.toContain("truncate");
  });
});
