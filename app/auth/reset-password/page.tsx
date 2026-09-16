'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<'exchanging' | 'ready' | 'saving' | 'error' | 'done'>('exchanging')
  const [errorDetail, setErrorDetail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const code = params.get('code')

    // token_hash (from the email template) verifies purely against the
    // token in the URL — no local state needed, so it works even when the
    // link is opened in a different browser/device than the one that
    // requested it (email clients routinely do this). The old `code` param
    // is PKCE-based and requires a locally-stored verifier from the
    // requesting browser, which is exactly what breaks in that situation —
    // kept here only so a link generated before the email template switch
    // still works.
    if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error) {
          setStatus('error')
          setErrorDetail(error.message)
          return
        }
        setStatus('ready')
      })
      return
    }

    if (!code) {
      setStatus('error')
      setErrorDetail('This link is missing its code.')
      return
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setStatus('error')
        setErrorDetail(error.message)
        return
      }
      setStatus('ready')
    })
    // Runs once on mount to consume the one-time token from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Passwords don’t match.')
      return
    }

    setStatus('saving')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setStatus('ready')
      setFormError(error.message)
      return
    }
    setStatus('done')
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center space-y-4">
        <img src="/logo.png" alt="Platinum Hub" className="h-[100px] w-auto mx-auto" />

        {status === 'exchanging' && <p className="text-gray-500 text-sm">Checking your link...</p>}

        {status === 'error' && (
          <>
            <p className="text-red-700 text-sm">
              That link has expired or already been used. Go back and request a new one.
            </p>
            {errorDetail && <p className="text-xs text-gray-400">({errorDetail})</p>}
            <a href="/login" className="block text-sm text-blue-600 hover:underline">Back to sign in</a>
          </>
        )}

        {(status === 'ready' || status === 'saving') && (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <p className="text-sm text-gray-600 text-center">Choose your password.</p>
            {formError && <div className="bg-red-100 text-red-700 p-3 rounded text-sm">{formError}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                autoFocus
                className="w-full border p-2 rounded mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">At least 8 characters.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                type="password"
                required
                className="w-full border p-2 rounded mt-1"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={status === 'saving'}
              className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition"
            >
              {status === 'saving' ? 'Saving...' : 'Save Password'}
            </button>
          </form>
        )}

        {status === 'done' && <p className="text-green-700 text-sm">Password set — signing you in...</p>}
      </div>
    </div>
  )
}
