# Student Allowance & Expense Management System

Modern, responsive web app for students to:
- register/login securely with Supabase Auth
- track income and expenses
- view allowance, remaining balance, and daily safe spending
- analyze spending with pie and bar charts

## Tech Stack
- HTML, CSS, JavaScript
- Supabase JS client (Auth + Postgres)
- Chart.js

## Project Structure
- `index.html` (also accessible via `login.html`, which redirects to index) - Login/Register
- `dashboard.html` - Allowance summary + recent transactions
- `add-transaction.html` - Add income/expense
- `analytics.html` - Pie and bar charts
- `assets/css/styles.css` - Shared modern responsive UI
- `assets/js/*.js` - Supabase + app logic
- `supabase-schema.sql` - Database schema and RLS policies

## Supabase Setup
1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
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
Serve this folder with any static server.

Example using VS Code Live Server or:

```powershell
# Python example
python -m http.server 5500
```

Then open:
- `http://localhost:5500/index.html`

## Notes
- Real-time updates are enabled for transactions using Supabase Realtime.
- Row Level Security (RLS) ensures users can only access their own data.
