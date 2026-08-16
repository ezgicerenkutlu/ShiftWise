# ShiftWise Deployment Guide

This guide covers deploying ShiftWise to production using GitHub, Supabase, and Vercel.

---

## Prerequisites

- A GitHub account
- A Supabase account (free tier works to start)
- A Vercel account (free tier works to start)
- Node.js 18+ and npm installed locally

---

## 1. GitHub Setup

### Create a repository

1. Go to [github.com/new](https://github.com/new) and create a new repository named `shiftwise`.
2. Initialize with a `.gitignore` for Node.js (already included in this project).

### Push your code

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/shiftwise.git
git push -u origin main
```

### Branch protection (recommended)

1. Go to Settings > Branches > Add rule.
2. Set branch name pattern to `main`.
3. Enable "Require pull request before merging".
4. Enable "Require status checks to pass" (after connecting Vercel in step 3).

---

## 2. Supabase Setup

### Create a project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click "New Project".
3. Fill in:
   - **Name**: `shiftwise-prod`
   - **Database Password**: Generate a strong password and save it securely.
   - **Region**: Choose the closest to your users.
4. Click "Create new project" and wait ~2 minutes for provisioning.

### Get your API keys

1. Go to Project Settings > API.
2. Copy the following values:
   - **Project URL** — `https://<your-project-ref>.supabase.co`
   - **anon public key** — starts with `eyJ...`
   - **service_role key** — starts with `eyJ...` (keep this secret, never expose to the browser)

### Run database migrations

All migration files are in `supabase/migrations/`. Run them in order using the Supabase SQL Editor:

1. Go to the SQL Editor in your Supabase dashboard.
2. For each file in `supabase/migrations/` (in chronological order by filename), copy the SQL content and paste it into the editor, then click "Run".
3. Verify tables were created by going to Table Editor — you should see: `restaurants`, `profiles`, `employees`, `locations`, `shifts`, `contracts`, `availability`, `vacation_requests`, `shift_swaps`, `notifications`, `payroll_periods`, `payroll_entries`, `restaurant_settings`, `holiday_calendar`, `shift_templates`, `staffing_requirements`, `availability_overrides`, and `shift_generator_configs`.

### Deploy the Edge Function

The `invite-employee` edge function sends invitation emails.

1. Go to Edge Functions in your Supabase dashboard.
2. Click "Deploy a new function".
3. Name it `invite-employee`.
4. Copy the contents of `supabase/functions/invite-employee/index.ts` into the editor.
5. Click "Deploy".

Alternatively, use the Supabase MCP tools if available:
- `deploy_edge_function` with slug `invite-employee` and `verify_jwt: true`.

### Configure Edge Function secrets

The invite function needs SMTP credentials to send emails. Go to Project Settings > Edge Functions > Secrets and add:

| Name | Value |
|------|-------|
| `SMTP_HOST` | Your SMTP server host (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Your SMTP username |
| `SMTP_PASS` | Your SMTP password |
| `SMTP_FROM` | The sender email (e.g. `noreply@yourdomain.com`) |

If you don't have an SMTP server, you can use a service like Resend, Postmark, or SendGrid. The function expects standard SMTP environment variables.

### Enable email auth

1. Go to Authentication > Providers.
2. Ensure "Email" is enabled (it is by default).
3. Go to Authentication > Email Templates and customize the invitation template if desired.
4. Go to Authentication > Settings and ensure "Confirm email" is **disabled** (this app uses password-based auth without email confirmation).

---

## 3. Vercel Deployment

### Connect your repository

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click "Add New" > "Project".
3. Import your `shiftwise` repository.

### Configure environment variables

In the Vercel project settings, go to Settings > Environment Variables and add the following for **Production**, **Preview**, and **Development**:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service_role key (server-side only) |
| `SUPABASE_DB_URL` | `postgresql://postgres.<ref>:<password>@<host>:5432/postgres` |

> **Important**: The `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are sensitive and should only be used in server-side code (server components, API routes, edge functions). Never prefix them with `NEXT_PUBLIC_`.

### Deploy

1. Click "Deploy".
2. Vercel will run `npm install` and `npm run build` automatically.
3. Once deployed, you'll get a URL like `https://shiftwise.vercel.app`.

### Custom domain (optional)

1. Go to Settings > Domains.
2. Add your domain (e.g. `app.shiftwise.com`).
3. Follow Vercel's instructions to update your DNS records.
4. Vercel will automatically provision SSL certificates.

---

## 4. Environment Variables Reference

Create a `.env.local` file for local development (do NOT commit this file):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
```

The `.gitignore` file already excludes `.env` and `.env.local`.

---

## 5. Post-Deployment Checklist

- [ ] Database migrations applied successfully
- [ ] Edge function deployed and secrets configured
- [ ] Environment variables set in Vercel
- [ ] Authentication works (register a new workspace, sign in, sign out)
- [ ] Row Level Security is enabled on all tables (check in Supabase dashboard)
- [ ] Realtime subscriptions work (open two browser windows, edit a shift in one, verify it updates in the other)
- [ ] Calendar drag-and-drop works on desktop and mobile
- [ ] Export functions (PDF, Excel, CSV, PNG) download correctly
- [ ] Analytics page renders charts with real data
- [ ] Mobile sidebar menu opens and closes correctly
- [ ] Theme toggle (light/dark) works and persists

---

## 6. Local Development

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start the dev server
npm run dev

# Build for production
npm run build

# Start the production server
npm start
```

> **Note**: Use `--legacy-peer-deps` because some dependencies have peer dependency conflicts with React 19. The `.npmrc` file in this project already sets `legacy-peer-deps=true`.

---

## 7. Database Security

All tables have Row Level Security (RLS) enabled. The security model is:

- **Managers** can read and write all data within their restaurant.
- **Employees** can read their own data (shifts, contracts, availability, payroll) and write their own availability.
- **Anon** (unauthenticated) users have no access to any data.

To verify your security posture, run the Supabase security advisor in your dashboard:
1. Go to Database > Advisors.
2. Run the "Security" advisor.
3. Address any findings before going live.

---

## 8. Monitoring and Maintenance

### Supabase

- Monitor database usage in the Supabase dashboard (Database > Reports).
- Set up database backups (automatic on Pro plan, manual on free tier).
- Monitor auth usage in Authentication > Users.

### Vercel

- Monitor deployment status and logs in the Vercel dashboard.
- Set up deployment notifications (integrations available for Slack, Discord, email).
- Monitor analytics in Vercel Analytics (enable in Project Settings).

### Error tracking (recommended for production)

Consider adding an error tracking service:
- **Sentry** — Add `@sentry/nextjs` and configure in `next.config.js`.
- **Vercel's built-in error tracking** — Available on Pro plans.

---

## 9. Troubleshooting

### Build fails on Vercel

- Ensure all environment variables are set correctly.
- Check that `npm install --legacy-peer-deps` runs successfully (the `.npmrc` file handles this).
- Verify there are no TypeScript errors locally with `npm run build`.

### Authentication not working

- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set and correct.
- Check that the Supabase Auth provider (Email) is enabled.
- Ensure email confirmation is disabled for this app.

### Database queries return no data

- Verify RLS policies are correctly set up (run the security advisor).
- Check that the authenticated user has a `profile` row linked to a `restaurant`.
- Verify the `restaurant_id` filter in queries matches the user's restaurant.

### Edge function not sending emails

- Check that SMTP secrets are configured in Supabase > Edge Functions > Secrets.
- Review function logs in Supabase > Edge Functions > Logs.
- Test the SMTP credentials independently.

### Realtime not updating

- Ensure Realtime is enabled in Supabase (it is by default).
- Check that the realtime subscription channel name matches the table name.
- Verify the user has the correct RLS permissions to receive the realtime events.
