# SecNews CMS User Guide

Version 1.0.0

## In this guide

This page is the front door of the user guide. It explains what SecNews CMS is, who uses it, points you to the right detailed guide, and gives you a five-minute quick start so you can try the main workflow right away.

## What is SecNews CMS?

SecNews CMS is a tool for the security team. It collects security news automatically from news feeds on the internet, helps the team pick the stories that matter, and turns those stories into short bulletins for clients. The team researches each story in one place, can get help from an AI assistant to draft the content, and then sends the finished bulletin to clients by email or chat. Everything happens in this one tool: collecting, reviewing, writing, and sending.

## Who uses it

Three roles use the system. Your role decides which menus you see and what you can change.

| Role | What they do |
|---|---|
| ADMIN | Sets up and looks after the system. Manages user accounts, integrations (email and WhatsApp connections), the email template, AI prompts, and feed sources. Can do everything an EDITOR can. |
| EDITOR | Runs the day-to-day newsroom. Manages feed sources and clients, works on tickets, and sends finished bulletins to clients. |
| ANALYST | Researches stories. Reviews incoming news, works tickets through research and preparation. Cannot send bulletins or change system settings. |

If you are not sure which role you have, look at the small label under your name at the top of the left sidebar. It shows ADMIN, EDITOR, or ANALYST.

## Guide map

| Guide | Read it when you want to |
|---|---|
| [Getting started](01-getting-started.md) | Create the first admin account, log in, understand the sidebar menus, change your own details, or find out which menu to use for a task. |
| [Using the Dashboard](02-dashboard.md) | Understand the number cards, the daily activity chart, and the date filter. |
| [Feeding news](03-feeding-news.md) | Add or manage news sources, review incoming news items, sort them into a work queue, and export the feed list. |
| [Working tickets](04-tickets.md) | Understand the ticket lifecycle, research a story with sources and IOCs, set the TLP level, and export the ticket list. |
| [AI assist](05-ai-assist.md) | Use AI fill, AI enrich, and Source Draft Assist, review their suggestions, and manage the instructions behind them. |
| [Sending bulletins](06-sending-bulletins.md) | Add clients and their channels, shape the bulletin and email templates, send, and read the delivery audit. |
| [OTX pulses](07-otx.md) | Connect OTX, push ticket indicators as a pulse, and browse community pulses. |
| [Reports](08-reports.md) | See the log of every export and run a new one. |
| [Administrator guide](09-admin-guide.md) | Manage users, integrations, prompts, and templates as ADMIN. |
| [FAQ and troubleshooting](10-faq-troubleshooting.md) | Fix the most common problems quickly. |

## 5-minute quick start

This walks you through the main flow once, from login to a sent bulletin. It assumes your account already exists and that a colleague has already added at least one news source.

1. **Log in.** Open the web address your team gave you, enter your email and password, and click the login button.

   *What you'll see:* the Dashboard with three number cards across the top.

2. **Check the Dashboard.** Glance at the Feed items, Tickets, and Deliveries cards to see how much work came in and what was sent recently.

   *What you'll see:* big numbers with small colored labels underneath, for example "UNREVIEWED: 12".

3. **Open Feed items** in the left sidebar.

   *What you'll see:* a list of news headlines under the UNREVIEWED tab.

4. **Triage the list.** Click a title to read the original story. If a story is worth turning into a client bulletin, click **Take** next to it. If not, click **Mark viewed** and move on.

   *What you'll see:* the item disappears from the UNREVIEWED tab. A taken item gets a link that says "Ticket #..." in its row.

5. **Open the ticket.** Click the "Ticket #..." link in the row of the item you took.

   *What you'll see:* the ticket page with the story details and an "AI assist" panel on the side.

6. **Use AI assist.** In the AI assist panel, click **AI fill (strict)** or **AI enrich** to have the assistant draft the bulletin content from the source story.

   *What you'll see:* suggestions appear in a list, each one ready to review.

7. **Review the suggestions.** Read each suggestion, keep the good ones, and correct anything that is wrong or exaggerated. The AI drafts, you decide.

8. **Send.** When the ticket is ready, move it through the workflow buttons until you can send it to the clients. Sending needs an ADMIN or EDITOR account.

   *What you'll see:* the ticket status moves forward step by step, and after sending, the delivery shows up in the Dashboard's Deliveries card.

**Outcome:** you have turned one raw news story into a reviewed bulletin and sent it to clients, using the same path the team follows every day. The other guides explain each step in more detail.
