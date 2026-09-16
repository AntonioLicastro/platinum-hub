'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const ALLOWED_DOMAIN = '@platinumhomecare.ie'

const REASON_MESSAGES: Record<string, string> = {
  domain: `Access is restricted to ${ALLOWED_DOMAIN} accounts.`,
  signin: 'Please sign in to continue.',
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

type Mode = 'signin' | 'signup' | 'reset' | 'reset-verify'

function LoginForm() {
  const [mode, setMode] = useState<Mode>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')

  const resetMessages = () => { setError(''); setInfo('') }

  const switchMode = (next: Mode) => {
    resetMessages()
    setPassword('')
    setConfirmPassword('')
    setResetCode('')
    setMode(next)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setError(`Sign-in is restricted to ${ALLOWED_DOMAIN} email addresses.`)
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Incorrect email or password. If you haven’t set a password yet, use "Forgot / set up password" below.')
      setLoading(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setError(`Sign-up is restricted to ${ALLOWED_DOMAIN} email addresses.`)
      setLoading(false)
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setLoading(false)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords don’t match.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        data: { full_name: fullName },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setInfo('Check your email for a confirmation link to finish creating your account.')
    setLoading(false)
  }

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setError(`That must be a ${ALLOWED_DOMAIN} email address.`)
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setLoading(false)
    setMode('reset-verify')
  }

  // Alternative to clicking the emailed link: type the code from the same
  // email directly here. Some corporate mail security (Safe Links, Mimecast)
  // pre-fetches every link in an email to scan it, which silently burns a
  // one-time link before the recipient ever opens it — the code is immune
  // to that since nothing can "click" a value the user has to type in.
  const handleResetVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setLoading(false)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords don’t match.')
      setLoading(false)
      return
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: resetCode, type: 'recovery' })
    if (verifyError) {
      setError(verifyError.message)
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
        <img src="/logo.png" alt="Platinum Hub" className="h-[87px] w-auto mx-auto mb-0" />

        <p className="text-gray-600 mb-6">Staff Sign-In</p>

        {reason && REASON_MESSAGES[reason] && !error && !info && (
          <div className="bg-amber-100 text-amber-800 p-3 rounded mb-4 text-sm">{REASON_MESSAGES[reason]}</div>
        )}
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}
        {info && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm">{info}</div>}

        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                placeholder={`you${ALLOWED_DOMAIN}`}
                className="w-full border p-2 rounded mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                className="w-full border p-2 rounded mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => switchMode('signup')} className="text-blue-600 hover:underline">
                Create an account
              </button>
              <button type="button" onClick={() => switchMode('reset')} className="text-blue-600 hover:underline">
                Forgot / set up password
              </button>
            </div>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                required
                className="w-full border p-2 rounded mt-1"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                placeholder={`you${ALLOWED_DOMAIN}`}
                className="w-full border p-2 rounded mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                minLength={8}
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
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
            <button type="button" onClick={() => switchMode('signin')} className="w-full text-sm text-blue-600 hover:underline">
              Back to sign in
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetRequest} className="space-y-4 text-left">
            <p className="text-sm text-gray-500">
              Enter your email and we&apos;ll send you a link to set (or reset) your password — this also works the first time, if you&apos;ve never had a password before.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                placeholder={`you${ALLOWED_DOMAIN}`}
                className="w-full border p-2 rounded mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition"
            >
              {loading ? 'Sending...' : 'Send Password Link'}
            </button>
            <button type="button" onClick={() => switchMode('signin')} className="w-full text-sm text-blue-600 hover:underline">
              Back to sign in
            </button>
          </form>
        )}

        {mode === 'reset-verify' && (
          <form onSubmit={handleResetVerify} className="space-y-4 text-left">
            <p className="text-sm text-gray-500">
              Check your email for a link, or enter the code from that email below along with your new password.
              If the link doesn&apos;t work (some company email security scans and uses up links automatically),
              the code is the reliable option.
            </p>
            {error && <div className="bg-red-100 text-red-700 p-3 rounded text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700">Code from your email</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="w-full border p-2 rounded mt-1 tracking-widest text-center"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                required
                minLength={8}
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
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition"
            >
              {loading ? 'Setting password...' : 'Set Password'}
            </button>
            <button type="button" onClick={() => switchMode('reset')} className="w-full text-sm text-blue-600 hover:underline">
              Use a different email
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs italic text-gray-400">Developed by Antonio Licastro</p>
      </div>
    </div>
  )
}
