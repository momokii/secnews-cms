import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type {
  AiSuggestion,
  DeliveryAudit,
  Ioc,
  TicketDetail,
} from "../../lib/ticketsApi";

/** Shared fixtures + fetch routing for the tickets workspace tests. */

export const TICKET_ID = "11111111-1111-4111-8111-111111111111";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

export function paginated<T>(items: T[]): { items: T[]; total: number; page: number; pageSize: number } {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

export function ticketDetailFixture(
  overrides: Partial<TicketDetail> = {},
): TicketDetail {
  return {
    id: TICKET_ID,
    title: "OpenSSL vulnerability",
    origin: "AUTO_FEED",
    findingType: "VULNERABILITY_CVE",
    status: "READY",
    cveIds: ["CVE-2026-1234"],
    affectedProduct: "OpenSSL",
    affectedVersions: "3.2.0 - 3.2.1",
    mitigation: "Upgrade to 3.2.2",
    threatName: null,
    overview: null,
    description: null,
    recommendations: null,
    references: [],
    tlp: "AMBER",
    feedItemId: null,
    otxPulseId: null,
    otxPulseUrl: null,
    createdAt: "2026-09-13T10:00:00.000Z",
    updatedAt: "2026-09-14T08:00:00.000Z",
    sources: [],
    iocs: [],
    pendingSuggestions: 0,
    ...overrides,
  };
}

export function suggestionFixture(
  overrides: Partial<AiSuggestion> = {},
): AiSuggestion {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    ticketId: TICKET_ID,
    field: "overview",
    currentValue: null,
    suggestedValue: "Attackers exploit CVE-2026-1234 via crafted certs.",
    status: "PENDING",
    model: "gemini",
    createdAt: "2026-09-14T08:00:00.000Z",
    updatedAt: "2026-09-14T08:00:00.000Z",
    ...overrides,
  };
}

export function iocFixture(overrides: Partial<Ioc> = {}): Ioc {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    ticketId: TICKET_ID,
    type: "DOMAIN",
    value: "evil.example",
    context: null,
    origin: null,
    includeInBulletin: true,
    createdById: null,
    createdAt: "2026-09-14T08:00:00.000Z",
    ...overrides,
  };
}

export function auditFixture(
  overrides: Partial<DeliveryAudit> = {},
): DeliveryAudit {
  return {
    id: 1,
    ticketId: 10,
    channelId: 3,
    channelType: "TELEGRAM",
    clientId: 2,
    clientName: "Acme SOC",
    target: "chat:-100200",
    payload: "Bulletin body for CVE-2026-1234",
    status: "SENT",
    errorDetail: null,
    sentById: 1,
    sentAt: "2026-09-14T09:00:00.000Z",
    ...overrides,
  };
}

export function routeFetch(
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

export function renderWithProviders(ui: ReactElement): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
