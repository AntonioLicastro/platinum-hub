'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { buttonClass, EmptyState, PageHeader } from '../_components/ui'

// Compliance data is loaded strictly: if it can't be read we show this rather than a
// page that quietly says everyone is up to date.
export default function ComplianceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <>
      <PageHeader title="Compliance" />
      <EmptyState
        icon={AlertCircle}
        title="Compliance couldn't be loaded"
        body="Nothing has been changed. This is usually a temporary problem reaching the database, so trying again often fixes it."
        action={<button type="button" onClick={() => retry()} className={buttonClass('primary')}><RefreshCw size={16} /> Try again</button>}
      />
    </>
  )
}
