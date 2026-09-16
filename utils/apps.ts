export type AppKey = 'mileage' | 'retention' | 'compliance'

export type AppLink = {
  key: AppKey
  name: string
  description: string
  url: string
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
]
