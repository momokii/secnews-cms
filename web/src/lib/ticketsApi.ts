import { apiFetch } from "./api";
import {
  type AiRunBody,
  type AiSuggestion,
  type CreateIocBody,
  type CreateTicketBody,
  type CreateTicketSourceBody,
  type DeliveryAudit,
  type Ioc,
  type OtxPushResponse,
  type Paginated,
  type PatchTicketFieldsBody,
  type SendResponse,
  type SuggestionStatus,
  type Ticket,
  type TicketActivity,
  type TicketActivityAction,
  type TicketDetail,
  type TicketSource,
  type TicketStatus,
  type TicketsQuery,
  type UpdateIocBody,
  type UpdateTicketSourceBody,
} from "./ticketsTypes";

export {
  DELIVERY_STATUSES,
  FINDING_TYPES,
  IOC_TYPES,
  SUGGESTION_STATUSES,
  AI_PROVIDERS,
  CHANNEL_TYPES,
  TICKET_ACTIVITY_ACTIONS,
  TICKET_ORIGINS,
  TICKET_STATUSES,
  TLP_LEVELS,
} from "./ticketsTypes";
export type {
  AiProviderKind,
  AiRunBody,
  AiSuggestion,
  ChannelType,
  CreateIocBody,
  CreateTicketBody,
  CreateTicketSourceBody,
  DeliveryAudit,
  DeliveryStatus,
  FindingType,
  Ioc,
  IocType,
  OtxPushResponse,
  Paginated,
  PatchTicketFieldsBody,
  SendResponse,
  SuggestionStatus,
  Ticket,
  TicketActivity,
  TicketActivityAction,
  TicketDetail,
  TicketOrigin,
  TicketSource,
  TicketStatus,
  Tlp,
  TicketsQuery,
  UpdateIocBody,
  UpdateTicketSourceBody,
} from "./ticketsTypes";

/** Fetch functions for the ticket workflow (contract #21-36, #47-48, #52). */

const DEFAULT_PAGE_SIZE = 20;

/** Builds "a=1&b=2" from defined params only; booleans/numbers stringify. */
function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded === "" ? "" : `?${encoded}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ---- Tickets (#21-26) ----

export async function listTickets(query: TicketsQuery = {}): Promise<Paginated<Ticket>> {
  const response = await apiFetch(
    `/tickets${buildQuery({
      q: query.q,
      status: query.status,
      origin: query.origin,
      findingType: query.findingType,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
      from: query.from,
      to: query.to,
    })}`,
    { method: "GET" },
  );
  return readJson<Paginated<Ticket>>(response);
}

export async function getTicket(id: string): Promise<TicketDetail> {
  const response = await apiFetch(`/tickets/${id}`, { method: "GET" });
  return readJson<TicketDetail>(response);
}

/** POST /tickets — quick-capture manual create; origin is MANUAL server-side. */
export async function createTicket(body: CreateTicketBody): Promise<Ticket> {
  const response = await apiFetch("/tickets", jsonInit("POST", body));
  return readJson<Ticket>(response);
}

/** POST /tickets/:id/transition { to } — legality + role gate per STATES.md. */
export async function transitionTicket(id: string, to: TicketStatus): Promise<Ticket> {
  const response = await apiFetch(`/tickets/${id}/transition`, jsonInit("POST", { to }));
  return readJson<Ticket>(response);
}

/** PATCH /tickets/:id/fields — final output fields (any subset). */
export async function patchTicketFields(
  id: string,
  patch: PatchTicketFieldsBody,
): Promise<Ticket> {
  const response = await apiFetch(`/tickets/${id}/fields`, jsonInit("PATCH", patch));
  return readJson<Ticket>(response);
}

// ---- Sources (#27-28) ----

export async function addTicketSource(
  id: string,
  body: CreateTicketSourceBody,
): Promise<TicketSource> {
  const response = await apiFetch(`/tickets/${id}/sources`, jsonInit("POST", body));
  return readJson<TicketSource>(response);
}

export async function updateTicketSource(
  id: string,
  sourceId: string,
  patch: UpdateTicketSourceBody,
): Promise<TicketSource> {
  const response = await apiFetch(`/tickets/${id}/sources/${sourceId}`, jsonInit("PATCH", patch));
  return readJson<TicketSource>(response);
}

export async function deleteTicketSource(id: string, sourceId: string): Promise<void> {
  await apiFetch(`/tickets/${id}/sources/${sourceId}`, { method: "DELETE" });
}

// ---- IOCs (#29-31) ----

export async function addIoc(id: string, body: CreateIocBody): Promise<Ioc> {
  const response = await apiFetch(`/tickets/${id}/iocs`, jsonInit("POST", body));
  return readJson<Ioc>(response);
}

export async function updateIoc(
  id: string,
  iocId: string,
  patch: UpdateIocBody,
): Promise<Ioc> {
  const response = await apiFetch(`/tickets/${id}/iocs/${iocId}`, jsonInit("PATCH", patch));
  return readJson<Ioc>(response);
}

export async function deleteIoc(id: string, iocId: string): Promise<void> {
  await apiFetch(`/tickets/${id}/iocs/${iocId}`, { method: "DELETE" });
}

// ---- AI assist (#32-36) ----

/** Strict fill: suggests ONLY missing final fields. Body carries optional
 * provider/model overrides (TASK-UIC2); empty object = server default. */
export async function aiFill(
  id: string,
  body: AiRunBody = {},
): Promise<{ suggestions: AiSuggestion[] }> {
  const response = await apiFetch(`/tickets/${id}/ai/fill`, jsonInit("POST", body));
  return readJson(response);
}

/** Enrich: full rewrite proposals. Same optional provider/model overrides. */
export async function aiEnrich(
  id: string,
  body: AiRunBody = {},
): Promise<{ suggestions: AiSuggestion[] }> {
  const response = await apiFetch(`/tickets/${id}/ai/enrich`, jsonInit("POST", body));
  return readJson(response);
}

export async function listSuggestions(
  id: string,
  status?: SuggestionStatus,
  page = 1,
): Promise<Paginated<AiSuggestion>> {
  const response = await apiFetch(
    `/tickets/${id}/suggestions${buildQuery({
      status,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    })}`,
    { method: "GET" },
  );
  return readJson<Paginated<AiSuggestion>>(response);
}

export async function acceptSuggestion(
  id: string,
  suggestionId: string,
): Promise<{ suggestion: AiSuggestion }> {
  const response = await apiFetch(
    `/tickets/${id}/suggestions/${suggestionId}/accept`,
    { method: "POST" },
  );
  return readJson(response);
}

export async function rejectSuggestion(
  id: string,
  suggestionId: string,
): Promise<{ suggestion: AiSuggestion }> {
  const response = await apiFetch(
    `/tickets/${id}/suggestions/${suggestionId}/reject`,
    { method: "POST" },
  );
  return readJson(response);
}

/** DELETE /tickets/suggestions/:id — answers 204; ACCEPTED rows delete too
 * and the merged field values stay on the ticket. */
export async function deleteSuggestion(_ticketId: string, suggestionId: string): Promise<void> {
  await apiFetch(`/tickets/suggestions/${suggestionId}`, { method: "DELETE" });
}

// ---- Delivery (#47-48) ----

/** Send — `all` resolves to currently-ACTIVE channels only (S3). */
export async function sendTicket(
  id: string,
  body: { channelIds?: string[]; all?: boolean },
): Promise<SendResponse> {
  const response = await apiFetch(`/tickets/${id}/send`, jsonInit("POST", body));
  return readJson<SendResponse>(response);
}

export async function listDeliveryAudit(
  id: string,
  page = 1,
): Promise<Paginated<DeliveryAudit>> {
  const response = await apiFetch(
    `/tickets/${id}/delivery-audit${buildQuery({ page, pageSize: DEFAULT_PAGE_SIZE })}`,
    { method: "GET" },
  );
  return readJson<Paginated<DeliveryAudit>>(response);
}

/** GET /tickets/:id/activity — server-side action filter; undefined = all. */
export async function listTicketActivity(
  id: string,
  page = 1,
  pageSize = 5,
  action?: TicketActivityAction,
): Promise<Paginated<TicketActivity>> {
  const response = await apiFetch(
    `/tickets/${id}/activity${buildQuery({ page, pageSize, action })}`,
    { method: "GET" },
  );
  return readJson<Paginated<TicketActivity>>(response);
}

// ---- OTX (#52) ----

/** Push IOCs with includeInBulletin=true; READY + zero PENDING suggestions required. */
export async function pushOtx(id: string): Promise<OtxPushResponse> {
  const response = await apiFetch(`/tickets/${id}/otx`, jsonInit("POST", {}));
  return readJson<OtxPushResponse>(response);
}
