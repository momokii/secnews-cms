# Tickets

Version 1.0.0

## In this guide

This is the heart of the app. A ticket is one security story: you open it, research it, and turn it into a client bulletin. Everything else in SecNews feeds into it. Feed items can become tickets, AI drafts their text, and sending delivers them to your clients.

Open **Tickets** in the left menu to start.

## What a ticket contains

Each ticket holds:

1. A title and a finding type (what kind of story it is).
2. A status (where it sits in its life, see below).
3. A TLP level (how widely the story may be shared, see below).
4. Working material: Sources you consulted and Indicators (IOCs) you found.
5. Final fields: the Overview, Description, Recommendations and References that clients will actually read.

## Ticket statuses

Every ticket moves through five statuses, always forward:

```
OPEN  -->  RESEARCH  -->  READY  -->  SENT  -->  CLOSED
  \             \             /
   \             +-----------+
    +--------> CLOSED (cancel path, ADMIN or EDITOR only)
```

There is no reopen. CLOSED is final. Here is what you do at each step.

### OPEN: just created

The ticket exists but nobody has committed to it yet.

1. Open the ticket and read the title and summary.
2. Decide if it is worth working on.
3. If yes, click **Start research**. You become the person working it.
4. If no, an ADMIN or EDITOR can click **Close ticket** to cancel it.

**Outcome:** the ticket is either taken into research or cancelled.

### RESEARCH: collect the facts

This is the working phase. You gather evidence and mark what matters.

1. Add every useful reference under **Sources**. Click **Add source** and fill in a title, a link, and Notes saying what you learned from it. You can search, edit and delete sources later.
2. Add the indicators you found under **Indicators (IOCs)**. Pick a type (DOMAIN, IPV4, URL, MD5 and others), paste the value, and add an optional Context note such as "C2 server". Click **Add IOC**.
3. For each IOC, use the **In bulletin** checkbox to decide whether clients should see it. Only IOCs with the box ticked reach the client bulletin and the OTX push.
4. When the picture is complete, click **Mark ready**.

**Outcome:** the ticket holds verified facts and is ready to be written up.

### READY: written and waiting to send

Now the client-facing story is complete.

1. Fill the **Final fields** on the ticket: Overview, Description, Recommendations, and References (one link per line). Click **Save fields**.
2. Check the TLP level still fits the story.
3. Preview the bulletin if you want to see exactly what clients get (see [06-sending-bulletins.md](06-sending-bulletins.md)).
4. Click **Send to channels**.

The bulletin needs at least Overview and Description filled before it can be produced. Sending is blocked while any AI suggestion is still waiting for review; an amber banner at the top of the ticket tells you what needs attention. See [05-ai-assist.md](05-ai-assist.md).

**Outcome:** the bulletin goes out to the channels you picked and the ticket becomes SENT.

### SENT: delivered

The bulletin has been delivered. The ticket is not frozen though.

1. You can send the bulletin again at any time. **Send to channels** stays available on a SENT ticket, so you can repush or reach additional channels.
2. You can still push its IOCs to OTX. See [07-otx.md](07-otx.md).
3. When the story is fully handled, ADMIN or EDITOR clicks **Close ticket**.

**Outcome:** the ticket is archived as CLOSED once everyone is done with it.

### CLOSED: done or cancelled

CLOSED means the same thing whether the story was sent or dropped: nothing more happens on this ticket. It stays readable, including its full history.

**Outcome:** the story is finished either way, and the full record stays on file.

## Where tickets come from

1. **Manually.** On the Tickets page, click **Create ticket**, fill in a Title, pick a Finding type, optionally add a summary, and click **Create ticket**. The ticket opens with status OPEN.
2. **From a feed.** When someone takes an item on the Feed items page, SecNews creates a ticket from it automatically. These tickets carry origin AUTO_FEED; hand-made ones carry origin MANUAL.

**Outcome:** every story starts life as a ticket, whether a person typed it or a feed item spawned it.

## Finding types

Pick the type that matches the story when you create a ticket:

1. **VULNERABILITY_CVE**. A vulnerability tracked by CVE IDs. These tickets carry the CVE identifiers, the affected product, the affected versions and the mitigation; CVE IDs and related details appear on the ticket when set.
2. **THREAT_CAMPAIGN**. A named threat or campaign. These tickets carry the threat name, shown on the ticket.
3. **OTHER**. Anything that fits neither mould.

**Outcome:** every ticket is sorted into a type at birth, so lists and filters stay meaningful.

## TLP: how far may this story travel?

TLP (Traffic Light Protocol) is a security-industry standard colour code for sharing. Every ticket has one, and new tickets start at AMBER.

1. **CLEAR**. Shareable with anyone, including publicly.
2. **GREEN**. Shareable within the wider security community.
3. **AMBER**. Limited to your organisation and its clients. This is the default.
4. **RED**. Named recipients only, keep it tight.

TLP also controls what happens on OTX: a ticket marked AMBER or RED is never pushed public there. See [07-otx.md](07-otx.md).

**Outcome:** the sensitivity of every story is visible at a glance and enforced on every channel it travels through.

## Finding tickets: search and filters

On the Tickets page:

1. Type in the **Search title** box to find tickets by title.
2. Use the **Status** dropdown to see, for example, only READY tickets waiting to be sent.
3. Use the **Origin** dropdown to separate tickets born from feeds from hand-made ones.
4. Use the **Finding type** dropdown to filter by VULNERABILITY_CVE, THREAT_CAMPAIGN or OTHER.
5. Use the date filter to narrow by creation date.
6. Combine any of these. Results update as you go, newest page first.

**Outcome:** you can pull up any slice of the workload in a few clicks.

## The activity timeline

Scroll to the **Activity** section on any ticket. Every change is logged there with what happened, who did it and when. Status moves, added sources, added IOCs, AI runs and OTX pushes all appear. Use the **Action** filter to focus on one kind of event.

**Outcome:** a full, immutable who-did-what history for every ticket.

## Exporting tickets

1. On the Tickets page, click **Export**.
2. Choose a From and To date, or leave both empty to export everything.
3. Pick a format: CSV, JSON or XLSX.
4. Click **Export**. The file downloads to your computer.

Every export is recorded on the Reports page. See [08-reports.md](08-reports.md).

**Outcome:** ticket data in a spreadsheet-friendly file, with the attempt logged.

## Related pages

1. [05-ai-assist.md](05-ai-assist.md): let AI draft your fields, then review.
2. [06-sending-bulletins.md](06-sending-bulletins.md): clients, channels, templates and sending.
3. [07-otx.md](07-otx.md): push ticket IOCs to the threat-intel community.
4. [08-reports.md](08-reports.md): the log of every export.
5. [10-faq-troubleshooting.md](10-faq-troubleshooting.md): quick fixes for common problems.
