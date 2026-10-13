# HR Locker

Platinum Home Care's HR system: employee records, compliance documents with expiry tracking, leave (with an
annual-leave year calendar), reviews, onboarding / offboarding checklists, reports and an audit log.
It replaces the A/L Tracker and is launched from **Platinum Hub** (single sign-on).

- Next.js 16 (App Router) + Supabase. Same Supabase project as the other Platinum apps.
- All HR tables are prefixed `hr_`, have row-level security on with **no policies**, and are read and written only by
  the server with the service-role key. Access control lives in `utils/people/access.ts`.
- Who may use it at the moment is set in `utils/people/rollout.ts`.

## Environment variables (Vercel)

| Variable | What for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the shared Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side data access (never expose to the browser) |
| `NEXT_PUBLIC_PLATINUM_HUB_URL` | where "Platinum Hub" links go |
| `NEXT_PUBLIC_APP_URL` | this app's own address, used in notification emails |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional: leave request emails |

In Supabase, add this app's address (`https://<your-domain>/auth/confirm`) to **Authentication → URL configuration → Redirect URLs**.

## Database

`supabase/migrations/*` creates the `hr_*` tables, the private `hr-documents` storage bucket and starter data. They are
applied by hand in the Supabase SQL editor, in file-name order, and are safe to re-run. This app only owns the `hr_*`
tables; `profiles` and `staff_roster` belong to Easy Mileage.
