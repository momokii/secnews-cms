# STATES — Confirmed State Machines & Canonical Enums

> Single source of truth for every downstream task (C1–C4, D1–D2, F1–F5).
> Values mirror Prisma enum names exactly (B1, no `@map`). Wire-level zod
> mirrors live in `src/modules/*/schema.ts`.

---

## 1. Ticket status machine (FINAL, confirmed)

Statuses: `OPEN → RESEARCH → READY → SENT → CLOSED`

Legal transitions:

- `OPEN → RESEARCH`
- `RESEARCH → READY`
- `READY → SENT`
- `SENT → CLOSED`
- Cancel path: `OPEN | RESEARCH | READY → CLOSED`

Rules:

- No backward transitions. No reopen in MVP.
- `CLOSED` is terminal.

Guards:

- `→ SENT` requires: status `READY` **AND** zero `PENDING` AiSuggestions
  (HARD BLOCK → HTTP 409 `PENDING_SUGGESTIONS`, scenario S2) **AND**
  ≥ 1 target channel resolved active (scenario S3) **AND** one `DeliveryAudit`
  row written per send attempt.

Role gates:

| Transition | Allowed roles |
|---|---|
| `OPEN → RESEARCH`, `RESEARCH → READY` (work) | ADMIN / EDITOR / ANALYST |
| `READY → SENT` (send) | ADMIN / EDITOR |
| `→ CLOSED` (close, from any non-terminal state) | ADMIN / EDITOR |

---

## 2. Feed-item triage states (FINAL, confirmed)

`UNREVIEWED → VIEWED → TAKEN`

- `TAKEN` is terminal; the spawned ticket owns the content from there.
- Taking a `TAKEN` item again → HTTP 409 `CONFLICT` (double-take regression).
- `Taken` spawns a Ticket with origin `AUTO_FEED` and back-links
  `FeedItem.ticketId`.

---

## 3. IOC type list (FINAL, confirmed) — 12 types

`DOMAIN, IPV4, IPV6, URL, EMAIL, MD5, SHA1, SHA256, FILEPATH, MUTEX, CIDR, OTHER`

Every IOC record carries `include_in_bulletin` (boolean, default `true`).
Only IOCs with `include_in_bulletin = true` reach the client-facing bulletin
and the OTX push.

Defang map (applied when rendering bulletins; OTX push uses raw values):

| Type | Defanging | Example |
|---|---|---|
| `DOMAIN` | dots → `[.]` | `evil[.]com` |
| `IPV4` | dots → `[.]` | `1.2.3[.]4` |
| `IPV6` | colons → `[:]` (dot-style bracketing on separators) | `1.2.3[.]4` analog |
| `URL` | scheme → `hxxps://` / `hxxp://` | `hxxps://evil[.]com/payload` |
| `EMAIL` | `@` → `(at)`, dots → `[.]` | `user(at)evil[.]com` |
| `MD5`, `SHA1`, `SHA256`, `FILEPATH`, `MUTEX`, `CIDR`, `OTHER` | emitted verbatim | as-is |

---

## 4. TLP → OTX mapping (FINAL, confirmed)

Internal `TlpLevel` values: `CLEAR, GREEN, AMBER, RED` (ticket default `AMBER`).

| Internal TLP | OTX marking (legacy tag) | OTX `public` |
|---|---|---|
| `CLEAR` | `WHITE` | per OTX pulse semantics |
| `GREEN` | `GREEN` | per OTX pulse semantics |
| `AMBER` | `AMBER` | **`false` (forced)** |
| `RED` | `RED` | **`false` (forced)** |

---

## 5. RBAC roles (FINAL, confirmed)

| Role | Scope |
|---|---|
| `ADMIN` | users, integrations, everything |
| `EDITOR` | feeds, clients/channels, tickets incl. send/close |
| `ANALYST` | view + work tickets (take, research, IOC/suggestions, AI fill); cannot send, cannot create users, cannot manage integrations |

Bootstrap: creates the first `ADMIN` only when user count = 0; any later
call → HTTP 409 `CONFLICT`.
