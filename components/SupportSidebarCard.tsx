import FallbackImage from '@/components/FallbackImage'
import { BUY_ME_A_COFFEE_URL, SUPPORT_TNG_QR_IMAGE_URL } from '@/lib/support-links'
import { Coffee, HeartHandshake, QrCode } from 'lucide-react'

interface SupportSidebarCardProps {
  className?: string
}

export default function SupportSidebarCard({ className = '' }: SupportSidebarCardProps) {
  const hasQrImage = Boolean(String(SUPPORT_TNG_QR_IMAGE_URL || '').trim())

  return (
    <section className={`rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.18)] ${className}`.trim()}>
      <div className="flex items-center gap-2 text-amber-200">
        <HeartHandshake className="h-4 w-4" />
        <p className="text-xs uppercase tracking-[0.24em]">Support My Travel Content</p>
      </div>

      <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
        <div className="mx-auto flex max-w-[240px] flex-col items-center">
          <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[22px] border border-white/10 bg-white p-3">
            {hasQrImage ? (
              <FallbackImage
                src={SUPPORT_TNG_QR_IMAGE_URL}
                alt="Touch 'n Go QR code"
                fill
                sizes="240px"
                className="object-contain p-3"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-[18px] border border-dashed border-slate-300 bg-slate-100 text-slate-500">
                <QrCode className="h-10 w-10" />
                <span className="mt-3 text-xs font-medium uppercase tracking-[0.18em]">Add TNG QR URL</span>
              </div>
            )}
          </div>
          <p className="mt-4 max-w-[220px] text-center text-sm leading-6 text-white/75">
            Support my travel content
            <br />
            via Touch &apos;n Go
          </p>
        </div>
      </div>

      <a
        href={BUY_ME_A_COFFEE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-between gap-4 rounded-[22px] border border-amber-300/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(255,255,255,0.04))] px-4 py-4 transition hover:-translate-y-1 hover:border-amber-300/25 hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.2),rgba(255,255,255,0.06))]"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Buy Me a Coffee</p>
          <p className="mt-2 text-sm leading-6 text-white/85">
            Support my travel content
            <br />
            Buy me a coffee ☕
          </p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-amber-100">
          <Coffee className="h-5 w-5" />
        </div>
      </a>
    </section>
  )
}
