# Copilot Guidance for Expense Tracker

This repository is a **static single‑page/HTML web app** backed by Supabase. There is
no build system – you serve the files from any HTTP server and the pages load
directly in the browser. Your job as an AI assistant is to work within that
constraint.

## Architecture Overview
- **Frontend only**: plain HTML, CSS, and vanilla JavaScript. No frameworks.
- **Pages correspond to features**: e.g. `student-dashboard.html` pairs with
  `assets/js/student-dashboard.js`. Look at the filename to know where to
  implement new behavior.
- `common.js` is the shared utility library – call
  `await common.setupCommonLayout()` at the top of every page script to handle
auth, user badge, logout button, keyboard shortcuts and global anchor
navigation.
- `supabaseClient.js` instantiates the Supabase client using values from
  `config.js`. Use `window.supabase` or `window.supabaseClient` interchangeably.
- `appUtils` on `window` contains helpers such as currency formatting and
  date helpers used across pages.
- Charts use Chart.js; always guard chart rendering with a `try/catch` and
  check `typeof Chart === 'undefined'` before creating instances.
- Real‑time subscriptions are established using `supabase.channel(..).on(...).subscribe()`
  in page scripts, usually keyed by `user.id`.

## Data Model & Supabase
- Schema is declared in `supabase-schema.sql`. Key tables:
  - `profiles` (id, email, name, role, parent_id, monthly_limit, ...)
  - `wallets` (user_id, balance)
  - `transactions` (user_id, amount, category, type, date, ...)
- Row Level Security policies allow only `auth.uid() = user_id` access.
- A trigger auto‑creates a wallet when a profile is inserted.
- Profile `role` drives redirection (`student` vs `parent`); always normalize
to lowercase.
- Use `common.loadCurrentUserProfile(user.id)` to fetch/ensure a profile.

## JavaScript Conventions
- Wrap most page logic in an async IIFE (see existing files) or use
  `document.addEventListener('DOMContentLoaded', ...)` for initialization.
- Prefer **event delegation** for grids/lists: attach a single listener to the
  container rather than individual buttons. Examples:
  - `student-dashboard.js` quick‑pay grid (`#quickPayGrid`).
  - `parent-dashboard.js` student list (`#studentsList`).
- Use helper functions `renderTransactions`, `applyFilters`, `renderCharts`,
  etc., naming follows verb‑noun pattern.
- Store fetched rows in module‑level variables (`allTransactions` or
  `latestStudents`) so filters and delegates can access them.
- When updating Supabase, always handle errors and rollback (see
  `doQuickPay` and `processPayment`).
- Navigation links (<a>) must not navigate by default – the app prevents the
  default and manually sets `window.location.href`. A global handler in
  `common.js` does this; avoid re‑binding unless necessary.
- Use `window.common.requireAuth()` to redirect unauthorized users to login.

## CSS & UI Patterns
- Styles in `assets/css/styles.css` use CSS variables for theming.
- `.btn-primary`, `.btn-ghost` and utility classes are reused across pages.
- Animation helpers (`fadeInUp`) and hover effects are already defined – you
  can reuse them rather than inventing new ones.
- Layout is responsive; grids collapse at 900px and 580px. If adding new
  components, follow existing grid classes (`cards-grid`, `form-grid`).

## Developer Workflow
- No build step: edit files, serve with a static server such as `python -m
  http.server 5500` or Live Server extension, open `index.html`.
- Supabase setup:
    1. Run `supabase-schema.sql` in the SQL editor.
    2. Set `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` in
       `assets/js/config.js`.
- To add a feature that touches the database, update the schema file and
  rerun it; changes are lightweight and migrations are manual.
- Debug in the browser console; many scripts log status messages like
  "Payment page initialized successfully".
- There are no automated tests in this repo. When writing new code, add
  manual instructions or consider creating simple validation functions.

## Project‑Specific Quirks
- The login page exists both as `index.html` and `login.html` (alias with
  redirect). Handle redirection logic carefully when updating.
- Quick‑pay modal buttons are dynamically enabled/disabled; use class
  selectors to avoid disabling the close/back controls.
- Profiles may be created without `monthly_limit` (null) – code checks for
  `== null` and displays "unset" accordingly.
- Role strings may come in mixed case from Supabase; always call
  `.toLowerCase().trim()` before comparisons.
- The global `window.common` object is the point of contact for auth and
  navigation; other globals are `window.appUtils` and `window.supabase`.

## Adding New Pages or Features
1. Create new HTML file in root and CSS rules in `styles.css` if needed.
2. Add corresponding JS under `assets/js/` and include it at the bottom of
the HTML after `common.js`.
3. Call `await common.setupCommonLayout()` first thing in the JS.
4. Use existing utility functions for formatting, filters, charts, etc.
5. When interacting with Supabase, pass `user.id` and handle realtime
   updates if appropriate.
6. Follow naming & event‑binding conventions shown above.

Feel free to ask for clarifications if any page’s behavior is unclear or if
you need help figuring out where to hook in new functionality.