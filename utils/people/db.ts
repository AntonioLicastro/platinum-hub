import { createAdminClient } from '@/utils/supabase/admin'

export { createAdminClient }

// Supabase's admin API intermittently rejects the service-role key with a
// transient key-validation error that succeeds on retry (see app/admin/page.tsx).
export async function withRetry<T extends { error: unknown }>(run: () => PromiseLike<T>, attempts = 3): Promise<T> {
  let result = await run()
  for (let i = 1; i < attempts && result.error; i++) {
    result = await run()
  }
  return result
}

// PostgREST caps every response at 1000 rows, so a single select silently
// drops everything past that. Page through with range() until a short page
// comes back. The query MUST have a stable order (add an id tiebreaker).
const PAGE_SIZE = 1000
export async function fetchAllPages<T>(
  runPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRetry(() => runPage(from, from + PAGE_SIZE - 1))
    if (error) return { data: all, error }
    all.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return { data: all, error: null }
  }
}

/**
 * `.in('employee_id', ids)` with hundreds of uuids overflows the request URL.
 * Run the query in chunks of ids and concatenate the rows.
 */
export async function fetchByIds<T>(
  ids: string[],
  runChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  chunkSize = 100,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await withRetry(() => runChunk(ids.slice(i, i + chunkSize)))
    if (error) return { data: all, error }
    all.push(...(data ?? []))
  }
  return { data: all, error: null }
}
