'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const ALLOWED_DOMAIN = '@platinumhomecare.ie'

// Staff sign in with a one-time code sent to their company email. HR Locker never
// creates accounts: only people who already have a Platinum account can sign in.
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    if (!email.trim().toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setError(`Sign-in is restricted to ${ALLOWED_DOMAIN} email addresses.`)
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })

    if (error) {
      setError(error.message)
    } else {
      setInfo('Check your email for a sign-in link, or enter the code from that email below.')
      setCodeSent(true)
    }
    setLoading(false)
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp, type: 'email' })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#323398] to-[#179048] text-2xl font-bold text-white shadow-sm">H</span>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">HR Locker</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Platinum Home Care staff sign-in</p>

        {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {info && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{info}</div>}

        {!codeSent ? (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">Work email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder={`you${ALLOWED_DOMAIN}`}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#323398] focus:outline-none focus:ring-4 focus:ring-[#323398]/10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#323398] py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#282a7a] disabled:opacity-60">
              {loading ? 'Sending…' : 'Send me a login code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4 text-left">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-slate-700">Code from your email</label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-center text-sm tracking-widest focus:border-[#323398] focus:outline-none focus:ring-4 focus:ring-[#323398]/10"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#323398] py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#282a7a] disabled:opacity-60">
              {loading ? 'Verifying…' : 'Verify code'}
            </button>
            <button type="button" onClick={() => { setCodeSent(false); setError(''); setInfo('') }} className="w-full text-sm text-[#323398] hover:underline">
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
