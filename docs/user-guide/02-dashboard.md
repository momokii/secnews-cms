# Using the Dashboard

Version 1.0.0

## In this guide

The Dashboard is the first page you see after logging in. It answers one question at a glance: how much news came in, how much work is in progress, and what went out to clients. This guide explains the three number cards, the daily activity chart, and the date filter, and what it means when a card says there is no data.

## The three number cards

Across the top of the Dashboard sit three cards. Each card has a big number plus small colored labels that break the number down by status.

1. **Feed items.** The big number is the total news items collected in your chosen date range. The small grey labels underneath show how many are in each triage status: UNREVIEWED (not looked at yet), VIEWED (someone opened it), and TAKEN (turned into a ticket).

2. **Tickets.** The big number is the total work items in the range. The small blue labels show the workflow status of each ticket: OPEN, RESEARCH, READY, SENT, or CLOSED.

3. **Deliveries.** The big number is every send attempt in the range. Two labels split it: a green "Sent: ..." count and a red "Failed: ..." count. If failures keep showing up here, tell your ADMIN so the email or WhatsApp connection can be checked.

*What you'll see:* each card title has a small information icon (a circled i). Hover your mouse over it and a short explanation of the card appears. Use it whenever a status name is unfamiliar.

**Outcome:** you can read the cards in seconds and know where work is piling up, for example many UNREVIEWED items means triage is behind.

## The daily activity chart

Below the cards is the "Daily activity" chart.

*What you'll see:* a chart where each day is a group of three bars, one for Feed items (purple), one for Tickets (blue), and one for Deliveries (green). A purple line draws the feed-item trend across the days so spikes and quiet periods stand out. Hover over any day and a small box lists that day's exact numbers.

The chart always follows the date filter, so if you select "Last 7 days", the chart shows seven day groups.

## Choosing a date range

Directly under the page title is a row of date filter buttons. Everything on this page (cards and chart) follows this filter.

1. Click one of the ready-made buttons: **Today**, **Yesterday**, **Last 7 days**, **Last 30 days**, or **Last 12 months**. The active button turns solid.

2. For a specific period, click **Custom**. Two date fields appear, **From** and **To**. Pick dates in each field using the small calendar, or type them.

3. To remove the filter and see everything again, click **Clear**.

*What you'll see:* the cards and chart reload to match the range you picked. The selected preset button stays highlighted until you choose another one or clear the filter.

*Tip:* dates follow the team's reporting timezone (Western Indonesia Time, WIB). "Today" means today in that timezone.

## When it says "no data"

Sometimes the page looks almost empty. That is normal, and the message tells you why.

* **"No data for selected range."** under the cards means nothing at all was collected, worked on, or sent during the chosen dates. Pick a wider range, such as Last 30 days, to see earlier activity. On a freshly installed system this message simply means the team has not started using it yet.

* **"No timeseries data for selected range."** in the chart area means the cards do have numbers, but the chart has no daily breakdown for that range.

* **"Loading dashboard..."** means the numbers are still being fetched. It disappears on its own within a few seconds.

**Outcome:** you can open the Dashboard, set the range you care about, read the three cards and the chart, and tell the difference between "nothing happened" and "the data is still loading". When you are ready to act on what you see, head to **Feed items** and continue with the Feeding news guide.
