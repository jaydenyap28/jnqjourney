'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLocationForm from '@/components/AdminLocationForm'
import { Loader2 } from 'lucide-react'

export default function EditLocationPage({ params }: { params: { id: string } }) {
  const [location, setLocation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error) throw error
        setLocation(data)
      } catch (err: any) {
        console.error('Error fetching location:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      fetchLocation()
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-2xl space-y-6">
        <AdminLocationForm mode="edit" initialData={location} />
      </div>
    </div>
  )
}
