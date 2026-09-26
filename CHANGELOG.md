# Changelog

All notable changes to SecNews CMS are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [1.0.0] - 2026-09-16

First production release for the operations team.

### Added

- **Auth & roles** — first-run admin bootstrap, JWT sessions (4h) with sidebar
  countdown, ADMIN/EDITOR/ANALYST roles, rate-limited login, self-service
  password change, admin user management.
- **News ingestion** — RSS feed sources with 15-minute polling, feed-item
  triage (Unreviewed → Viewed → Taken), authenticated external ingest API,
  search/filter/date-range on all lists, item detail with raw payload.
- **Ticket workflow** — OPEN → RESEARCH → READY → SENT → CLOSED state machine
  with role gates; research notebook sources (title/link/notes); typed IOCs
  (12 types) with include-in-bulletin; final output fields; activity timeline.
- **AI assist** — AI Fill (strict, empty fields only), AI Enrich, and
  Source Draft Assist (pick sources + target fields + optional web search);
  provider/model selection (OpenAI, Anthropic, Gemini, DeepSeek); suggestion
  review (Accept/Edit/Reject/Delete) with origin isolation; unresolved
  suggestions block send/OTX push; editable prompt templates (Fill / Enrich /
  Source Draft) with revision history.
- **Delivery** — per-client WhatsApp (WAHA), Telegram, and Email (BCC)
  channels with active toggles and per-channel delivery audit (exact payload,
  actor, status); resend from SENT; plaintext bulletin template and HTML email
  template studio with live preview.
- **Threat intel** — AlienVault OTX integration: API key management with test
  connection, idempotent pulse push (typed indicators, TLP mapping,
  AMBER/RED forced private), and a pulses browser (Subscribed / My pulses /
  Search) with detail popups.
- **Reports** — one-click exports of feed items and tickets as CSV / NDJSON /
  XLSX with date ranges, streaming for large datasets, and a unified export
  audit log (who / when / what / status / row count).
- **Dashboard** — KPI cards (feed triage, ticket workflow, deliveries) and a
  daily activity chart, filterable by date range.
- **Operations** — one-click production deployment (`scripts/setup-prod.sh`)
  and teardown (`scripts/down-prod.sh --volumes`), Docker Compose stack
  (PostgreSQL + API + web), automatic DB migrations on start.

### Security

- Credentials (AI/OTX/WAHA/SMTP/Telegram) encrypted at rest (AES-256-GCM),
  returned masked only, with connection tests.
- All non-public endpoints authenticated and role-gated; login rate-limited.
