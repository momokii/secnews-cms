# FAQ and troubleshooting

Version 1.0.0

## In this guide

Short answers to the questions that come up most. If your problem is not here, ask an ADMIN.

## I forgot my password

An ADMIN resets it for you.

1. Ask any ADMIN to open the **Users** page, click **Edit** on your row, and type a new password.
2. Sign in with the new password.
3. Open your **Account** page and change the password to something only you know.

## The Send button is disabled

Three conditions must hold before a ticket can be sent:

1. The ticket status must be READY or SENT. Drafts in OPEN or RESEARCH cannot be sent yet.
2. No AI suggestions may be pending. An amber banner at the top of the ticket counts what is waiting and links to each review list. Accept or reject everything listed.
3. At least one channel must be active. Check the Clients page.

Fix the first thing the banner complains about and the button comes back.

## My Telegram send failed

1. Open the ticket and scroll to the **Delivery audit** section.
2. Find the failed row. The exact error is shown in red under the target.
3. Go to Clients, open the client's **Channels**, and click **Test connection** on the Telegram channel.
4. Common causes are a wrong Chat ID or an expired bot token. Fix the value, test again, and send the bulletin once more from the ticket.

## AI returned 0 suggestions

Usually nothing is wrong:

1. **AI fill** only drafts fields that are still empty. If every field has text, there is nothing for it to do. Use **AI enrich** if you want fresh drafts anyway.
2. If that is not it, ask your ADMIN to check the Integrations page. The AI provider you selected needs a saved key, and the provider may be down or out of credit.

## I can't see a menu

Menus follow your role.

1. ANALYST sees Reports, Feed items, Tickets, Clients, Bulletin and OTX pulses.
2. EDITOR additionally sees Feeds.
3. Only ADMIN sees Integrations, Email template, Prompts and Users.

If you need one of the missing menus, ask an ADMIN about your role.

## The export shows in Reports but the file didn't download

1. Check the export's **Status** on the Reports page. FAILED means it never produced a file; retry the export.
2. If it shows SUCCESS, the fault is on your side: check your browser's download list and your downloads folder.
3. Still nothing? Run the export again. A fresh attempt writes a fresh audit row, so you can always tell the two runs apart.

## My login expired

Sessions last about 4 hours, then you are signed out automatically.

1. The sidebar shows a countdown ("Session … left") so you can see it coming.
2. When it hits zero, sign in again on the Login page. Nothing you saved is lost; only unsaved typing in a form goes with the session.

## Related pages

1. [04-tickets.md](04-tickets.md): ticket statuses and the research workflow.
2. [05-ai-assist.md](05-ai-assist.md): reviewing AI suggestions.
3. [06-sending-bulletins.md](06-sending-bulletins.md): channels, sending and the delivery audit.
4. [07-otx.md](07-otx.md): OTX pushes and the pulses page.
5. [08-reports.md](08-reports.md): the export log.
6. [09-admin-guide.md](09-admin-guide.md): user, integration and prompt administration.
