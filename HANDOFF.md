# HR Locker: hand-off note (written 2026-10-13)

Where things stand, so a new session can continue without the chat history.

## What exists
- **HR Locker**: Platinum Home Care's HR system (employee records, compliance documents with expiry, leave incl. an
  A/L-Tracker-style year calendar, reviews, onboarding/offboarding checklists, reports, audit log). It replaces the A/L
  Tracker (which "no longer exists") and is launched from **Platinum Hub**.
- This repo is the **standalone app** (Next.js 16 + Supabase). It builds, lints and works in a real browser. It has NOT
  been pushed to its own repo or deployed yet. It was extracted from `Platinum-Go` (Easy Mileage), where an identical copy
  still lives under `app/people` (owner-only, live on `main`) as a stop-gap.
- Database: all `hr_*` tables, the private `hr-documents` bucket and starter data are ALREADY applied in Supabase
  (migrations 01-12, verified: 111 employees, 18 document types, 16 leave types, 23 checklist tasks, 18 tables locked).
  **Migration 13 (`20261014_people_hub_13_leave_group.sql`) was sent to the owner but not confirmed as run.** The app works
  without it (year view just has no groups).

## Decisions made with the owner
- Name: **HR Locker**. Own app with its own address, opened from the Platinum Hub tile (not inside Easy Mileage).
- **Closed trial: owner only** (`utils/people/rollout.ts`; edit the list, or '*', to open it up). Platinum Hub tile is also
  owner-only (`visibleTo` in platinum-hub `utils/apps.ts`).
- Only **John Smith** (johnsmith@platinumhomecare.ie) should see everyone's leave; other managers see their own areas/direct
  reports. Plan (NOT built yet): a `leave_view_all` flag on `hr_access` (migration 14), shown only for annual leave on the
  year view/calendar, no PPS/pay/documents; toggle in Settings > Access; audited. HR roles see all leave as part of HR work.
- Sick/statutory leave detail is hidden from managers everywhere.

## To finish (in order)
1. Owner creates empty private GitHub repo `AntonioLicastro/hr-locker`; push this code there (it is also backed up on
   branch `claude/hr-locker-standalone-backup` of `AntonioLicastro/platinum-hub`).
2. Owner creates a Vercel project from it with env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM, NEXT_PUBLIC_PLATINUM_HUB_URL, NEXT_PUBLIC_APP_URL.
3. Supabase > Authentication > URL configuration: add `https://<new-domain>/auth/confirm` to Redirect URLs.
4. In the Platinum Hub Vercel project set `NEXT_PUBLIC_HR_LOCKER_URL` = the new app's address (switches the tile over).
5. Run migration 13 in the Supabase SQL editor.
6. Move the old **A/L Tracker data** into HR Locker (needs read access to `AntonioLicastro/AL-tracker` or a CSV/Excel export,
   plus who is in the "RMs" and "SLT + Support" groups). Then delete/pause the al-tracker Vercel project (not its DB tables
   until the data is moved).
7. Build the John Smith leave rule above. Then remove the stop-gap copy from `Platinum-Go` (`app/people`, `app/api/people`,
   `utils/people`, the admin-dashboard button, the `next` param in `app/auth/handoff`).
8. Before opening it to anyone else: finish browser testing by role, and the Next.js/React code review (both stopped at
   the usage limit). Run the access matrix: owner, hr, manager, implied manager, employee, Fleet-only, anonymous.

## Known limits
- xlsx import: a bounded-inflate zip guard is in place, but the `xlsx@0.18.5` library has known weaknesses with hostile files
  (only HR import users can upload).
- Concurrent edits by two HR users can overwrite each other (last save wins); not fixed.
- Rate limits are per server instance (in-memory).
- Migrations are applied by hand in the Supabase SQL editor; a migration file existing does not mean it is live.
