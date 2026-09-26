# Feeding news

Version 1.0.0

## In this guide

This guide covers the news pipeline: adding and managing the news sources the system watches (the Feeds page), how news arrives automatically, and how the team reviews incoming items on the Feed items page and sorts them into work. It ends with exporting the feed list to a file.

Who can do what here: the **Feeds** page (managing sources) is for ADMIN and EDITOR. The **Feed items** page (reviewing news) is open to every role, including ANALYST.

## Part 1: manage news sources (Feeds page, ADMIN and EDITOR)

A news source is an RSS feed, a standard web address that news sites publish so other tools can read their headlines. You add the address once and the system checks it for you.

### Add a source

1. Open **Feeds** in the left sidebar.

2. Click **Add feed** in the top-right corner.

3. Fill in the form:

   * **Name**, a short label you will recognize, for example "BleepingComputer".
   * **URL**, the web address of the RSS feed, for example `https://www.bleepingcomputer.com/feed/`. It must start with `http://` or `https://`.
   * **Active (poll this source)**, ticked by default. Leave it ticked so the system checks this source.

4. Click **Save**.

*What you'll see:* the dialog closes and the new source appears in the table with its name, URL, and an "Active" checkbox.

*Outcome:* the system starts checking this source on its next round. New stories from it appear under **Feed items**, usually within 15 minutes.

### Edit or pause a source

1. Open **Feeds**.

2. To change a name or URL, click **Edit** in the source's row, update the fields, and click **Save**.

3. To pause a source without deleting it, untick the checkbox in its **Active** column. The row then shows "Paused". Tick it again to resume. Paused sources are not checked, and their already collected items stay in the system.

*What you'll see:* the table updates immediately.

### Delete a source

1. Open **Feeds** and click **Delete** in the source's row.

2. A confirmation appears: 'Delete "source name"? Polled items already ingested are kept.' Click **Delete** to confirm, or close the dialog to cancel.

*What you'll see:* the source disappears from the table. News items already collected from it are kept, so nothing in the review queue is lost.

If your team has many sources, the list is split into pages of 20. Use the **Previous** and **Next** buttons at the bottom of the table.

## How news arrives (ingestion)

You do not need to do anything for news to come in. This is what happens in the background:

* Every active source is checked automatically **every 15 minutes**.
* From each feed the system takes the **title**, the **link** to the original article, and the **published date**. The complete original data of each item is also stored, so extras such as summary, author, or categories show up later when the source provides them.
* **Duplicates are dropped.** The same link, or the same title from the same source, is stored only once. If an item's details change at the source, the stored copy is refreshed, but its review status never changes.
* Every new item starts as **Unreviewed** and waits for the team on the Feed items page.

## Part 2: review news (Feed items page, all roles)

### The triage workflow

Every item moves through three statuses: **Unreviewed**, then **Viewed**, then **Taken**. Taking an item means "this story is worth working on" and creates a ticket automatically.

1. Open **Feed items** in the left sidebar.

*What you'll see:* a table of headlines under three tabs: **UNREVIEWED**, **VIEWED**, and **TAKEN**. The UNREVIEWED tab is selected by default, so the newest unchecked news is right in front of you.

2. To read the original story, click the headline. It opens in a new browser tab.

3. If the story is not worth a bulletin, click **Mark viewed** in its row. It moves to the VIEWED tab.

4. If the story is worth working on, click **Take** in its row.

*What you'll see:* the item leaves the current tab, and a link appears in its row reading **Ticket #...**. The item is now listed under the TAKEN tab, and a matching ticket exists under **Tickets**.

5. Click the **Ticket #...** link to continue working on the story. How tickets work is covered by the team's ticket process; this guide stops at the hand-off.

**Tip:** clicking **Details** on an Unreviewed item also marks it as Viewed automatically, because opening the details counts as reviewing it.

### Searching and filtering

With many items coming in, use the controls at the top of the Feed items page:

1. **Status tabs.** Click UNREVIEWED, VIEWED, or TAKEN to show only that status.

2. **Search box.** Type a word from the headline or the web address. The list filters as you type, matching items whose title or URL contains your text.

3. **Date filter.** Click a preset (Today, Yesterday, Last 7 days, Last 30 days, Last 12 months) or **Custom** to pick a From and To date. Click **Clear** to remove the filter.

*What you'll see:* the table reloads to match. Each row shows the headline, the source name, when it was published, when it was added to the system, its status, and the action buttons.

### Opening the details

1. Click **Details** in an item's row.

*What you'll see:* a pop-up titled "Item details" with everything the system stored: title, source, link, published date and added date (times shown in WIB, Western Indonesia Time), the current status, and the summary if the source provided one.

2. To see the complete original data exactly as the source delivered it, click **Raw JSON** at the bottom of the pop-up. This is technical data, useful when something looks odd and someone needs to check the original record. Close the pop-up with the X when done.

### Exporting the feed list

You can download the list of feed items as a spreadsheet-friendly file.

1. On the **Feed items** page, click **Export** in the top-right corner.

2. In the "Export feed" dialog, optionally pick a **From** and **To** date. Leave both empty to export everything.

3. Choose a format:

   * **CSV**, opens in any spreadsheet tool, good for everyday use.
   * **JSON**, a technical data format, for teams that process the data with scripts.
   * **XLSX**, an Excel workbook, good when formatting matters.

4. Click **Export**.

*What you'll see:* the button shows "Exporting..." briefly, then the file downloads to your computer. A record of the export appears on the **Reports** page.

**Outcome:** news flows in on its own every 15 minutes, the team turns raw headlines into tickets with two clicks, and you can find, inspect, and export anything that came in. From here, continue in the ticket to research the story and prepare the client bulletin.
