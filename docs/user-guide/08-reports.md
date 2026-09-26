# Reports

Version 1.0.0

## In this guide

Reports is the logbook of every export anyone has ever run. If a colleague asks "who pulled the ticket list last week?", the answer is here. Open **Reports** in the left menu.

## What each export row tells you

Every row is one export attempt:

1. **Actor**, the person who ran the export.
2. **Created**, when it ran.
3. **Type**, what was exported. FEED for feed items, TICKET for tickets.
4. **Format**, the file type requested: CSV, JSON or XLSX.
5. **Range**, the date range the export covered.
6. **Status**, SUCCESS or FAILED. A failed export is logged just like a successful one.
7. **Rows**, how many records the export produced.

## Filtering the log

The log grows quickly, so filter it:

1. Use the date filter at the top to narrow by when exports ran.
2. **Type** narrows to feed or ticket exports.
3. **Format** narrows to CSV, JSON or XLSX.
4. **Status** narrows to successes or failures only.
5. Page through the results with the controls at the bottom.

**Outcome:** you can reconstruct who exported what, when, and whether it worked.

## How to run an export

Exports start from the data pages, not from Reports.

1. Go to **Feed items** or **Tickets**.
2. Click **Export** at the top of the list.
3. In the dialog, pick a From and To date, or leave both empty to export all time.
4. Choose the format: CSV, JSON or XLSX. CSV is the usual choice for spreadsheets.
5. Click **Export**. The button shows Exporting… briefly, then your browser downloads the file.

The attempt appears on the Reports page immediately, whoever ran it.

**Outcome:** a data file on your computer and an audit row to prove it happened.

## Related pages

1. [04-tickets.md](04-tickets.md): exporting the ticket list.
2. [10-faq-troubleshooting.md](10-faq-troubleshooting.md): when the file did not download.
