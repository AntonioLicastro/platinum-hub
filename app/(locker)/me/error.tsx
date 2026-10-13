'use client'

import { useEffect } from 'react'
import { CircleAlert, RefreshCw } from 'lucide-react'
import { HUB_URL } from '@/utils/hub-url'
import { buttonClass, EmptyState, PageHeader } from '../_components/ui'

export default function MeError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <>
      <PageHeader title="My space" />
      <EmptyState
        icon={CircleAlert}
        title="We couldn't open your space"
        body="Nothing has been changed. This is usually a short-lived problem reaching our records, so trying again often fixes it. You can still use Easy Mileage in the meantime."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => retry()} className={buttonClass('primary')}><RefreshCw size={16} /> Try again</button>
            <a href={HUB_URL} className={buttonClass('secondary')}>Go to Platinum Hub</a>
          </div>
        }
      />
    </>
  )
}
