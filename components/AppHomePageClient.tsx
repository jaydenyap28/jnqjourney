'use client'
import { useRouter } from 'next/navigation'
import HomePageClient from './HomePageClient'
import type { ComponentProps } from 'react'

export default function AppHomePageClient(props:ComponentProps<typeof HomePageClient>) {
  const router=useRouter()
  return <HomePageClient {...props} navigate={router.push}/>
}
