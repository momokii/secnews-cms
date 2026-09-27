# Getting started

Version 1.0.0

## In this guide

This guide covers everything you do once, or rarely: creating the very first admin account, logging in, what each sidebar menu is for, where to change your own name and password, what each role may and may not do, and how to log out. At the end there is a "Where is X?" table that maps common tasks to the right menu.

## First run: create the first admin account

This step only applies to a brand-new system that has no user accounts yet. It is done once, by the person who sets up the system for the team.

1. Open the system in your browser and add `/bootstrap` to the web address, for example `http://your-server:8080/bootstrap`.

2. Fill in the three fields: **Admin name** (your name), **Admin email** (your work email), and **Password** (at least 8 characters).

3. Click **Create admin**.

*What you'll see:* you are logged in immediately and land on the Feeds page. You now have the ADMIN role.

*Note:* this page only works while the system has no users. If setup was already done, you will see "Setup complete" with the message "An administrator already exists." That is normal, just go to the login page.

## Logging in

1. Open the web address your team gave you.

2. Enter your **email** and **password**.

3. Click **Sign in**.

*What you'll see:* the Dashboard, and your name with your role (ADMIN, EDITOR, or ANALYST) at the top of the left sidebar.

**Your session lasts 4 hours.** Right under your name in the sidebar, a small countdown shows how many minutes you have left, for example "Session 233m left". It refreshes itself, turns red in the last two minutes, and shows "Session expired" when time is up. After that, the next click simply asks you to log in again. Nothing you did is lost, your work is already saved.

## What each sidebar menu is for

The menus run down the left side of the screen. Some menus are hidden depending on your role, so you may not see all of them.

| Menu | What it is for |
|---|---|
| Dashboard | Numbers at a glance: how many news items came in, how many tickets are open, and what was sent. |
| Feeds | Add and manage the news sources the system checks automatically. ADMIN and EDITOR only. |
| Reports | The history of exported files, with filters by type, format, status, and date. |
| Feed items | Review incoming news headlines and sort them into the work queue. |
| Tickets | The work items where news stories are researched, written up, and sent to clients. |
| Clients | The list of clients that bulletins are sent to. |
| Bulletin | The bulletin template used for client messages. |
| OTX pulses | Browse and search threat alerts from OTX, a public threat-sharing service. |
| Integrations | Connect email sending (SMTP) and WhatsApp, and manage API keys. ADMIN only. |
| Email template | The layout and standard text of outgoing emails. ADMIN only. |
| Prompts | The instructions that tell the AI assistant how to draft content. ADMIN only. |
| Users | Create accounts and give people their roles. ADMIN only. |

**Tip:** the small chevron at the very top of the sidebar collapses it to a narrow strip of icons. Click it again to bring the names back. Your choice is remembered.

## Your Account page

Use this page to change your own details. You do not need any special role.

1. Click **Account** in your user box at the top of the left sidebar.

*What you'll see:* your profile (name, email, role, and your user ID) and a "Change password" form below it.

2. To change your name or email, click **Edit profile**, update the fields, and click **Save profile**.

3. To change your password, type your **current password** and a **new password** of at least 8 characters, then click **Change password**.

*What you'll see:* a green "Profile updated." or "Password updated." confirmation.

*Note:* you cannot change your own role. An ADMIN does that on the Users page.

## Roles explained

Your role controls what you can see and change. You cannot give yourself a bigger role; only an ADMIN can change roles.

| What you want to do | ADMIN | EDITOR | ANALYST |
|---|---|---|---|
| See the Dashboard, Reports, Feed items, Tickets, Clients, Bulletin, and OTX pulses menus | Yes | Yes | Yes |
| Triage feed items (mark viewed, take) | Yes | Yes | Yes |
| Work on tickets (research, prepare content) | Yes | Yes | Yes |
| Add, edit, or delete feed sources | Yes | Yes | No |
| Send a bulletin or close a ticket | Yes | Yes | No |
| Add, edit, or delete clients | Yes | Yes | No (view only) |
| Manage users, integrations, email template, or prompts | Yes | No | No |

In short: ANALYST works on the research, EDITOR runs the newsroom and does the sending, ADMIN owns the settings and the accounts.

## Logging out

1. Click **Logout** in your user box at the top of the left sidebar.

*What you'll see:* the login page.

**Outcome:** you know how to get into the system, what each menu does, where your own settings live, and what your role allows. If you were looking for a specific task, the table below points you to the right menu.

## Where is X?

| I want to... | Go to |
|---|---|
| See what happened today | Dashboard |
| Read new security news | Feed items |
| Start working on a news story | Feed items, then click **Take** |
| Continue work on a story | Tickets, then open the ticket |
| Draft bulletin text with AI help | Open the ticket, use the AI assist panel |
| Send a bulletin to clients | Open the ticket and move it through to send (ADMIN or EDITOR) |
| Add a new news source | Feeds (ADMIN or EDITOR) |
| Stop a news source temporarily | Feeds, untick its **Active** box |
| Add or remove a client | Clients (ADMIN or EDITOR) |
| Change my name, email, or password | Account |
| Give a colleague an account or a role | Users (ADMIN) |
| Set up email or WhatsApp sending | Integrations (ADMIN) |
| Adjust how the AI writes | Prompts (ADMIN) |
| Change the look of outgoing emails | Email template (ADMIN) |
| Download a spreadsheet of feed items | Feed items, click **Export** |
| Find a file I exported before | Reports |
| Check threat alerts from OTX | OTX pulses |
