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
| `VALIDATION` | **422** | Payload well-formed but semantically rejected: illegal ticket transition, send/preview on non-READY/missing final fields |
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
| 16 | `GET /feed-items` | ANY | `ListFeedItemsQuerySchema` `?status&feedSourceId&q&page&pageSize` | 200 `ListFeedItemsResponseSchema` | |
| 17 | `GET /feed-items/:id` | ANY | — | 200 `FeedItemDetailSchema` (incl. verbatim `raw`) | |
| 18 | `POST /feed-items/:id/view` | WORK | — | 200 `FeedItemSchema` (status→`VIEWED`) | 409 `CONFLICT` already `TAKEN` |
| 19 | `POST /feed-items/:id/take` | WORK | — | 201 ticket `TicketSchema` (item→`TAKEN`, ticket origin `AUTO_FEED`, item back-links) | 409 `CONFLICT` double-take (TAKE-02) |
| 20 | `POST /ingest` | KEY | header `x-api-key`; `IngestBodySchema` | 201 `IngestResponseSchema` `{item}` | 401 wrong key |

Ingest is an idempotent upsert per (sourceName, link) — re-poll / re-push
never duplicates rows (ING-01). RSS cron polling (FEED_POLL_CRON) shares the
same normalized+raw persistence; it has no HTTP surface.

## 4. Surface 3 — Tickets (workflow core)

Schemas: `src/modules/tickets/schema.ts`. State machine + role gates:
`docs/STATES.md` §1 (verbatim binding).

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 21 | `GET /tickets` | ANY | `ListTicketsQuerySchema` `?q&status&origin&findingType&page&pageSize` | 200 `ListTicketsResponseSchema` (rows include `createdAt`, `updatedAt`, and `takenByName`; `takenByName` is null for manual tickets) | |
| 22 | `POST /tickets` | WORK | `CreateTicketBodySchema` (discriminated on findingType) | 201 `TicketSchema` (origin `MANUAL`, status `OPEN`) | |
| 23 | `GET /tickets/:id` | ANY | — | 200 `TicketDetailSchema` (+`sources[]`, `iocs[]`, `pendingSuggestions`, `takenByName`) | |
| 24 | `PATCH /tickets/:id` | WORK | `UpdateTicketBodySchema` | 200 `TicketSchema` | |
| 25 | `POST /tickets/:id/transition` | gate | `TransitionBodySchema` `{to}` | 200 `TicketSchema` | 403 role gate fails; 422 `VALIDATION` illegal transition (TRN-02); 409 `PENDING_SUGGESTIONS` when `to=SENT` with PENDING suggestions |
| 26 | `PATCH /tickets/:id/fields` | WORK | `PatchTicketFieldsBodySchema` | 200 `TicketSchema` | |
| 27 | `POST /tickets/:id/sources` | WORK | `CreateTicketSourceBodySchema` | 201 `TicketSourceSchema` | |
| 28 | `DELETE /tickets/:id/sources/:sourceId` | WORK | — | 204 | |
| 29 | `POST /tickets/:id/iocs` | WORK | `CreateIocBodySchema` | 201 `IocSchema` | |
| 30 | `PATCH /tickets/:id/iocs/:iocId` | WORK | `UpdateIocBodySchema` | 200 `IocSchema` | |
| 31 | `DELETE /tickets/:id/iocs/:iocId` | WORK | — | 204 | |
| 31a | `GET /tickets/:id/activity` | ANY | `?page&pageSize` | 200 `paginated(TicketActivitySchema)` (newest first, actor name joined) | |

Transition role gate (`to` → roles): `RESEARCH`,`READY` → WORK;
`SENT`,`CLOSED` → MGR. `to=CLOSED` is legal from `OPEN|RESEARCH|READY`
(cancel) and `SENT`; `CLOSED` accepts nothing.

## 5. Surface 4 — AI assist + suggestions (HARD BLOCK source)

Schemas: `src/modules/ai/schema.ts`. Provider/model come from central
integration config — never from the request.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 32 | `POST /tickets/:id/ai/fill` | WORK | `{}` | 200 `AiFillResponseSchema` (strict: only missing final fields) | |
| 33 | `POST /tickets/:id/ai/enrich` | WORK | `{}` | 200 `AiFillResponseSchema` (full rewrite proposals) | |
| 34 | `GET /tickets/:id/suggestions` | WORK | `ListSuggestionsQuerySchema` `?status&page&pageSize` | 200 `ListSuggestionsResponseSchema` | |
| 35 | `POST /tickets/:id/suggestions/:suggestionId/accept` | WORK | — | 200 `SuggestionActionResponseSchema` (value merged into final fields) | |
| 36 | `POST /tickets/:id/suggestions/:suggestionId/reject` | WORK | — | 200 `SuggestionActionResponseSchema` | |

S2 contract: Send (#46) and OTX push (#51) MUST fail with `409
PENDING_SUGGESTIONS` while any suggestion for the ticket is `PENDING`
(BLK-01). `TicketDetailSchema.pendingSuggestions > 0` is the FE banner signal.

## 6. Surface 5 — Integrations (AI providers + OTX key)

Schemas: `src/modules/integrations/schema.ts`. Keys are AES-256-GCM
encrypted at rest; never serialized in a response (INT-01) — masked only.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 37 | `GET /integrations/:kind` | ADMIN | `:kind ∈ OPENAI\|ANTHROPIC\|GEMINI\|OTX` | 200 `IntegrationConfigResponseSchema` `{kind, model, hasKey, maskedKey, updatedAt}` | |
| 38 | `PUT /integrations/:kind` | ADMIN | `PutIntegrationConfigBodySchema`; OTX uses `PutOtxConfigBodySchema` (no model) | 200 `IntegrationConfigResponseSchema` | |
| 39 | `POST /integrations/:kind/test` | ADMIN | `{}` | 200 `TestConnectionResponseSchema` `{ok, detail?, latencyMs?}` | upstream failure reported in `ok:false`, not HTTP error |

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
| 45 | `PATCH /channels/:id` | MGR | `UpdateChannelBodySchema` | 200 `ChannelSchema` | |
| 46 | `DELETE /channels/:id` | MGR | — | 204 | |

Wire secrecy: TELEGRAM channel responses carry `tokenMasked` + `hasToken`,
never the raw token (CHN-02). WHATSAPP uses the WAHA gateway (env-configured);
EMAIL uses central SMTP.

## 8. Surface 7 — Delivery (send + audit trail)

Schemas: `src/modules/delivery/schema.ts`.

| # | Method + Path | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| 47 | `POST /tickets/:id/send` | MGR | `SendBodySchema` `{channelIds[]\|all}` | 200 `SendResponseSchema` `{ticket, audit[]}` | 422 `VALIDATION` ticket not `READY` (SND-02); 409 `PENDING_SUGGESTIONS` (S2, SND-03); 409 `INACTIVE_TARGET` explicit inactive channel id |
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
| 51 | `POST /tickets/:id/bulletin/preview` | WORK | `{}` | 200 `PreviewResponseSchema` `{rendered}` | 422 `VALIDATION` missing required final fields (PREV-02) |
| 52 | `POST /tickets/:id/otx` | MGR | `{}` | 200 `PushOtxResponseSchema` `{pulseId, pulseUrl, isPublic, tlpMarking}` | 422 `VALIDATION` not `READY`; 409 `PENDING_SUGGESTIONS` (S2, OTX-02) |
| 53 | `GET /otx/pulses` | MGR + ANALYST (read-only) | `?page` | 200 `ListPulsesResponseSchema` | upstream failure → 502-style error envelope |

Push includes only IOCs with `includeInBulletin = true`; stores
`otxPulseId`/`otxPulseUrl` on the ticket. `TLP CLEAR→WHITE`; `AMBER`/`RED`
force `public=false`.

---

## 10. Scenario error-path index

| Scenario | Route | Expected |
|---|---|---|
| S2 hard block | #25 (to=SENT), #47, #52 | `409 PENDING_SUGGESTIONS` |
| S3 inactive gating | #47 | `all` excludes inactive (200); explicit inactive id → `409 INACTIVE_TARGET` |
| S4 RBAC | #6 second call → `409 CONFLICT`; #8/#9/#10/#11 non-ADMIN → `403 FORBIDDEN` | analyst-create-admin covered by the 403 |
| Illegal transition | #25 | `422 VALIDATION` |
| Double-take | #19 | `409 CONFLICT` |
| Duplicate feed url | #13 | `409 CONFLICT` |
