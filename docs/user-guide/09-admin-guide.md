# Administrator guide

Version 1.0.0

## In this guide

Everything here needs the ADMIN role. ADMIN-only menus (Integrations, Email template, Prompts, Users) simply do not appear for EDITOR or ANALYST accounts.

## Users

Open **Users** in the left menu to manage who can sign in.

### Roles, in one box

The page shows a Role access summary at the top. The short version:

1. **ADMIN** sees and does everything, including this page.
2. **EDITOR** runs the content: feeds, clients and channels, and sending or closing tickets.
3. **ANALYST** works tickets (research, sources, IOCs, AI fill) but cannot send, cannot manage integrations, and can only create other ANALYST users.

### Creating a user

1. Click **Add user**.
2. Fill in Name, Email, Role and a password of at least 8 characters.
3. Click **Create user**.
4. If you are signed in as an ANALYST, the system only lets you create ANALYST accounts. Any other choice is refused.

### Editing a user and resetting a password

1. Click **Edit** on the user's row.
2. Change the name, email or role as needed. You cannot change your own role.
3. To reset a password, type a new one into the password field. Leave it blank to keep the current password.
4. Click **Save changes**.

Hand the new password to the user through a channel other than the app, and have them change it from their **Account** page after signing in.

There is no deactivate or delete button in this version. To shut someone out, edit the user and set a new password they do not have. Removing accounts entirely is a deployment-level task.

Use the **Search name or email** box and the **Filter by role** dropdown to find people in a longer list.

**Outcome:** every team member has a working account with the right level of access.

## Integrations

Open **Integrations** in the left menu. This page holds every external credential. Keys are stored encrypted, and the page only shows masked values, so saving always means typing the full key.

### AI providers

Under **AI providers**, configure one or more of OPENAI, ANTHROPIC, GEMINI or DEEPSEEK. Each card takes an **API key** and an optional default **Model**. Every provider with a saved key becomes selectable in the AI provider dropdown on tickets.

### OTX

Under **Threat intel**, the OTX card takes the AlienVault OTX API key used to push ticket IOCs as pulses. See [07-otx.md](07-otx.md) for the push flow.

### WhatsApp gateway (WAHA)

Under **Messaging**, the WhatsApp card takes the **Base URL**, **Session** and **API key** of your WAHA gateway. WHATSAPP channels deliver through it. Test it straight from the card with **Test connection**.

### Email relay (SMTP)

Under **Email relay**, the SMTP card takes **Host**, **Port**, **User**, **Password** and the **From** address. EMAIL channels send through this relay. Test it from the card.

Each card has its own **Save** and **Test connection** buttons. Test after every change so you know the credential works before send day.

**Outcome:** every external service wired up, encrypted at rest, and verified.

## Prompts

Open **Prompts** in the left menu. Here you write the instructions the AI receives. See [05-ai-assist.md](05-ai-assist.md) for what the AI does with them.

1. There are three templates: the **Fill prompt**, the **Enrich prompt** and the **Source Draft prompt**. Each card explains when it runs.
2. Edit the text and click the card's save button. Only ADMIN can save.
3. Inject ticket data with the placeholders listed under **Placeholder legend**, for example the title, the IOC list or the sources selected for a draft.
4. Click **View Fill history** (or the matching button) under a card to see past versions and **Restore** an older one if a change made things worse.

**Outcome:** the AI follows your house rules, and every instruction change can be rolled back.

## Email template

Open **Email template** in the left menu. Like Integrations, Prompts and Users, this menu appears only for ADMIN accounts.

1. Set the **Subject** line.
2. Edit the **HTML body**. Placeholders: {{title}}, {{overview}}, {{description}}, {{recommendations}}, {{references}}, {{iocs}}, {{tlp}}, {{findingType}}.
3. Check the rendered result in **Preview (sample ticket data)** below, then save.

Full walkthrough in [06-sending-bulletins.md](06-sending-bulletins.md).

**Outcome:** client emails look right without anyone touching them per send.

## Bulletin template

Open **Bulletin** in the left menu. This is the text template every bulletin is rendered from. ADMIN saves; everyone else can preview.

1. Edit the template text. Placeholders: {{title}}, {{overview}}, {{description}}, {{ioc_block}}, {{recommendations}}, {{references}}.
2. Scroll to **Preview**, paste a ticket ID and click **Preview** to see the exact output, IOCs defanged.
3. Save when it looks right.

**Outcome:** the house bulletin format, controlled from one page.

## Related pages

1. [04-tickets.md](04-tickets.md): the day-to-day content workflow you are enabling.
2. [05-ai-assist.md](05-ai-assist.md): how the AI features use your provider keys and prompts.
3. [06-sending-bulletins.md](06-sending-bulletins.md): clients, channels and the send flow.
4. [07-otx.md](07-otx.md): the OTX push flow behind the integration.
5. [10-faq-troubleshooting.md](10-faq-troubleshooting.md): quick answers to common user questions.
