'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, LockKeyhole } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = useMemo(() => searchParams.get('next') || '/admin', [searchParams])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (error) {
      setMessage(error.message || '登录失败，请检查邮箱与密码。')
      return
    }

    router.replace(nextPath)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_24%),linear-gradient(180deg,#050816,#0b1223)] px-4 py-10 md:px-8">
      <div className="mx-auto flex min-h-[78vh] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 overflow-hidden rounded-[36px] border border-white/10 bg-white/5 shadow-[0_40px_120px_rgba(0,0,0,0.38)] backdrop-blur-xl md:grid-cols-[0.95fr_1.05fr]">
          <div className="flex flex-col justify-between border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_28%),linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-8 md:border-b-0 md:border-r md:p-10">
            <div className="space-y-5">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-100">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">Protected Admin</p>
                <h1 className="text-4xl font-semibold leading-tight text-white md:text-[3.2rem]">
                  JnQ Journey
                  <br />
                  Admin Login
                </h1>
                <p className="max-w-md text-sm leading-7 text-white/70">
                  后台现在改成登录后才能编辑资料。前台景点与游记仍可公开浏览，但新增、修改、删除都需要管理员账号。
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/68">
              第一次使用时，请先到 Supabase Dashboard 的 Auth 里创建你的管理员邮箱账号，然后再回来这里登录。
            </div>
          </div>

          <div className="p-6 md:p-10">
            <Card className="border-white/10 bg-white/5 text-white shadow-none">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl text-white">登录管理后台</CardTitle>
                <CardDescription className="text-white/55">
                  使用 Supabase Auth 的管理员邮箱与密码登录
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={handleLogin}>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white/80">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-white/80">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                      required
                    />
                  </div>

                  {message ? (
                    <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                      {message}
                    </div>
                  ) : null}

                  <Button type="submit" className="h-11 w-full rounded-xl bg-emerald-500 text-white hover:bg-emerald-400" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    登录
                  </Button>
                </form>

                <div className="mt-6 text-xs leading-6 text-white/45">
                  登录成功后会直接回到你刚才要打开的后台页面。
                </div>
                <div className="mt-4">
                  <Link href="/" className="text-sm text-amber-100/80 transition hover:text-amber-50">
                    返回前台首页
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
