# SecNews CMS — Web Design Tokens (Scaffold Baseline)

> Tailwind CSS 4 utility-first setup. No `tailwind.config.js` — theming lives in
> CSS (`@import "tailwindcss";`). This sheet pins the token choices every F-wave
> page must reuse. No hardcoded hex values or arbitrary spacing in components.

## Color

| Token role      | Tailwind utility            | Usage                          |
|-----------------|-----------------------------|--------------------------------|
| Surface / page  | `bg-slate-100`              | App shell background           |
| Surface / card  | `bg-white` + `border-slate-200` | Stub cards, modal body     |
| Rail / inverse  | `bg-slate-900`              | Sidebar                        |
| Text primary    | `text-slate-900`            | Headings, body emphasis        |
| Text secondary  | `text-slate-500`            | Descriptions, captions         |
| Text on dark    | `text-slate-300` / `text-white` | Sidebar idle / active text |
| Primary action  | `bg-indigo-600` (+`hover:bg-indigo-500`) | Active nav, buttons |
| Backdrop        | `backdrop:bg-slate-900/60`  | `<dialog>` ::backdrop          |
| Semantic        | `emerald-*` success, `red-*` danger, `amber-*` warning | Future forms/status |

## Typography

- Font stack: template system-ui stack (Tailwind default). No custom fonts yet.
- Page/section title: `text-lg font-semibold text-slate-900` (single `h1` per page).
- Body: `text-sm text-slate-700`.
- Rail brand: `text-sm font-semibold uppercase tracking-wide text-white`.

## Spacing & shape

- Scale: Tailwind default 4px grid only (`p-4`, `p-6`, `gap-1`, `gap-2`, `mt-2`).
- Radius: `rounded-md` (nav items, buttons), `rounded-lg` (cards, modal).
- Shadow: `shadow-sm` (cards), `shadow-xl` (modal).
- Sidebar width: `w-60`.

## Components (scaffold set)

- `AppShell` — dark rail + `bg-slate-100` main; routes render via `Outlet`.
- `PageStub` — white card (`rounded-lg border border-slate-200 bg-white p-6 shadow-sm`)
  with `h1` title + `text-sm text-slate-500` description.
- `Modal` — native `<dialog>` (`showModal`/`close`), `rounded-lg p-0 shadow-xl`,
  `backdrop:bg-slate-900/60`, header row with `border-b border-slate-200 px-6 py-4`.

## Rules

1. Every visual property resolves to a token from this sheet or a Tailwind default
   utility — no inline hex, no arbitrary `w-[137px]`-style values without cause.
2. New components extend this sheet first, then consume the new token.
3. Icons: inline SVG only (no emoji glyphs, no icon-font deps in scaffold).
