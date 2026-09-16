import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import LogoutButton from './logout-button'
import HubClient from './hub-client'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim()

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-[1000px] mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
          <img src="/logo.png" alt="Platinum Hub" className="h-[60px] w-auto" />
          <LogoutButton />
        </div>

        <p className="text-sm text-gray-500 mb-6">
          {fullName ? `Welcome, ${fullName}, please pick an app to launch.` : 'Welcome, please pick an app to launch.'}
        </p>

        <HubClient />
      </div>
    </div>
  )
}
