'use client'

import { supabase } from '@/lib/supabase'

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  const headers = new Headers(init.headers || {})
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  return fetch(input, {
    ...init,
    headers,
  })
}

