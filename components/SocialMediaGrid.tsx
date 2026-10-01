'use client'

import { ArrowUpRight, BookOpenText, Camera, Music2, Play, Users } from 'lucide-react'

import TrackedLink from '@/components/TrackedLink'
import { SOCIAL_LINKS } from '@/lib/brand'

const SOCIAL_META = {
  YouTube: {
    handle: '@jnqjourney',
    description: '完整旅行影片、路线记录与长视频',
    icon: Play,
    accent: 'from-rose-400/18 via-rose-300/5 to-transparent',
  },
  Facebook: {
    handle: 'JnQ Journey',
    description: '旅行更新、照片分享与最新内容',
    icon: Users,
    accent: 'from-sky-400/18 via-sky-300/5 to-transparent',
  },
  Instagram: {
    handle: '@jnqjourney',
    description: '旅途画面、Reels 与旅行灵感',
    icon: Camera,
    accent: 'from-fuchsia-400/18 via-orange-300/5 to-transparent',
  },
  TikTok: {
    handle: '@jnqjourney',
    description: '短视频、景点灵感与旅途片段',
    icon: Music2,
    accent: 'from-cyan-300/16 via-pink-300/5 to-transparent',
  },
  小红书: {
    handle: 'Jayden & Qing',
    description: '实用攻略、打卡机位与旅行笔记',
    icon: BookOpenText,
    accent: 'from-red-400/18 via-amber-300/5 to-transparent',
  },
} as const

export default function SocialMediaGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid gap-3 ${compact ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
      {SOCIAL_LINKS.map((social) => {
        const meta = SOCIAL_META[social.label as keyof typeof SOCIAL_META]
        const Icon = meta?.icon || ArrowUpRight
        return (
          <TrackedLink
            key={social.label}
            href={social.href}
            external
            eventName="social_link_click"
            linkLabel={social.label}
            ariaLabel={`前往 JnQ Journey ${social.label}`}
            className="group relative min-h-[158px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b1018] p-5 transition duration-300 hover:-translate-y-1 hover:border-amber-200/25 hover:bg-[#0e1520]"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${meta?.accent || 'from-white/10 to-transparent'} opacity-70 transition group-hover:opacity-100`} />
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/20 text-white/82">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-white/28 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-amber-100" aria-hidden="true" />
              </div>
              <div className="mt-5">
                <p className="font-semibold text-white">{social.label}</p>
                <p className="mt-1 text-xs text-amber-100/65">{meta?.handle}</p>
                <p className="mt-3 text-xs leading-5 text-white/46">{meta?.description}</p>
              </div>
            </div>
          </TrackedLink>
        )
      })}
    </div>
  )
}
