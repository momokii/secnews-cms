/**
 * Wire types for the ticket workflow (contract #21-36, #47-48, #52).
 * Shapes mirror src/modules/{tickets,ai,delivery,otx}/schema.ts — every entity
 * id is a uuid string (schema.prisma: String @id @default(uuid()) on all models).
 * Fetch functions live in ticketsApi.ts; this file is the pure contract mirror.
 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** OPEN → RESEARCH → READY → SENT → CLOSED; cancel path into CLOSED (docs/STATES.md §1). */
export const TICKET_STATUSES = ["OPEN", "RESEARCH", "READY", "SENT", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_ORIGINS = ["AUTO_FEED", "MANUAL"] as const;
export type TicketOrigin = (typeof TICKET_ORIGINS)[number];

export const FINDING_TYPES = ["VULNERABILITY_CVE", "THREAT_CAMPAIGN", "OTHER"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const TLP_LEVELS = ["CLEAR", "GREEN", "AMBER", "RED"] as const;
export type Tlp = (typeof TLP_LEVELS)[number];

/** The 12 confirmed IOC types (docs/STATES.md §3). */
export const IOC_TYPES = [
  "DOMAIN",
  "IPV4",
  "IPV6",
  "URL",
  "EMAIL",
  "MD5",
  "SHA1",
  "SHA256",
  "FILEPATH",
  "MUTEX",
  "CIDR",
  "OTHER",
] as const;
export type IocType = (typeof IOC_TYPES)[number];

export const SUGGESTION_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/** Which AI flow produced a suggestion — the ticket detail panels filter on
 * this so AI assist never shows source-draft rows and vice versa. */
export const SUGGESTION_ORIGINS = ["FILL", "ENRICH", "SOURCE_DRAFT"] as const;
export type SuggestionOrigin = (typeof SUGGESTION_ORIGINS)[number];

/** AI providers that accept per-run overrides on ai/fill and ai/enrich. */
export const AI_PROVIDERS = ["OPENAI", "ANTHROPIC", "GEMINI", "DEEPSEEK"] as const;
export type AiProviderKind = (typeof AI_PROVIDERS)[number];

/** Optional provider/model overrides for the AI run endpoints. */
export interface AiRunBody {
  provider?: AiProviderKind;
  model?: string;
}

/** Body for POST /tickets/:id/ai/source-draft — drafts the target final fields
 * ONLY from the picked sources; allowWebSearch lets References use online search. */
export interface SourceDraftBody {
  sourceIds: string[];
  targetFields: string[];
  allowWebSearch?: boolean;
}

export const CHANNEL_TYPES = ["WHATSAPP", "TELEGRAM", "EMAIL"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const DELIVERY_STATUSES = ["SENT", "FAILED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const TICKET_ACTIVITY_ACTIONS = [
  "CREATED",
  "TAKEN",
  "STATUS_CHANGED",
  "FIELDS_UPDATED",
  "IOC_ADDED",
  "IOC_UPDATED",
  "IOC_REMOVED",
  "SOURCE_ADDED",
  "SOURCE_REMOVED",
  "AI_FILL",
  "AI_ENRICH",
  "SUGGESTION_ACCEPTED",
  "SUGGESTION_REJECTED",
  "SENT",
  "OTX_PUSHED",
] as const;
export type TicketActivityAction = (typeof TICKET_ACTIVITY_ACTIONS)[number];

export interface Ticket {
  id: string;
  title: string;
  origin: TicketOrigin;
  findingType: FindingType;
  status: TicketStatus;
  cveIds: string[];
  affectedProduct: string | null;
  affectedVersions: string | null;
  mitigation: string | null;
  threatName: string | null;
  /** Final (client-facing) output fields. */
  overview: string | null;
  description: string | null;
  recommendations: string | null;
  references: string[];
  tlp: Tlp;
  feedItemId: string | null;
  otxPulseId: string | null;
  otxPulseUrl: string | null;
  createdAt: string;
  updatedAt: string;
  takenByName: string | null;
}

export interface TicketSource {
  id: string;
  ticketId: string;
  url: string | null;
  note: string | null;
  title: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface Ioc {
  id: string;
  ticketId: string;
  type: IocType;
  value: string;
  context: string | null;
  origin: string | null;
  includeInBulletin: boolean;
  createdById: string | null;
  createdAt: string;
}

/** Detail envelope — pendingSuggestions > 0 is the FE hard-block banner signal (S2). */
export interface TicketDetail extends Ticket {
  sources: TicketSource[];
  iocs: Ioc[];
  pendingSuggestions: number;
}

export interface AiSuggestion {
  id: string;
  ticketId: string;
  /** Final-field path targeted: overview | description | recommendations | … */
  field: string;
  currentValue: string | null;
  suggestedValue: string;
  status: SuggestionStatus;
  /** AI flow that produced the row: FILL | ENRICH | SOURCE_DRAFT. */
  origin: SuggestionOrigin;
  /** Provider that produced the suggestion; null = server default ("Auto"). */
  provider: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryAudit {
  id: string;
  ticketId: string;
  channelId: string;
  channelType: ChannelType;
  clientId: string;
  clientName: string;
  target: string;
  /** Exact message body sent — compliance requirement. */
  payload: string;
  status: DeliveryStatus;
  errorDetail: string | null;
  sentById: string;
  sentAt: string;
}

export interface TicketActivity {
  id: string;
  ticketId: string;
  actorId: string | null;
  actorName: string | null;
  action: TicketActivityAction;
  detail: string | null;
  createdAt: string;
}

export interface SendResponse {
  ticket: Ticket;
  audit: DeliveryAudit[];
}

export interface OtxPushResponse {
  pulseId: string;
  pulseUrl: string;
  isPublic: boolean;
  tlpMarking: "WHITE" | "GREEN" | "AMBER" | "RED";
}

export interface TicketsQuery {
  q?: string;
  status?: TicketStatus;
  origin?: TicketOrigin;
  findingType?: FindingType;
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}

/** Quick-capture manual create (dialog shape); origin is MANUAL server-side. */
export interface CreateTicketBody {
  title: string;
  findingType: FindingType;
  summary?: string;
}

export interface PatchTicketFieldsBody {
  title?: string;
  overview?: string;
  description?: string;
  recommendations?: string;
  references?: string[];
  tlp?: Tlp;
}

export interface CreateIocBody {
  type: IocType;
  value: string;
  context?: string;
  origin?: string;
  includeInBulletin: boolean;
}

export interface UpdateIocBody {
  value?: string;
  context?: string;
  origin?: string;
  includeInBulletin?: boolean;
}

export interface CreateTicketSourceBody {
  url?: string;
  note?: string;
  title?: string;
  notes?: string;
}

export interface UpdateTicketSourceBody {
  url?: string | null;
  note?: string | null;
  title?: string | null;
  notes?: string | null;
}
