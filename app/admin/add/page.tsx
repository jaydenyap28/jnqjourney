'use client'

import AdminLocationForm from '@/components/AdminLocationForm'

export default function AddLocationPage() {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-2xl space-y-6">
        <AdminLocationForm mode="add" />
      </div>
    </div>
  )
}
