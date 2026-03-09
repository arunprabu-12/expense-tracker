# Student Allowance & Expense Management System

Modern, responsive web app for students and parents. Students can register under a parent email; accounts are linked so parents can monitor and top‑up balances. Features include:
- register/login securely with Supabase Auth (parent or student role)
- link student and parent accounts via email at signup
- students track income and expenses, view allowance and balance
- parents monitor child spending, view reports, and add money
- analyze spending with pie and bar charts

## Tech Stack
- HTML, CSS, JavaScript
- Supabase JS client (Auth + Postgres)
- Chart.js

## Project Structure
- `index.html` (also accessible via `login.html`, which redirects to index) - Login/Register
- `student-dashboard.html` - Student allowance summary, expense entry form, and recent transactions
- `parent-dashboard.html` - Parent view of linked student account(s) with ability to add money
- `analytics.html` - Pie and bar charts (works for both students and parents)
- `assets/css/styles.css` - Shared modern responsive UI
- `assets/js/*.js` - Supabase + app logic
- `supabase-schema.sql` - Database schema and RLS policies

## Supabase Setup
1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql` (the script now includes new
   parent_email column, index, and RLS policies that allow parents to view and
   manage their child’s data).
3. In Supabase dashboard:
   - Auth > Providers: keep Email enabled
   - Auth > URL Configuration: set site URL to your app URL (or localhost)
4. Copy:
   - Project URL
   - anon public API key
5. Edit `assets/js/config.js`:
   - set `window.SUPABASE_URL`
   - set `window.SUPABASE_ANON_KEY`

## Run
The application is a static website. You must start a local HTTP server and
then browse to the correct port – simply opening the file in the browser will
trigger `ERR_CONNECTION_REFUSED` because no server will be listening.

1. Start a server from the project root. Any port will do; below we use `5500`:

```powershell
# Python (built‑in)
python -m http.server 5500

# or Node:
npx serve .
```

2. Visit the site using the same port you chose (e.g. `http://localhost:5500`).
   omitting the port (just `http://localhost`) will result in `ERR_CONNECTION_REFUSED`.

3. If the port fails to bind, pick a different one or check firewall settings.

Once the server is running you can register/log in as students and parents and
all pages (`index.html`, `student-dashboard.html`, `parent-dashboard.html`,
`analytics.html`) will load correctly.

## Notes
- Real-time updates are enabled for transactions using Supabase Realtime.
- Row Level Security (RLS) ensures users can only access their own data.
