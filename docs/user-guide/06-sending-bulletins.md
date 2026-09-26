# Sending bulletins

Version 1.0.0

## In this guide

A bulletin is the finished security story, rendered from a ticket and delivered to your clients over the channels they signed up for. This page covers the setup (clients, channels, templates) and the act of sending.

## Step 1: add your clients

Open **Clients** in the left menu. A client is one customer organisation.

1. Click **Add client**.
2. Enter the organisation's Name and click **Save**.
3. The client appears in the list with an **Active** checkbox. Leave it ticked. Unticking excludes the whole organisation from sending.

**Outcome:** every client organisation is registered and switchable in one place.

## Step 2: attach delivery channels

Each client receives bulletins through one or more channels. On the Clients page, click **Channels** on the client's row.

You can add three channel types:

1. **WHATSAPP**. Enter the Chat ID of the client's WhatsApp chat. Delivery runs through your WhatsApp gateway, which your ADMIN configures on the Integrations page.
2. **TELEGRAM**. Enter the Chat ID and the Bot token of the bot that serves the client. The token is stored masked. Click **Test connection** on a Telegram channel to check it end to end; a result of **OK** (with a response time) or **Failed** (with the reason) appears straight away.
3. **EMAIL**. Enter the BCC addresses, separated by commas. Bulletins go out by email to every address on the list.

Every channel has an **Active** checkbox. Only active channels are included when you send to all. Untick a channel to pause it without deleting it. The **Delete** button removes it for good.

**Outcome:** each client has working, tested, individually switchable delivery targets.

## Step 3: shape the bulletin template

Open **Bulletin** in the left menu. This page holds the organisation-wide text template used for every bulletin, plus a live preview.

1. The template is plain text with placeholders. The default looks like a bulletin with sections for Overview, Description, Indicators of Compromise, Recommendations and References.
2. Placeholders are replaced per ticket when the bulletin is produced:
   - {{title}}, the ticket title
   - {{overview}}, the executive overview
   - {{description}}, the detailed description
   - {{ioc_block}}, the defanged IOC list (dangerous strings like evil[.]com are neutralised automatically)
   - {{recommendations}}, the recommended actions
   - {{references}}, the source references
3. Only ADMIN can save changes to this template; other roles see a note saying so.
4. To check your work, scroll to **Preview**, paste a ticket ID, and click **Preview**. You get the exact text a client would receive, IOCs defanged. Use **Copy bulletin** to grab it.

An empty section drops out of the rendered bulletin rather than appearing as a blank heading. The ticket must have Overview and Description filled for the preview to work.

**Outcome:** one consistent house format, verifiable before anything is sent.

## Step 4: shape the email template

Open **Email template** in the left menu. Email channels wrap the bulletin in this template.

1. Enter the **Subject** line.
2. Edit the **HTML body**. It supports the same placeholders as the bulletin ({{title}}, {{overview}}, {{description}}, {{recommendations}}, {{references}}, {{iocs}}) plus {{tlp}} and {{findingType}}.
3. The **Preview** panel below renders your HTML with sample ticket data, so you can see the email as clients will.
4. Only ADMIN can save this template.

Email delivery itself runs through the SMTP relay your ADMIN sets up on the Integrations page.

**Outcome:** branded, correct-looking emails with no surprises on send day.

## Step 5: send

Sending starts from a ticket in status READY (or SENT, to send again).

1. Open the ticket and click **Send to channels**.
2. In the **Send bulletin** dialog, pick the delivery targets:
   - **All active channels** sends to every active channel across all clients. Inactive channels are excluded automatically.
   - **Select channels** lets you cherry-pick. Each row shows the client, the channel type and its target. Inactive rows are greyed out and marked as excluded.
3. Click **Send now**.

The ticket flips to SENT. Sending fails with a clear message if the ticket still has pending AI suggestions or if no active channel exists.

**Resending:** the **Send to channels** button stays available on a SENT ticket. Send again whenever you need to, to the same or different channels.

**Outcome:** the bulletin lands on every channel you chose, with each attempt on record.

## The delivery audit

Every send attempt writes a row. Scroll to the **Delivery audit** section on the ticket.

1. Each entry shows the channel type, the client name, a SENT or FAILED badge, and the time.
2. **Target** shows the exact chat ID or BCC list that was addressed.
3. A failed entry shows the exact error in red, so you can see what went wrong without leaving the page.
4. Expand **Payload** to see the exact content that was handed to the channel for that attempt.

Filter the list by channel type with the **Channel** dropdown.

**Outcome:** proof of delivery, and the exact error text, for every attempt.

## Also on a ticket: push to OTX

Next to the send button sits **Push to OTX**, which publishes the ticket's included IOCs to the threat-intel community as a pulse. That flow has its own page: see [07-otx.md](07-otx.md).

## Related pages

1. [04-tickets.md](04-tickets.md): getting a ticket to READY in the first place.
2. [05-ai-assist.md](05-ai-assist.md): clearing the suggestions that block sending.
3. [07-otx.md](07-otx.md): pushing IOCs to AlienVault OTX.
4. [09-admin-guide.md](09-admin-guide.md): WhatsApp gateway, SMTP relay and template editing (ADMIN).
5. [10-faq-troubleshooting.md](10-faq-troubleshooting.md): fixing disabled send buttons and failed deliveries.
