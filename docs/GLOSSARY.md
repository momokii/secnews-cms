# SecNews CMS Glossary (v1.0.0)

A to Z reference for everyone using SecNews CMS. Each entry is one or two sentences, no jargon piled on jargon. For how the pieces fit together, read [ARCHITECTURE.md](./ARCHITECTURE.md). Step-by-step instructions live in the user guide, starting at [user-guide/01-getting-started.md](./user-guide/01-getting-started.md).

## Bulletin

The client-facing write-up produced from a ticket: what happened, which indicators matter, and what to do about it. Bulletins are rendered with IOCs defanged so nothing in them can be clicked by accident.

## Bulletin Template

The reusable layout used when a bulletin is rendered for clients. It controls structure so every bulletin looks consistent.

## Channel

A delivery destination attached to a client: WhatsApp, Telegram, or Email. A ticket is sent to one or more active channels.

## Client

An organization that receives bulletins from your team. Each client owns one or more channels.

## Dashboard

The overview screen with summary counts and trends: tickets by status, feed volume, and delivery outcomes, so a lead can see the state of the work at a glance.

## Defanging

Writing an indicator so it cannot be clicked or accidentally resolved, while staying readable. Dots in domains and IPv4 addresses become `[.]`, so `example.com` becomes `example[.]com`. URL schemes become `hxxps://` or `hxxp://`, and email addresses become `name(at)example[.]com`. Hashes, file paths, mutexes, and CIDR ranges need no defanging and are shown as they are.

## Delivery Audit

The record of every send attempt: which ticket, which channel, when, and whether it succeeded or failed. One row per attempt, successes and failures alike.

## Email Template

The reusable layout used when a bulletin goes out as email. It is managed separately from the bulletin template and controls how the rendered bulletin looks in a client's inbox.

## Export Audit

The record of every data export someone ran: what was exported, in which format, and when.

## Feed Item

A single story pulled from a feed source, or pushed in by an external collector. Each item starts as Unreviewed and moves through triage until it is taken into a ticket.

## Feed Source

An RSS feed the platform watches, for example a security vendor's news feed. Admins and editors add and manage sources; polling runs on a schedule.

## Finding Type

What kind of event the ticket describes. There are three:

- **Vulnerability/CVE**: a software vulnerability, usually tied to a CVE id like `CVE-2026-1234`.
- **Threat/Campaign**: an active threat activity, malware family, or attack campaign.
- **Other**: anything worth reporting that fits neither category.

## Integration

A configured connection to an external service: the LLM provider, AlienVault OTX, the WAHA WhatsApp gateway, or SMTP for email. ADMINs set these up in the Integrations menu; credentials are stored encrypted in the database and can be tested from the UI.

## IOC (Indicator of Compromise)

A concrete piece of evidence tied to a threat, such as a domain the malware contacted or a hash of a malicious file. Tickets carry IOC records, each with a type. The twelve types:

`DOMAIN`, `IPV4`, `IPV6`, `URL`, `EMAIL`, `MD5`, `SHA1`, `SHA256`, `FILEPATH`, `MUTEX`, `CIDR`, `OTHER`

Each IOC has an `include_in_bulletin` flag. Only flagged IOCs appear in the client bulletin and are pushed to OTX.

## OTX

AlienVault Open Threat Exchange, a public platform for sharing threat intelligence. SecNews pushes marked IOCs from a ticket to an OTX Pulse so the wider community can benefit.

## Prompt Template

The stored instruction text that shapes what the AI produces for fill, enrich, or source drafting. Templates are versioned, so past prompts stay on record.

## Pulse

A collection of indicators published on OTX. Pushing a ticket's IOCs creates or updates a pulse; the push is idempotent, so pushing twice does not create a duplicate.

## Report

An export of ticket or feed data in CSV, NDJSON (JSON Lines), or XLSX format. Reports are how you hand structured data to someone outside the platform, and every export is audited.

## Role

What a signed-in user is allowed to do. Three roles:

| Role | Can do |
|---|---|
| ADMIN | User management, integrations, and everything below |
| EDITOR | Feeds, clients and channels, and full ticket work including send and close |
| ANALYST | View and work tickets: take items, research, IOCs, AI suggestions. Cannot send, close, or manage integrations |

## SecNews

This platform: an internal CMS that turns security news feeds into reviewed, client-ready bulletins with a full audit trail.

## Source Draft

A first bulletin draft the AI generates from a ticket's source material. Like all AI output, it arrives as a suggestion for a human to review.

## Suggestions

The AI's proposed content for a ticket. Each suggestion is one of:

- **Pending**: not yet reviewed. A ticket cannot be sent while any suggestion is pending.
- **Accepted**: a person reviewed it and kept it.
- **Rejected**: a person reviewed it and discarded it.

## Ticket

The working unit for one finding: the record where an analyst researches a feed item, attaches IOCs, reviews AI suggestions, and prepares the bulletin. Taking a feed item creates a ticket automatically.

## Ticket Statuses

A ticket moves one way through five statuses:

| Status | Meaning |
|---|---|
| OPEN | Just created, nobody has started work |
| RESEARCH | An analyst is working it: fields, IOCs, sources, suggestions |
| READY | Final fields are complete and the bulletin can be previewed and sent |
| SENT | Delivered to the chosen client channels and pushed to OTX |
| CLOSED | Finished and locked. Cancel from any earlier status also lands here |

## TLP (Traffic Light Protocol)

The sharing label on a ticket that says who may see its content:

| Level | Meaning | Handling in SecNews |
|---|---|---|
| CLEAR | May be shared freely with anyone | Pushed to OTX with the legacy WHITE tag |
| GREEN | May be shared within your community, not publicly | Pushed to OTX with the GREEN tag |
| AMBER | Limited to your organization and its clients on a need-to-know basis | OTX pulse forced private |
| RED | Named recipients only, no wider sharing | OTX pulse forced private |

New tickets default to AMBER.

## Triage

The first pass over incoming feed items. Each item is Unreviewed until someone opens it (Viewed), then either taken into a ticket (Taken) or left. Taken is final; the ticket owns the story from there.

---

See also: [ARCHITECTURE.md](./ARCHITECTURE.md) for how it all works, and the [user guide](./user-guide/01-getting-started.md) for day-to-day use.

v1.0.0, 2026-09.
