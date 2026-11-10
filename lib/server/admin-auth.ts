import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export async function requireAdminRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: '缺少 Supabase 环境变量，无法校验管理员身份。' }, { status: 500 }),
    }
  }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: '未登录或缺少管理员 token。' }, { status: 401 }),
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: '管理员身份校验失败，请重新登录。' }, { status: 401 }),
    }
  }

  const adminEmails = getAdminEmails()
  const email = String(data.user.email || '').trim().toLowerCase()

  // A missing allowlist must never grant administrative access to every user.
  if (!adminEmails.length || !email || !adminEmails.includes(email)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: '这个账号没有后台权限。' }, { status: 403 }),
    }
  }

  // The new candidate site currently adapts reads only. Existing dedicated
  // Registry/Edge/Bridge deployments do not use this Next API guard. Until
  // their mutation contracts and publisher read-back are connected here,
  // block partial legacy writes (including Notes/Guide storage-only saves).
  if (process.env.JNQ_PUBLIC_FEED_ORIGIN && !['GET', 'HEAD'].includes(request.method)) {
    return {
      ok: false as const,
      response: NextResponse.json({error:'当前迁移候选已启用受控读取，后台写入尚未接通，未执行保存。'},
        {status:503,headers:{'Cache-Control':'private, no-store, max-age=0'}}),
    }
  }

  return {
    ok: true as const,
    user: data.user,
  }
}

