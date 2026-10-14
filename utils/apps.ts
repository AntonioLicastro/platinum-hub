export type AppKey = 'mileage' | 'retention' | 'compliance' | 'leave' | 'ops'

export type AppLink = {
  key: AppKey
  name: string
  description: string
  url: string
  // Where on the app's site the sign-in handoff lives. Defaults to '/auth/handoff'; a
  // tile can add ?next=/path to land somewhere other than the app's home page.
  handoffPath?: string
  // Only these people (by email) see the tile; everyone else does not.
  visibleTo?: string[]
}

const HR_LOCKER_URL = process.env.NEXT_PUBLIC_HR_LOCKER_URL

// URLs can be overridden per-environment (e.g. pointed at localhost during
// local dev) via these env vars; production falls back to the real domains.
export const APPS: AppLink[] = [
  {
    key: 'mileage',
    name: 'Easy Mileage',
    description: 'Log mileage and travel expense claims',
    url: process.env.NEXT_PUBLIC_EASY_MILEAGE_URL ?? 'https://easymileage.vercel.app',
  },
  {
    key: 'retention',
    name: 'Retention Hub',
    description: 'Track leavers and exit interviews',
    url: process.env.NEXT_PUBLIC_RETENTION_HUB_URL ?? 'https://retention-hub.vercel.app',
  },
  {
    key: 'compliance',
    name: 'Compliance Wizard',
    description: 'Staff compliance checks and document tracking',
    url: process.env.NEXT_PUBLIC_COMPLIANCE_WIZARD_URL ?? 'https://compliance-tracker-six.vercel.app',
  },
  {
    key: 'leave',
    name: 'HR Locker',
    description: 'Employee records, compliance documents, leave and onboarding',
    // HR Locker replaces the A/L Tracker (which no longer exists) and is its own app.
    // While it is being tried out only the owner sees the tile. Set NEXT_PUBLIC_HR_LOCKER_URL
    // to its address; until then the tile opens the copy that is still inside Easy Mileage.
    url: HR_LOCKER_URL ?? process.env.NEXT_PUBLIC_EASY_MILEAGE_URL ?? 'https://easymileage.vercel.app',
    handoffPath: HR_LOCKER_URL ? '/auth/handoff' : '/auth/handoff?next=/people',
    visibleTo: ['antoniolicastro@platinumhomecare.ie'],
  },
  {
    key: 'ops',
    name: 'Platinum 360',
    description: 'Monthly CHO KPIs: recruitment, POC records and capacity',
    url: process.env.NEXT_PUBLIC_OPS_WIZARD_URL ?? 'https://ops-wizard.vercel.app',
  },
]
