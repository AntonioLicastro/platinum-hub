// Who may use HR Locker. While it is being tried out only the owner can: every
// page, action and download refuses anyone else (see getViewer in access.ts).
// To open it up later, add emails here, or use '*' for every company account.
const ENABLED_EMAILS = ['antoniolicastro@platinumhomecare.ie']

export function isHrLockerEnabled(email: string | null | undefined): boolean {
  if (!email) return false
  return ENABLED_EMAILS.includes('*') || ENABLED_EMAILS.includes(email.toLowerCase().trim())
}
