const COMPANY_DOMAIN = '@platinumhomecare.ie'

// Any account signed in with something other than a @platinumhomecare.ie
// address — whether that's a Fleet-only signup or a Senior/Contract Carer
// using their personal email (see is_allowed_signup_email in
// 20260725_allow_carer_personal_emails.sql, which controls who's allowed to
// sign up at all) — is restricted to the Fleet page and nothing else. A
// plain domain check rather than an allowlist lookup, so the rule holds for
// every non-company email with no exceptions and no DB round-trip.
export function isFleetOnlyUser(email: string | null | undefined): boolean {
  if (!email) return true
  return !email.toLowerCase().trim().endsWith(COMPANY_DOMAIN)
}
