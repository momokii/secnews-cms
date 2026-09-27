# SecNews CMS Documentation

Version 1.0.0

## In this guide

This page is the front door for all SecNews CMS documentation. It explains what documentation exists, who each document is for, and where to start.

## What is SecNews CMS?

SecNews CMS is a tool for the security team. It collects security news automatically from news feeds on the internet, helps the team pick the stories that matter, and turns those stories into short bulletins for clients. The team researches each story in one place, can get help from an AI assistant to draft the content, and then sends the finished bulletin to clients by email or chat. Everything happens in this one tool: collecting, reviewing, writing, and sending.

## Which document do you need?

| You are... | Start here | Then read |
|---|---|---|
| A team member using the app daily (ADMIN, EDITOR, or ANALYST) | [User guide README](user-guide/README.md) | The guide pages 01-10, plus the [Glossary](GLOSSARY.md) whenever a term is unfamiliar |
| Setting up the app for the first time | [README at the repo root](../README.md) | [User guide: Getting started](user-guide/01-getting-started.md) for the first login and admin account |
| A new engineer joining the project, or a reviewer | [Architecture](ARCHITECTURE.md) | [API contract](API_CONTRACT.md) and [state machines](STATES.md) |
| Looking up a term (IOC, TLP, Pulse, triage, ...) | [Glossary](GLOSSARY.md) | — |
| Checking what changed between releases | [Changelog](../CHANGELOG.md) | — |

## Documentation map

### For end users — the user guide

Plain-language, step-by-step guides. No technical background needed.

| Guide | Covers |
|---|---|
| [User guide index](user-guide/README.md) | Overview, roles, five-minute quick start, links to all guides |
| [Getting started](user-guide/01-getting-started.md) | First-run admin setup, logging in, sidebar menus, account page, roles, where-is-X table |
| [Using the Dashboard](user-guide/02-dashboard.md) | KPI cards, daily activity chart, date range filter |
| [Feeding news](user-guide/03-feeding-news.md) | RSS sources, how ingestion works, feed item triage, details, exports |
| [Working tickets](user-guide/04-tickets.md) | Ticket lifecycle (OPEN → RESEARCH → READY → SENT → CLOSED), sources notebook, IOCs, TLP, exports |
| [AI assist](user-guide/05-ai-assist.md) | AI fill, AI enrich, Source Draft Assist, reviewing suggestions, prompt templates |
| [Sending bulletins](user-guide/06-sending-bulletins.md) | Clients and channels, bulletin and email templates, sending, delivery audit |
| [OTX pulses](user-guide/07-otx.md) | Connecting AlienVault OTX, pushing pulses, browsing community pulses |
| [Reports](user-guide/08-reports.md) | The export audit log: who exported what, when, and with what result |
| [Admin guide](user-guide/09-admin-guide.md) | Users, integrations, prompt templates, email and bulletin templates |
| [FAQ & troubleshooting](user-guide/10-faq-troubleshooting.md) | Fast answers to the most common questions and problems |

### For understanding the system

| Document | Covers |
|---|---|
| [Architecture](ARCHITECTURE.md) | The ideas behind the app, end-to-end workflow diagrams, module map, design decisions, deployment topology |
| [Glossary](GLOSSARY.md) | Every term used in the app and the docs, in plain language |

### For developers

| Document | Covers |
|---|---|
| [API contract](API_CONTRACT.md) | Every endpoint: method, path, role, request, response, errors |
| [State machines](STATES.md) | Ticket workflow transitions, feed item triage, IOC types, TLP mapping |

### Release history

| Document | Covers |
|---|---|
| [Changelog](../CHANGELOG.md) | Notable changes per version, starting with v1.0.0 |

## Where to go from here

- New to the app? Open the [user guide](user-guide/README.md) and follow the five-minute quick start.
- Deploying? The repo root [README](../README.md) has the one-command production setup (`scripts/setup-prod.sh`).
- Stuck on something? Check the [FAQ](user-guide/10-faq-troubleshooting.md) first; most common questions are answered there.
