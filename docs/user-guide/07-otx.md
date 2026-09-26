# OTX pulses

Version 1.0.0

## In this guide

OTX is AlienVault's Open Threat Exchange, a large community platform where security teams share threat intelligence. The shared unit is a pulse: a bundle of indicators of compromise (IOCs) with a name, tags and a TLP marking. SecNews connects to OTX in both directions. You push your confirmed IOCs out as pulses, and you can read pulses the community publishes.

## Step 1: connect the OTX API key

This is an ADMIN task. Open **Integrations** in the left menu.

1. Find the **Threat intel** group and the OTX card.
2. Paste your OTX API key into **API key**. Get one from your OTX account on the OTX website.
3. Click **Save**.
4. Click **Test connection** to confirm the key works.

Keys are stored encrypted. The page only ever shows a masked form, so anyone looking over your shoulder sees only a fragment.

**Outcome:** SecNews can talk to OTX on your behalf.

## Step 2: push a ticket as a pulse

Pushing starts from a ticket in status READY or SENT.

1. Open the ticket and click **Push to OTX**, next to the send button.
2. SecNews pushes the ticket's included IOCs as a pulse. Only IOCs with **In bulletin** ticked are pushed; excluded ones stay private.
3. A confirmation appears with the pulse ID, its TLP marking and whether it is public. The link opens the pulse on the OTX website.

Pushing again does not create a duplicate. A re-push updates the same pulse, and the ticket's activity timeline records the update.

Sending rules apply here too: the push is blocked while the ticket has pending AI suggestions.

**Outcome:** your confirmed indicators are shared with the community under the right TLP, and stay one pulse per ticket.

## How TLP is handled

The ticket's TLP level travels with the pulse:

1. CLEAR becomes the legacy OTX marking WHITE.
2. GREEN stays GREEN.
3. AMBER stays AMBER and forces the pulse to private.
4. RED stays RED and forces the pulse to private.

In short: an AMBER or RED ticket can never end up public on OTX, no matter what. The confirmation message after a push tells you which it was ("public" or "not public").

## Browsing pulses

Open **OTX pulses** in the left menu. The page has three tabs:

1. **Subscribed**. Pulses from sources your OTX account follows.
2. **My pulses**. Pulses your organisation has pushed.
3. **Search**. Searching OTX directly.

Typing in the search box at the top switches the page into OTX search automatically. Clear the box to return to your selected tab.

Each row in the table shows:

1. The pulse **Name** and its **Author**.
2. The **TLP** marking and the **Visibility** (Public or Private).
3. The **Indicators** count, how many IOCs the pulse carries.
4. **Tags** and the date last **Modified**.

Click **Details** on a row to open the pulse in a popup: its description, references, and the full indicator list. Use **View on OTX** in the popup to open the pulse on the OTX website itself.

**Outcome:** community threat intel is one menu away, and your own pushes are easy to find.

## Related pages

1. [04-tickets.md](04-tickets.md): tickets, IOCs and the In bulletin toggle.
2. [05-ai-assist.md](05-ai-assist.md): clearing suggestions, which also unblocks the push.
3. [06-sending-bulletins.md](06-sending-bulletins.md): the send flow the push button sits next to.
4. [09-admin-guide.md](09-admin-guide.md): configuring the OTX key (ADMIN).
