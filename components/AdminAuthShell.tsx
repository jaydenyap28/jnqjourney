'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, LogOut, ShieldCheck } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

export default function AdminAuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail] = useState('')

  const isLoginPage = useMemo(() => pathname?.startsWith('/admin/login'), [pathname])

  useEffect(() => {
    let mounted = true

    const syncSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      const session = data.session
      setSignedIn(Boolean(session))
      setEmail(String(session?.user?.email || ''))
      setLoading(false)

      if (!session && !isLoginPage) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname || '/admin')}`)
      }

      if (session && isLoginPage) {
        router.replace('/admin')
      }
    }

    syncSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSignedIn(Boolean(session))
      setEmail(String(session?.user?.email || ''))
      setLoading(false)

      if (!session && !isLoginPage) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname || '/admin')}`)
      }

      if (session && isLoginPage) {
        router.replace('/admin')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [isLoginPage, pathname, router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0f1c] text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-white/80">Checking admin session...</span>
        </div>
      </div>
    )
  }

  if (isLoginPage) {
    return <>{children}</>
  }

  if (!signedIn) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#050816]">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#050816]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 text-emerald-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <Link href="/admin" className="text-sm font-semibold text-white">
                JnQ Journey Admin
              </Link>
              <div className="text-xs text-white/45">Protected by Supabase Auth</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {email ? <span className="hidden text-xs text-white/55 md:inline">{email}</span> : null}
            <Button type="button" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
