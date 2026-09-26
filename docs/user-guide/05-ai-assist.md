# AI assist

Version 1.0.0

## In this guide

The AI assist drafts ticket text for you. It never sends anything by itself: every draft lands as a suggestion that a human reviews. Nothing reaches a client until someone accepts it and sends the bulletin.

Open any ticket and you will find the AI tools on it. There are three of them.

## The three AI features

1. **AI fill** (button: **AI fill (strict)**). Drafts ONLY the empty final fields, using only what is already on the ticket: your sources, notes, IOCs and summary. It never invents facts. If a field already has text, fill leaves it alone.
2. **AI enrich** (button: **AI enrich**). Drafts everything and may add context from its own knowledge, such as background on a CVE. Because it can add material that is not on the ticket, every enrichment must be reviewed before you trust it.
3. **Source Draft Assist**. A separate panel on the ticket. You pick specific sources and pick which outputs to draft, so the AI writes from exactly the material you choose. See the section below.

A "How Fill & Enrich work" link at the top of the AI assist panel repeats this in short form.

**Outcome:** three tools for three situations: strict drafting, contextual drafting, and source-driven drafting.

## Choosing an AI provider and model

Above the fill and enrich buttons sits a **Provider** dropdown.

1. Leave it on **Auto (first configured)** and SecNews uses whichever AI provider your administrator set up first.
2. Pick a named provider (for example OPENAI) to force that one.
3. The **Model** box is optional. Leave it empty to use the provider's configured default model, or type a model name to override it for this run.

The same dropdown appears in Source Draft Assist. Which providers are offered depends on which keys your ADMIN has configured on the Integrations page.

## Reviewing suggestions

Every AI draft arrives as a suggestion, shown under the button that produced it. Each one carries a badge:

1. **PENDING**. Waiting for your decision. Pending suggestions block sending.
2. **ACCEPTED**. Merged into the ticket's final fields.
3. **REJECTED**. Turned down, kept only for the record.

Long drafts are trimmed to a short preview. Click **Show more** to read the whole text, **Show less** to fold it back. Under the draft you can also see the current value of the field, plus which provider and model produced the text and when.

For each pending suggestion you have three moves:

1. **Accept**. The draft is merged into the final field. Open that field afterwards if you want to polish the wording; it is ordinary text now and you can edit it freely.
2. **Reject**. The draft is declined. Nothing changes on the ticket.
3. **Delete**. Removes the suggestion from the list. Deleting an accepted suggestion keeps the merged text on the ticket; deleting a pending or rejected one discards the draft for good.

**Outcome:** every AI word on a ticket got there because a person read it and approved it.

## Pending suggestions block sending

Sending and OTX push are hard-blocked while suggestions are pending. An amber banner appears at the top of the ticket and counts what is waiting, separated per feature (AI Assist and Source Draft Assist), with jump links that scroll you straight to each review list. Clear every pending suggestion, accept or reject, and the block lifts by itself.

**Outcome:** no bulletin can leave the building with half-reviewed AI text inside.

## Source Draft Assist

Scroll to the **Source Draft Assist** panel on the ticket. Use it when specific sources should drive the draft.

1. Tick the sources to use. **Select all** and **Select none** buttons speed this up.
2. Tick the target fields to draft: Overview, Description, Recommendations, References. Unticked fields are not touched.
3. Optionally tick **Allow web search for References**. This lets the draft pull in online references beyond your sources.
4. Pick a provider and model if you do not want Auto.
5. Click **Run** and wait for the drafts to appear as suggestions below.

Source Draft Assist writes only from the sources you picked. It never invents facts. Review its suggestions exactly like the others.

**Outcome:** a tightly grounded draft, field by field, from the evidence you trust.

## Editing the AI instructions

ADMIN users can change what the AI is told to do. Open **Prompts** in the left menu.

1. There are three templates: **Fill prompt**, **Enrich prompt** and **Source Draft prompt**. Each card explains when that prompt runs.
2. Edit the text in the card and click **Save Fill prompt** (or the matching button).
3. Use the placeholders listed under **Placeholder legend** to inject ticket data, such as the title, the IOCs or the selected sources.
4. Click **View history** under a card to see earlier versions. **Restore** brings an old version back as the current draft.

Prompt changes affect future runs only. Suggestions already on tickets stay as they are.

**Outcome:** house style and guardrails for the AI, versioned and reversible.

## Related pages

1. [04-tickets.md](04-tickets.md): the ticket lifecycle these tools live in.
2. [06-sending-bulletins.md](06-sending-bulletins.md): what happens once suggestions are cleared and you send.
3. [09-admin-guide.md](09-admin-guide.md): setting up AI provider keys and editing prompts (ADMIN).
4. [10-faq-troubleshooting.md](10-faq-troubleshooting.md): what to do when the AI returns nothing.
