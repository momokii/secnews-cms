# API Contract — SecNews Operations Platform MVP

> Machine truth: `src/modules/*/schema.ts` (zod, `zod/v4`) + `src/common/{pagination,errors}.ts`.
> This document is the human-readable contract every downstream task (C1–C4,
> D1–D2, F1–F5, E2) builds against. State machines, IOC list, TLP mapping:
> see `docs/STATES.md`. No route implementations live in B2.

---

## 1. Conventions

- **Base path**: no version prefix. `@fastify/autoload` mounts
  `src/modules/<dir>/routes.ts` at `/<dir>`; `health` is the exception at `/health`.
- **Auth**: `Authorization: Bearer <jwt>` for all role-gated routes. `POST /ingest`
  uses `X-API-Key: <INGEST_API_KEY>` instead (timing-safe compare, no JWT).
- **Content type**: `application/json` everywhere.
- **All datetime fields** are ISO 8601 strings (`z.iso.datetime()`); the external
  `/ingest` boundary also accepts timezone offsets.
- **All `:id` path params** are positive integers (coerced: `src/common/pagination.ts#idParam`).
- **Enum sourcing**: module schemas derive their zod enums from the generated
  Prisma client (`src/generated/prisma/enums.js`, alias-imported as
  `PrismaXyz`) so the wire contract cannot drift from B1's schema. A fresh
  clone must run `npx prisma generate` before `npm run typecheck`; the
  canonical string values are mirrored verbatim in `docs/STATES.md`.

### Pagination

List query: `?page=<int>=1&pageSize=<int=20,max=100>` plus per-route filters.
List response envelope (`paginated(itemSchema)`):

```json
{ "items": [...], "total": 0, "page": 1, "pageSize": 20 }
```

### Errors

Every non-2xx response uses the single envelope
(`src/common/errors.ts#errorEnvelopeSchema`):

```json
{ "error": { "code": "CODE", "message": "…", "details": null } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION` | 400 | Payload failed schema validation |
| `VALIDATION` | **422** | Payload well-formed but semantically rejected: illegal ticket transition, send/preview on non-READY/missing final fields, CVE ids not matching `^CVE-\d{4}-\d{4,}$` on ticket create / fields PATCH / suggestion accept, OTX push with stored invalid IOCs |
| `UNAUTHORIZED` | 401 | Missing/invalid credentials (also: wrong ingest key) |
| `FORBIDDEN` | 403 | Authenticated but role/ownership gate failed |
| `NOT_FOUND` | 404 | Unknown resource id |
| `CONFLICT` | 409 | Uniqueness/duplicate-state conflict (double-take, second bootstrap, duplicate feed URL/email) |
| `PENDING_SUGGESTIONS` | 409 | HARD BLOCK: unresolved AI enrichment suggestions (S2) |
| `INACTIVE_TARGET` | 409 | Explicit send target channel is inactive (S3) |

Globals that are NOT repeated per route below: `400 VALIDATION` for any
malformed body, `401 UNAUTHORIZED` for any missing/invalid credential on a
non-public route, `404 NOT_FOUND` for any unknown `:id`.

### Role legend

| Mark | Meaning |
|---|---|
| PUB | No auth |
| KEY | `X-API-Key` header |
| ANY | Any authenticated user |
| WORK | ADMIN / EDITOR / ANALYST |
| MGR | ADMIN / EDITOR |
| ADMIN | ADMIN only |
| gate | Per-transition role gate (see table) |

---

## 2. Surface 1 — Auth, Bootstrap, Users

Schemas: `src/modules/auth/schema.ts`, `src/modules/bootstrap/schema.ts`, `src/modules/users/schema.ts`.

| # | Method + Path | Role | Request | Success | Errors (beyond globals) |
|---|---|---|---|---|---|
| 1 | `GET /health` | PUB | — | 200 `{status:"ok"}` | — |
| 2 | `POST /auth/login` | PUB | `LoginBodySchema` | 200 `LoginResponseSchema` `{token, user}` | 401 bad credentials; 429 rate-limited (5/min/IP) |
| 3 | `GET /auth/status` | PUB | — | 200 `AuthStatusResponseSchema` `{needsBootstrap}` | — |
| 4 | `GET /auth/me` | ANY | — | 200 `UserPublicSchema` | |
| 5 | `POST /auth/change-password` | ANY | `ChangePasswordBodySchema` | 204 | 401 if currentPassword wrong |
| 6 | `POST /bootstrap` | PUB | `BootstrapBodySchema` | 201 `BootstrapResponseSchema` `{user, token}` | 409 `CONFLICT` if any user exists (S4, BST-01) |
| 7 | `GET /users` | ADMIN | `ListUsersQuerySchema` `?q&role&page&pageSize` | 200 `ListUsersResponseSchema` | |
| 8 | `POST /users` | ADMIN; ANALYST (§4, role forced) | `CreateUserBodySchema` (`role` optional) | 201 `UserPublicSchema` | 403 ANALYST attempting any non-ANALYST role (S4, USR-01/05); 409 `CONFLICT` duplicate email |
| 9 | `PATCH /users/:id` | ADMIN | `UpdateUserBodySchema` | 200 `UserPublicSchema` | 403 self-role change (USR-06); 409 `CONFLICT` email taken |
| 10 | `POST /users/:id/reset-password` | ADMIN | `ResetPasswordBodySchema` | 204 | |
| 11 | `DELETE /users/:id` | ADMIN | — | 204 | |

§4 RBAC contract for `POST /users`: ANALYST may create users, but only with
role `ANALYST` — an omitted role defaults to ANALYST, and an ANALYST token
attempting any explicit non-ANALYST role (the USR-01 escalation to ADMIN, or
EDITOR) gets `403 FORBIDDEN` with no row created. ADMIN keeps unrestricted
role choice (any role, omitted role → ANALYST). `PATCH /users/:id`,
`POST /users/:id/reset-password` and `DELETE /users/:id` remain ADMIN-only.
Self-demotion lockout (USR-06): a caller PATCHing their own id with a `role`
that differs from their current role gets `403 FORBIDDEN`
("cannot change your own role") and the role is left untouched — name, email
and `active` edits on self stay allowed, and another user's role remains
editable (USR-07).

## 3. Surface 2 — Feeds, Feed items, External ingest

Schemas: `src/modules/feeds/schema.ts`, `src/modules/ingest/schema.ts`.
Source management = MGR; triage = ANY/WORK; push = KEY.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 12 | `GET /feeds` | MGR | `?page&pageSize` | 200 `paginated(FeedSourceSchema)` | |
| 13 | `POST /feeds` | MGR | `CreateFeedBodySchema` | 201 `FeedSourceSchema` | 409 `CONFLICT` duplicate url (FEED-02) |
| 14 | `PATCH /feeds/:id` | MGR | `UpdateFeedBodySchema` | 200 `FeedSourceSchema` | |
| 15 | `DELETE /feeds/:id` | MGR | — | 204 | |
| 16 | `GET /feed-items` | ANY | `ListFeedItemsQuerySchema` `?status&feedSourceId&q&from&to&page&pageSize` | 200 `ListFeedItemsResponseSchema` | |
| 17 | `GET /feed-items/:id` | ANY | — | 200 `FeedItemDetailSchema` (incl. verbatim `raw`) | |
| 18 | `POST /feed-items/:id/view` | WORK | — | 200 `FeedItemSchema` (status→`VIEWED`) | 409 `CONFLICT` already `TAKEN` |
| 19 | `POST /feed-items/:id/take` | WORK | — | 201 ticket `TicketSchema` (item→`TAKEN`, ticket origin `AUTO_FEED`, item back-links) | 409 `CONFLICT` double-take (TAKE-02) |
| 20 | `POST /ingest` | KEY | header `x-api-key`; `IngestBodySchema` | 201 `IngestResponseSchema` `{item}` | 401 wrong key |

For both list endpoints, `from` and `to` accept an ISO date (`YYYY-MM-DD`) or
ISO datetime. Bounds are inclusive; a date-only `from` means the start of that
day and a date-only `to` means the end of that day. Feed items filter
`publishedAt`; tickets filter `createdAt`. Invalid bounds and `from > to`
return `400 VALIDATION`.

Ingest is an idempotent upsert per (sourceName, link) — re-poll / re-push
never duplicates rows (ING-01). RSS cron polling (FEED_POLL_CRON) shares the
same normalized+raw persistence; it has no HTTP surface.

## 4. Surface 3 — Tickets (workflow core)

Schemas: `src/modules/tickets/schema.ts`. State machine + role gates:
`docs/STATES.md` §1 (verbatim binding).

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 21 | `GET /tickets` | ANY | `ListTicketsQuerySchema` `?q&status&origin&findingType&from&to&page&pageSize` | 200 `ListTicketsResponseSchema` (rows include `createdAt`, `updatedAt`, and `takenByName`; `takenByName` is the creating/taking user for API-created tickets, else the actor of the most recent `TAKEN`/`CREATED` ticket activity for legacy rows without an owner, else null) | 400 `VALIDATION` for malformed dates or `from` after `to` |
| 22 | `POST /tickets` | WORK | `CreateTicketBodySchema` (discriminated on findingType; only `title` required — `summary` and the type-specific structured fields are optional at create, quick-capture shape) | 201 `TicketSchema` (origin `MANUAL`, status `OPEN`, `takenByName` = creating user; omitted structured fields default to `[]`/`null`) | 422 `VALIDATION` when `cveIds` contains an entry not matching `^CVE-\d{4}-\d{4,}$` (message + `details.invalid` name the offending values) |
| 23 | `GET /tickets/:id` | ANY | — | 200 `TicketDetailSchema` (+`sources[]`, `iocs[]`, `pendingSuggestions`, `takenByName`; `takenByName` falls back to the most recent `TAKEN`/`CREATED` activity actor for legacy ownerless rows) | |
| 24 | `PATCH /tickets/:id` | WORK | `UpdateTicketBodySchema` | 200 `TicketSchema` | |
| 25 | `POST /tickets/:id/transition` | gate | `TransitionBodySchema` `{to}` | 200 `TicketSchema` | 403 role gate fails; 422 `VALIDATION` illegal transition (TRN-02); 409 `PENDING_SUGGESTIONS` when `to=SENT` with PENDING suggestions |
| 26 | `PATCH /tickets/:id/fields` | WORK | `PatchTicketFieldsBodySchema` (any subset incl. `cveIds`) | 200 `TicketSchema` | 422 `VALIDATION` when `cveIds` contains an entry not matching `^CVE-\d{4}-\d{4,}$` (message + `details.invalid` name the offending values; nothing is written) |
| 27 | `POST /tickets/:id/sources` | WORK | `CreateTicketSourceBodySchema` (`url` optional valid URL, `title` optional non-URL label ≤500 chars, `note` legacy short note, `notes` optional long text ≤5000 chars; at least one of the four required) | 201 `TicketSourceSchema` | 400 `VALIDATION` when the only provided field is empty/oversized or `url` is not a valid URL |
| 27a | `PATCH /tickets/:id/sources/:sourceId` | WORK | `UpdateTicketSourceBodySchema` (any subset of `url`/`title`/`note`/`notes`; fields may be set to `null` to clear) | 200 `TicketSourceSchema` (also records a `SOURCE_UPDATED` activity) | 400 `VALIDATION` empty patch / oversized `notes`; 404 `NOT_FOUND` unknown source |
| 28 | `DELETE /tickets/:id/sources/:sourceId` | WORK | — | 204 | |
| 29 | `POST /tickets/:id/iocs` | WORK | `CreateIocBodySchema` | 201 `IocSchema` | 400 `VALIDATION` when `value` does not parse as its declared `type` (IPv4/IPv6 via `net.isIP`, DOMAIN hostname, http(s) URL, EMAIL, MD5/SHA1/SHA256 hex digests, CIDR `addr/prefix`; `FILEPATH`/`MUTEX`/`OTHER` free-form) — the message names type, problem, and value |
| 30 | `PATCH /tickets/:id/iocs/:iocId` | WORK | `UpdateIocBodySchema` | 200 `IocSchema` | 400 `VALIDATION` when the new `value` contradicts the STORED `type` (type is not patchable) — same rules as #29 |
| 31 | `DELETE /tickets/:id/iocs/:iocId` | WORK | — | 204 | |
| 31a | `GET /tickets/:id/activity` | ANY | `?page&pageSize&action` (`action` optional `TicketActivityAction` — narrows the timeline to one action; any other value → 400 `VALIDATION`) | 200 `paginated(TicketActivitySchema)` (newest first, actor name joined). `detail` per action: `STATUS_CHANGED` → `status <FROM>→<TO>`; `FIELDS_UPDATED` → JSON string `{"<field>":{"from":<old\|null>,"to":<new>}}` covering only the fields whose value actually changed (text truncated to 500 chars; string arrays joined with `", "` — empty array → `""`; no-op patch → no detail; legacy rows may still hold the old names-only string); `SUGGESTION_ACCEPTED`/`SUGGESTION_REJECTED` → JSON string `{"field":"<field>","value":"<suggestedValue, truncated to 500 chars>","decision":"ACCEPTED\|REJECTED"}` (legacy rows may hold the old bare-field string); `SUGGESTION_DELETED` → JSON string `{"field":"<field>","value":"<suggestedValue, truncated to 500 chars>","decision":"deleted"}`; `OTX_PUSHED` → `<pulseId>` + optional ` (updated)` | |

Transition role gate (`to` → roles): `RESEARCH`,`READY` → WORK;
`SENT`,`CLOSED` → MGR. `to=CLOSED` is legal from `OPEN|RESEARCH|READY`
(cancel) and `SENT`; `CLOSED` accepts nothing.

## 5. Surface 4 — AI assist + suggestions (HARD BLOCK source)

Schemas: `src/modules/ai/schema.ts`, `src/modules/prompts/schema.ts`.
Provider/model resolution per request: an explicit `{provider?, model?}` body
wins; otherwise the first configured provider (OPENAI → ANTHROPIC → GEMINI →
DEEPSEEK) with its configured (or default) model. An explicit provider without
a configured key is `422 VALIDATION` — never a silent fallback. Every stored
suggestion records the resolved `provider` + `model` that produced it. The
fill/enrich prompt text comes from the ADMIN-managed template per kind (#55/#56,
default = the best-practice built-in security-intelligence prompts); the engine substitutes
`{{ticketContext}}` / `{{missingFields}}` / `{{currentFields}}` with the
ticket's actual data.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 32 | `POST /tickets/:id/ai/fill` | WORK | `{provider?, model?}` (both optional) | 200 `AiFillResponseSchema` (strict: only missing final fields; never drafts the §10-optional `recommendations`/`references`) | 422 `VALIDATION` explicit provider without a configured key, or no provider configured at all; 502 `INTERNAL` envelope when the resolved provider is unreachable from the server (network/DNS timeout) — message names the provider and suggests checking server egress or switching providers; upstream non-2xx → 502 `INTERNAL` with `details.upstreamStatus` + `details.upstreamBody` (≤300 chars of the upstream response body — keys travel in headers and never appear in the detail) |
| 33 | `POST /tickets/:id/ai/enrich` | WORK | `{provider?, model?}` (both optional) | 200 `AiFillResponseSchema` (full rewrite proposals) | 422/502 as #32 |
| 34 | `GET /tickets/:id/suggestions` | WORK | `ListSuggestionsQuerySchema` `?status&page&pageSize` | 200 `ListSuggestionsResponseSchema` (each item carries `provider` + `model`) | |
| 35 | `POST /tickets/:id/suggestions/:suggestionId/accept` | WORK | — | 200 `SuggestionActionResponseSchema`. **Accept AUTO-MERGES** the `suggestedValue` into the ticket's matching final field (`overview`/`description`/`recommendations`/`mitigation`/`affectedVersions` as text; `references`/`cveIds` split on newlines/commas) — clients never copy values manually | 422 `VALIDATION` when accepting a `cveIds` suggestion whose entries don't match `^CVE-\d{4}-\d{4,}$` — the merge is refused, the suggestion STAYS `PENDING`, and the message explains edit-the-fields-or-reject |
| 36 | `POST /tickets/:id/suggestions/:suggestionId/reject` | WORK | — | 200 `SuggestionActionResponseSchema` | |
| 36b | `DELETE /tickets/suggestions/:suggestionId` | WORK | — | 204 (empty body); the row is removed and a `SUGGESTION_DELETED` activity entry is appended with the JSON detail `{"field","value≤500","decision":"deleted"}` — earlier decision rows are never rewritten (history is append-only, so a rejected-then-deleted suggestion keeps its `SUGGESTION_REJECTED` entry and an accepted-then-deleted one keeps its `SUGGESTION_ACCEPTED` entry) | 404 `NOT_FOUND` unknown id |
| 55 | `GET /prompts` | ANY | — | 200 `[{kind: "FILL"\|"ENRICH", content, updatedAt (null = built-in default, never edited), placeholders: [{name, description}]}]` — one item per kind. Serves the stored ADMIN template per kind, or the best-practice built-in default when the row is missing. `placeholders` is the legend of variables the engine injects: `{{ticketContext}}` (title, summary, findingType, tlp, iocs, sources — lines only when non-empty), `{{missingFields}}` (comma-joined strict fill scope), `{{currentFields}}` (`<field>: <value or <empty>>` per suggestible field) | |
| 56 | `PUT /prompts/:kind` | ADMIN | `{content}` (non-empty, kind `FILL\|ENRICH`; 400 otherwise) | 200 `PromptTemplateSchema` (upserted row); every successful PUT atomically appends a revision `{promptKind,content,actorId,createdAt}`. #32/#33 render this stored template by substituting the placeholder legend above with the ticket's actual data; unknown `{{...}}` text passes through untouched. Missing row → best-practice built-in default | 403 non-ADMIN; 400 empty content / unknown kind |
| 56a | `GET /prompts/:kind/history` | ANY | `?page&pageSize` | 200 `{items:[{id,promptKind,content,actorId,actorName,createdAt}],total,page,pageSize}` — append-only revisions, newest first | 400 unknown kind |

Deletion is available for EVERY suggestion status (`PENDING`, `REJECTED`
**and** `ACCEPTED`). It removes ONLY the suggestion row: a value already
merged into the ticket's final fields by accept is never reverted — the
merged field value stays, and the appended `SUGGESTION_DELETED` entry
(field + value + `decision:"deleted"`) is the audit record of the cleanup.

S2 contract: Send (#46) and OTX push (#51) MUST fail with `409
PENDING_SUGGESTIONS` while any suggestion for the ticket is `PENDING`
(BLK-01). `TicketDetailSchema.pendingSuggestions > 0` is the FE banner signal.

## 6. Surface 5 — Integrations (AI providers + OTX + SMTP + WAHA)

Schemas: `src/modules/integrations/schema.ts`. Keys are AES-256-GCM
encrypted at rest; never serialized in a response (INT-01) — masked only.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 37 | `GET /integrations/:kind` | ADMIN | `:kind ∈ OPENAI\|ANTHROPIC\|GEMINI\|DEEPSEEK\|OTX\|SMTP\|WAHA` | 200 `IntegrationConfigResponseSchema` `{kind, model, hasKey, maskedKey, host, port, from, secure, baseUrl, session, updatedAt}` — SMTP carries host/port/from/secure + masked password, WAHA carries baseUrl/session + masked apiKey; all other fields null | |
| 37a | `GET /integrations/available` | WORK | — | 200 `[{kind, model, hasKey}]` for ALL seven kinds (unconfigured → `model: null, hasKey: false`) — dropdown info for the fill/enrich provider picker; carries NO key material of any kind (no `maskedKey`, no blobs) | |
| 38 | `PUT /integrations/:kind` | ADMIN | AI kinds: `PutIntegrationConfigBodySchema`; OTX: `PutOtxConfigBodySchema` (no model); SMTP: `{host, port, user, password, from, secure?}`; WAHA: `{baseUrl, session, apiKey}` — each stored as ONE encrypted blob | 200 `IntegrationConfigResponseSchema` | |
| 39 | `POST /integrations/:kind/test` | ADMIN | `{}` | 200 `TestConnectionResponseSchema` `{ok, detail?, latencyMs?}` — SMTP: nodemailer `verify()` (10s timeout); WAHA: `GET {baseUrl}/api/sessions/{session}` with `X-Api-Key`, falling back to `GET {baseUrl}/api/health` on 404; OTX: subscribed-pulses probe; AI kinds: pong completion | upstream failure reported in `ok:false`, not HTTP error |

SMTP/WAHA precedence: the Integrations-menu entry wins; the `SMTP_*` /
`WAHA_*` env vars remain a fallback until a DB row exists.

## 7. Surface 6 — Clients + Channels

Schemas: `src/modules/clients/schema.ts`, `src/modules/channels/schema.ts`.
Read ANY (send-dialog context); mutations MGR.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 40 | `GET /clients` | ANY | `ListClientsQuerySchema` `?q&page&pageSize` | 200 `ListClientsResponseSchema` | |
| 41 | `POST /clients` | MGR | `CreateClientBodySchema` | 201 `ClientSchema` | |
| 42 | `PATCH /clients/:id` | MGR | `UpdateClientBodySchema` | 200 `ClientSchema` | |
| 43 | `DELETE /clients/:id` | MGR | — | 204 | |
| 44 | `POST /clients/:clientId/channels` | MGR | `CreateChannelBodySchema` (discriminated on type) | 201 `ChannelSchema` | |
| 44b | `GET /clients/:clientId/channels` | ANY | — | 200 `[ChannelSchema]` (plain array, `createdAt` asc) | |
| 45 | `PATCH /channels/:id` | MGR | `UpdateChannelBodySchema` | 200 `ChannelSchema` | |
| 46 | `DELETE /channels/:id` | MGR | — | 204 | |
| 46b | `POST /clients/:clientId/channels/:channelId/test` | MGR | `{}` | 200 `TestConnectionResponseSchema` — probe WITHOUT sending: TELEGRAM calls `getMe` with the stored token; WHATSAPP probes the stored WAHA session; EMAIL verifies the stored SMTP relay | unknown id pair → 404; upstream failure in `ok:false`, not HTTP error |

Wire secrecy: TELEGRAM channel responses carry `tokenMasked` + `hasToken`,
never the raw token (CHN-02). WHATSAPP uses the WAHA gateway (Integrations
menu, `WAHA_*` env fallback); EMAIL uses central SMTP (Integrations menu,
`SMTP_*` env fallback).

## 8. Surface 7 — Delivery (send + audit trail)

Schemas: `src/modules/delivery/schema.ts`.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 47 | `POST /tickets/:id/send` | MGR | `SendBodySchema` `{channelIds[]\|all}` | 200 `SendResponseSchema` `{ticket, audit[]}`; action is allowed from `READY` or `SENT`, leaves status `SENT`, and appends audit/activity rows on every channel attempt | 422 `VALIDATION` ticket not `READY` or `SENT` (SND-02); 409 `PENDING_SUGGESTIONS` (S2, SND-03); 409 `INACTIVE_TARGET` explicit inactive channel id |
| 48 | `GET /tickets/:id/delivery-audit` | ANY | `?page&pageSize` | 200 `ListDeliveryAuditResponseSchema` | |

S3 contract: `all` resolves to **currently-ACTIVE channels only** (inactive
silently excluded, SND-01); explicit `channelIds` containing an inactive
channel → `409 INACTIVE_TARGET`. One `DeliveryAudit` row per target per
attempt with the exact payload (AUD-01).

## 9. Surface 8 — Bulletin template + OTX

Schemas: `src/modules/bulletin/schema.ts`, `src/modules/otx/schema.ts`.
TLP→OTX mapping: `docs/STATES.md` §4.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 49 | `GET /bulletin/template` | ANY | — | 200 `BulletinTemplateSchema` | |
| 50 | `PUT /bulletin/template` | ADMIN | `PutTemplateBodySchema` | 200 `BulletinTemplateSchema` | |
| 51 | `POST /tickets/:id/bulletin/preview` | WORK | `{}` | 200 `PreviewResponseSchema` `{rendered}` | 422 `VALIDATION` missing required final fields — `overview`, `description` only (PREV-02); `recommendations`/`references` are optional (§10) and drop out of the render when empty |
| 52 | `POST /tickets/:id/otx` | MGR | `{}` | 200 `PushOtxResponseSchema` `{pulseId, pulseUrl, isPublic, tlpMarking}`; action is allowed from `READY` or `SENT`, leaves status `SENT`, and appends activity for each attempt | 422 `VALIDATION` not `READY` or `SENT`; 422 `VALIDATION` push pre-check: any included IOC whose value does not parse as its `type` blocks the whole push (`details.iocs[]` names type/value/problem per culprit — nothing is sent upstream); 409 `PENDING_SUGGESTIONS` (S2, OTX-02); upstream non-2xx → 502 `INTERNAL` with `details.upstreamStatus` + `details.upstreamBody` (≤300 chars; never the key) |
| 53 | `GET /otx/pulses` | MGR + ANALYST (read-only) | `?page&pageSize&source=subscribed\|mine\|search&q` (`source` defaults to `subscribed`; `pageSize` clamps into 1..50, default 20; `q` used only by `search`) | 200 `ListPulsesResponseSchema` `{items[{id, name, authorName, isPublic, tlp, tags, indicatorCount, created, modified}], total, page, pageSize}` | 400 `VALIDATION` for an unsupported source; upstream failure → 502-style error envelope with `details.upstreamBody` (≤300 chars) |
| 54 | `GET /otx/pulses/:id` | MGR + ANALYST (read-only) | — | 200 `OtxPulseDetailSchema` `{id, name, authorName, description, isPublic, tlp, tags, references, indicators[{value,type}], created, modified}` | upstream failure or pulse the key cannot access → 502-style error envelope with `details.upstreamBody` (≤300 chars; never leaks the key) |

Push includes only IOCs with `includeInBulletin = true` and sends them as
typed `{indicator, type}` objects — our IocType maps to the exact OTX type
names (`domain`, `IPv4`, `IPv6`, `URL`, `email`, `FileHash-MD5`,
`FileHash-SHA1`, `FileHash-SHA256`, `FilePath`, `Mutex`, `CIDR`;
`OTHER` has no OTX equivalent and is excluded). Before any upstream call the
push pre-checks every included IOC's value against its type (same rules as
route #29); any invalid value blocks the entire push with
`422 VALIDATION` naming the culprits — OTX is never handed a partial or
malformed indicator set (a stored IPv4-literal-as-IPV6 once answered 400
upstream on every push). The pulse body's `TLP`
field carries the LOWERCASE legacy value (official external API schema
enum: `white|green|amber|red`); internal CLEAR maps to legacy WHITE.
`AMBER`/`RED` force `public=false`. The pulse `description` is the ticket
`overview` ONLY — the internal `description` narrative never leaves the
building (TASK-SYNCDEL); an empty/blank overview falls back to the ticket
`title`. It is truncated to OTX's documented 0-1024 cap before the wire
call: 1023 content chars + a trailing `…` (a long description once failed
every push with upstream 400 "description Must be 0-1024 chars"); the
pulse `name` is never truncated. Stores `otxPulseId`/`otxPulseUrl` on the
ticket. Push is idempotent per ticket: a ticket that already has
`otxPulseId` is updated upstream via the documented
`PATCH /api/v1/pulses/{id}` — no second pulse is created; the ticket keeps
pointing at the same pulse and the new `OTX_PUSHED` activity entry is
marked `(updated)`. The PATCH body is DIFF-based (the documented edit
semantics answer 500 to plain list arrays): the current pulse is read
first via `GET /api/v1/pulses/{id}`; the scalar literals `name`,
`description`, `public`, `TLP` are always sent as-is, while the list
fields arrive as `{add:[...]}` / `{remove:[...]}` dicts computed against
the live pulse — `indicators` diffed through ONE canonical comparison
applied to BOTH sides (TASK-OTXDIFF): indicator types are lowercased and
aliased to their OTX sibling family (`hostname`→`domain`, `uri`→`url`,
`path`→`filepath`; case drift like `ipv4`/`IPv4` collapses), and values
are trimmed + lowercased with a single trailing dot stripped from
hostnames — OTX stores a pushed `domain` under the sibling type name
`hostname` (and normalizes to FQDN forms like `whatsapp.com.`), so exact
matching once re-added the same indicator on every re-push (whatsapp.com
accumulated 5 duplicate rows) while stale rows survived. Duplicate ticket
rows collapse to a single add. The result converges the pulse to exactly
the ticket's current IOC set: add the missing typed objects, remove the
`[{id}]` of stale rows where each `id`
is the per-indicator upstream id read from `GET /api/v1/pulses/{id}`,
passed through verbatim — OTX sends those ids as NUMBERS, and coercing
them to strings once turned every remove into a silent no-op that left
deleted IOCs in the pulse), `tags` and
`references` diffed as string lists; an unchanged list is omitted from the
body entirely, and an empty op side is omitted.

The `subscribed` source proxies OTX `GET /api/v1/pulses/subscribed?limit=<pageSize>&page=<page>`.
The `mine` source proxies OTX `GET /api/v1/pulses/my?limit=<pageSize>&page=<page>`;
both use the configured `X-OTX-API-KEY` header. Search is a server-side
source: `source=search` proxies OTX `GET /api/v1/search/pulses?q=&limit=<pageSize>&page=<page>`.
`subscribed`/`my` do NOT accept `q` upstream (OTX documents only
`limit`/`page`/`since` for them), so keyword search goes through the search
source rather than being filtered client-side; a blank `q` omits the param
upstream. The web UI keeps ONE search box above the tabs: typing (debounced)
switches the listing to `source=search` with `q`, clearing restores the
previously selected tab — the server always does the searching.
`indicatorCount` extraction is defensive because OTX list feeds differ:
`subscribed`/`my` rows omit `indicator_count` and instead embed an
`indicators` array, so the proxy prefers an explicit numeric
`indicator_count`, derives the count from the embedded indicators when it is
absent, and only then falls back to 0 (a known-good count is never blanked).
`authorName` maps upstream `author_name` (empty string when absent). Pulse
detail (#54) proxies OTX `GET /api/v1/pulses/{id}`; private pulses load
because the configured key can access them, everything else is a 502
envelope. All datetimes normalize timezone-less upstream values to ISO.

---

## 9b. Surface 8b — HTML email template

Schemas: `src/modules/email-template/schema.ts`. Placeholders: `{{title}}
{{overview}} {{description}} {{recommendations}} {{references}} {{iocs}}
{{tlp}} {{findingType}}` — `{{iocs}}` renders the defanged IOC block
(`- TYPE defanged-value` lines, `includeInBulletin = true` only).
Substituted values are HTML-escaped (newlines become `<br />`); unknown
`{{...}}` text passes through untouched. The subject substitutes raw values
(plain-text header). Single row `name="default"`, same pattern as the
bulletin template; until an ADMIN stores one, GET serves the built-in
default and EMAIL deliveries fall back to the plain bulletin payload.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 57 | `GET /email-template` | ANY | — | 200 `EmailTemplateSchema` `{subject, htmlBody, updatedAt}` (built-in default when no row) | |
| 58 | `PUT /email-template` | ADMIN | `{subject, htmlBody}` — subject 5-200 chars, htmlBody 10-20000 chars, htmlBody must contain ≥1 supported placeholder | 200 `EmailTemplateSchema` (upserted row) | 403 non-ADMIN; 400 `VALIDATION` length/placeholder violations |

Delivery (#47) renders this template for EMAIL channels when the row
exists: the mail carries the rendered `subject` + `html` with the rendered
plain-text bulletin as the `text` alternative. No row → prior behavior
(subject = ticket title, text-only). Audit payload (#48) stays the
plain-text bulletin.

---

## 10. Scenario error-path index

| Scenario | Route | Expected |
|---|---|---|
| S2 hard block | #25 (to=SENT), #47, #52 | `409 PENDING_SUGGESTIONS` |
| Invalid CVE id write | #22, #26, #35 (accept) | `422 VALIDATION` naming the bad value; the accept merge is refused and the suggestion stays `PENDING` |
| Delete a suggestion (any status, incl. ACCEPTED) | #36b | `204` — the row is deleted, the merged ticket field (if any) is NOT reverted, and a `SUGGESTION_DELETED` audit entry is appended; unknown id → `404 NOT_FOUND` |
| IOC value/type mismatch | #29, #30 | `400 VALIDATION` naming type, problem, and value |
| Invalid stored IOCs at push | #52 | `422 VALIDATION` with `details.iocs[]` culprits; no upstream call |
| S3 inactive gating | #47 | `all` excludes inactive (200); explicit inactive id → `409 INACTIVE_TARGET` |
| S4 RBAC | #6 second call → `409 CONFLICT`; #8/#9/#10/#11 non-ADMIN → `403 FORBIDDEN` | analyst-create-admin covered by the 403 |
| Illegal transition | #25 | `422 VALIDATION` |
| Double-take | #19 | `409 CONFLICT` |
| Duplicate feed url | #13 | `409 CONFLICT` |
