export type AppKey = 'mileage' | 'retention' | 'compliance' | 'leave' | 'ops'

export type AppLink = {
  key: AppKey
  name: string
  description: string
  url: string
  // Where on the app's site the sign-in handoff lives. Defaults to '/auth/handoff'; a
  // tile can add ?next=/path to land somewhere other than the app's home page.
  handoffPath?: string
  // A preview: these people (by email) are sent to a different app/URL than everyone
  // else, so a replacement can be tried before it is switched on for the whole company.
  preview?: { emails: string[]; url: string; handoffPath?: string }
}

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
    description: '',
    url: process.env.NEXT_PUBLIC_AL_TRACKER_URL ?? 'https://al-tracker-theta.vercel.app',
    // The new HR Locker is built into Easy Mileage (its /people area) and will replace the
    // A/L Tracker. Until the leave data is moved over, only these people get the new one;
    // to switch it on for everyone, move these values into url/handoffPath and drop preview.
    preview: {
      emails: ['antoniolicastro@platinumhomecare.ie'],
      url: process.env.NEXT_PUBLIC_EASY_MILEAGE_URL ?? 'https://easymileage.vercel.app',
      handoffPath: '/auth/handoff?next=/people',
    },
  },
  {
    key: 'ops',
    name: 'Platinum 360',
    description: 'Monthly CHO KPIs: recruitment, POC records and capacity',
    url: process.env.NEXT_PUBLIC_OPS_WIZARD_URL ?? 'https://ops-wizard.vercel.app',
  },
]
