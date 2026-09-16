'use client'

import { LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export default function LogoutButton() {
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <button onClick={handleLogout} className="flex items-center gap-2 bg-[#323398] text-white px-4 py-2 rounded-full text-sm font-medium shadow-sm hover:bg-[#282a7a] transition">
      <LogOut size={16} /> Logout
    </button>
  )
}
