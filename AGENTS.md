# This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data.
Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
(`params` and `searchParams` are Promises; a `"use server"` file may only export async functions.)

# HR Locker rules

- This holds personal data (PPS numbers, pay, vetting, disciplinary notes). Every page, server action and route handler
  must go through `utils/people/access.ts` (`getViewer`, `authorize`, `authorizeEmployee`, `requireCapability`).
  The `hr_*` tables have RLS with no policies, so a missing check is a real leak.
- Sensitive reads (PPS reveal, pay, document download, exports) must write the audit row first
  (`auditBeforeRead`) and refuse if it cannot be written.
- Shared Supabase project: `profiles` and `staff_roster` belong to the Easy Mileage app. Do not change them from here.
  Migrations are applied by hand in the Supabase SQL editor; a file existing does not mean it is live.
