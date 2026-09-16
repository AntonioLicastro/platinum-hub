'use client'

import { useState } from 'react'
import { Car, UserMinus, ShieldCheck, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { APPS, type AppKey } from '@/utils/apps'

const ICONS: Record<AppKey, LucideIcon> = {
  mileage: Car,
  retention: UserMinus,
  compliance: ShieldCheck,
}

const TILE_STYLE: Record<AppKey, string> = {
  mileage: 'bg-blue-50 text-blue-600',
  retention: 'bg-emerald-50 text-emerald-600',
  compliance: 'bg-violet-50 text-violet-600',
}

export default function HubClient() {
  const [launchingKey, setLaunchingKey] = useState<AppKey | null>(null)
  const [error, setError] = useState('')
  const supabase = createClient()

  const launch = async (app: (typeof APPS)[number]) => {
    setError('')
    setLaunchingKey(app.key)

    // Open the tab synchronously, in the same click event, so the browser
    // doesn't treat it as a blocked pop-up — an `await` before window.open
    // loses the "direct result of a user gesture" status. We fill in the
    // real URL once the session tokens are ready, then sever window.opener
    // ourselves (same effect as the 'noopener' flag, which would otherwise
    // stop us getting a handle back to navigate).
    const popup = window.open('', '_blank')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      popup?.close()
      window.location.href = '/login'
      return
    }

    if (!popup) {
      setError(`Your browser blocked the pop-up for ${app.name}. Allow pop-ups for this site and try again.`)
      setLaunchingKey(null)
      return
    }

    const target = new URL('/auth/handoff', app.url)
    target.hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }).toString()

    popup.opener = null
    popup.location.href = target.toString()
    setLaunchingKey(null)
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-100 text-red-700 p-3 rounded text-sm">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        {APPS.map(app => {
          const Icon = ICONS[app.key]
          return (
            <button
              key={app.key}
              onClick={() => launch(app)}
              disabled={launchingKey === app.key}
              className="group flex flex-col items-start gap-3 p-6 rounded-2xl border border-gray-100 text-left hover:border-gray-200 hover:shadow-md transition disabled:opacity-60"
            >
              <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${TILE_STYLE[app.key]}`}>
                <Icon size={22} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-semibold text-gray-900">
                  {app.name}
                  <ArrowUpRight size={16} className="text-gray-300 group-hover:text-gray-500 transition" />
                </div>
                <p className="text-sm text-gray-500 mt-1">{app.description}</p>
              </div>
              <span className="mt-auto text-xs font-medium text-gray-400">
                {launchingKey === app.key ? 'Launching…' : 'Opens in a new tab, already signed in'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
