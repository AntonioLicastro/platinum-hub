'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function ConfirmPage() {
  const [code, setCode] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorDetail, setErrorDetail] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    setCode(new URLSearchParams(window.location.search).get('code'))
  }, [])

  const confirm = async () => {
    if (!code) return
    setStatus('loading')
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('exchangeCodeForSession failed:', error)
      setErrorDetail(error.message)
      setStatus('error')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center space-y-4">
        <img src="/logo.png" alt="Platinum Hub" className="h-[100px] w-auto mx-auto" />

        {!code || status === 'error' ? (
          <>
            <p className="text-red-700 text-sm">
              {!code
                ? 'This sign-in link is missing its code. Go back to your email and open the link again, or request a new one.'
                : 'That link has expired or already been used. Go back and request a new one.'}
            </p>
            {errorDetail && <p className="text-xs text-gray-400">({errorDetail})</p>}
            <a href="/login" className="block text-sm text-blue-600 hover:underline">Back to sign in</a>
          </>
        ) : (
          <>
            <p className="text-gray-600 text-sm">Click below to finish signing in to Platinum Hub.</p>
            <button
              onClick={confirm}
              disabled={status === 'loading'}
              className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition"
            >
              {status === 'loading' ? 'Signing in...' : 'Confirm Sign-In'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
