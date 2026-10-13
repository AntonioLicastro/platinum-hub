const WINDOW_MS = 60_000

// Per-instance in-memory sliding window. Good enough to blunt a runaway
// script or buggy client on a small internal app — it won't coordinate
// across serverless instances, so it's not a substitute for provider-side
// quotas (e.g. the Google Maps API key's own daily cap).
const hits = new Map<string, number[]>()

export function isRateLimited(key: string, limit: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter(t => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  return recent.length > limit
}
