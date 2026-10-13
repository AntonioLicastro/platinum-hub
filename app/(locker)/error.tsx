'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { buttonClass, EmptyState } from './_components/ui'

// Fallback for every HR Locker page that has no error.tsx of its own. Loaders
// throw on database errors (rather than showing an empty "all clear"), so this
// is what people see during a brief outage.
export default function PeopleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <EmptyState
      icon={AlertCircle}
      title="This page couldn't be loaded"
      body="Nothing has been changed. This is usually a temporary problem reaching the database, so trying again often fixes it."
      action={<button type="button" onClick={() => retry()} className={buttonClass('primary')}><RefreshCw size={16} /> Try again</button>}
    />
  )
}
