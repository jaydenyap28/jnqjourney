import AdminAuthShell from '@/components/AdminAuthShell'

export const metadata = {
  title: 'JnQ Journey Admin',
  description: '\u004a\u006e\u0051\u0020\u004a\u006f\u0075\u0072\u006e\u0065\u0079\u0020\u7ba1\u7406\u540e\u53f0',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Do not mount the login/auth shell against inherited Supabase credentials.
  if (process.env.VERCEL_ENV === 'preview') return <main><h1>Preview is read-only.</h1><p>Admin login and editing are disabled.</p></main>
  return <AdminAuthShell>{children}</AdminAuthShell>
}
