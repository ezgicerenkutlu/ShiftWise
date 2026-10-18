# ShiftWise Deployment Guide

## Environment safety

This repository has a dedicated `security/hardening-preview` branch for review and testing. Use the separate Supabase project `shiftwise-test` for all schema and authorization testing. Do not point preview builds at production data or copy production secrets into Preview variables.

**Do not deploy a branch to Vercel's Production target.** A preview branch should be built as a Preview deployment only. Confirm the deployment target and project scope in Vercel before starting a deployment.

## Requirements

- Node.js 20 or newer
- npm
- GitHub repository access
- A separate Supabase test project
- A Vercel project with Git connected

## Supabase setup

1. Create or select a **test-only** Supabase project.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel **Preview** environment to the test project values.
3. Never expose `SUPABASE_SERVICE_ROLE_KEY` or a database connection string through a `NEXT_PUBLIC_*` variable.
4. Apply migrations in `supabase/migrations/` in chronological filename order. Use a disposable test project first and stop on the first error. Do not manually mark a migration as applied unless its SQL actually succeeded.
5. Confirm the resulting tables, foreign keys, RLS policies, triggers and indexes in the Supabase dashboard.
6. Run the Supabase Security and Performance advisors after schema changes.

### Edge Function: invite-employee

The function sends invitations using Supabase Auth's `inviteUserByEmail`. It does **not** use SMTP environment variables directly; configure the SMTP/provider settings in Supabase Authentication instead.

Configure these Edge Function secrets for the test project:

| Secret | Purpose |
| --- | --- |
| `APP_URL` | Canonical application origin used for the invite redirect, e.g. the approved preview URL |
| `PREVIEW_APP_URL` | Optional additional allowed preview origin |
| `SUPABASE_URL` | Test project URL |
| `SUPABASE_ANON_KEY` | Test project anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Test project's service role key; server-side secret only |

The function allows browser origins only when they match `APP_URL` or `PREVIEW_APP_URL`. Set these values before testing invitations. Never use a request's arbitrary `Origin` header to construct redirect URLs.

## Vercel preview setup

1. Import the GitHub repository into Vercel and confirm the linked repository is `ezgicerenkutlu/ShiftWise`.
2. Confirm the production branch is the intended stable branch, and configure Preview deployments for the review branch.
3. Add only test Supabase credentials to the **Preview** environment.
4. Keep service-role keys out of client-side variables and out of logs.
5. Confirm that the resulting deployment target is `preview` before opening its URL. A branch name alone does not guarantee a preview target.
6. If Vercel reports an access/scope error, re-authorize the correct account/team rather than trying another scope or changing production settings.

## Local checks

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

The GitHub Actions workflow `.github/workflows/preview-checks.yml` runs these checks on pull requests and pushes to the review branches. Build checks use placeholder public Supabase values and must not depend on live credentials.

## Security test checklist

- [ ] Unauthenticated requests cannot read or mutate tenant data.
- [ ] Employees cannot change their own role or restaurant membership.
- [ ] Employees cannot read another employee's private time-off/vacation request.
- [ ] Employees cannot approve/reject or rewrite another person's requests.
- [ ] Managers can only access records within their own restaurant.
- [ ] An employee cannot create a request for a different employee.
- [ ] Shift-swap requests reference a shift and employees in the same restaurant.
- [ ] Duplicate or ambiguous pending invitations cannot link an account to an arbitrary tenant.
- [ ] Invite endpoint rejects non-POST requests, invalid emails, unsupported roles, malformed JSON, and unapproved origins.
- [ ] Invite redirect is always built from configured `APP_URL`, not request headers.
- [ ] No test has used production data or production secrets.

## Important schema notes

Table names are defined by the migrations. For example, shift swaps use `shift_swap_requests`, schedule templates use `schedule_templates`, and availability overrides are defined by the migration whose filename ends in `create_availability_overrides.sql.sql`. Avoid relying on older names in previous deployment notes.

## Production readiness

Do not treat a successful build or a clean advisor result as proof of application security. Before any production launch, review all policies table by table, test with separate employee and manager identities across two test restaurants, verify invitation/signup flows, and obtain an explicit approval to deploy to production.
