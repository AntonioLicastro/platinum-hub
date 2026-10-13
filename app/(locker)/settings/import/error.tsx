'use client'

import { useEffect } from 'react'
import { CircleAlert, RefreshCw } from 'lucide-react'
import { buttonClass, EmptyState, PageHeader } from '../../_components/ui'

export default function ImportError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <>
      <PageHeader title="Import and sync" />
      <EmptyState
        icon={CircleAlert}
        title="This page couldn’t be loaded"
        body="Nothing has been changed. This is usually a temporary problem reaching the database, so trying again often fixes it."
        action={<button type="button" onClick={() => retry()} className={buttonClass('primary')}><RefreshCw size={16} /> Try again</button>}
      />
    </>
  )
}
