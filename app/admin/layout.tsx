import AdminAuthShell from '@/components/AdminAuthShell'

export const metadata = {
  title: 'JnQ Journey Admin',
  description: 'JnQ Journey 管理后台',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminAuthShell>{children}</AdminAuthShell>
}
