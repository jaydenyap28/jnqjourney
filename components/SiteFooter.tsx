'use client'

function YouTubeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#FF0033" d="M23.5 7.2a3.1 3.1 0 0 0-2.2-2.2C19.4 4.5 12 4.5 12 4.5s-7.4 0-9.3.5A3.1 3.1 0 0 0 .5 7.2 32.4 32.4 0 0 0 0 12a32.4 32.4 0 0 0 .5 4.8 3.1 3.1 0 0 0 2.2 2.2c1.9.5 9.3.5 9.3.5s7.4 0 9.3-.5a3.1 3.1 0 0 0 2.2-2.2A32.4 32.4 0 0 0 24 12a32.4 32.4 0 0 0-.5-4.8Z" />
      <path fill="#fff" d="m9.75 15.56 6.18-3.56-6.18-3.56v7.12Z" />
    </svg>
  )
}

function FacebookLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#1877F2" d="M24 12A12 12 0 1 0 10.13 23.87v-8.4H7.08V12h3.05V9.36c0-3 1.79-4.66 4.53-4.66 1.31 0 2.68.23 2.68.23v2.95h-1.51c-1.49 0-1.96.93-1.96 1.88V12h3.33l-.53 3.47h-2.8v8.4A12 12 0 0 0 24 12Z" />
      <path fill="#fff" d="M16.69 15.47 17.22 12h-3.33V9.76c0-.95.47-1.88 1.96-1.88h1.51V4.93s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.05v8.4c.61.09 1.23.13 1.87.13.64 0 1.26-.04 1.87-.13v-8.4h2.82Z" />
    </svg>
  )
}

function InstagramLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="igFooterGradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#feda75" />
          <stop offset="35%" stopColor="#fa7e1e" />
          <stop offset="65%" stopColor="#d62976" />
          <stop offset="85%" stopColor="#962fbf" />
          <stop offset="100%" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect x="2.2" y="2.2" width="19.6" height="19.6" rx="6" fill="url(#igFooterGradient)" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.8" r="1.3" fill="#fff" />
    </svg>
  )
}

function TikTokLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#111" d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0Z" />
      <path fill="#25F4EE" d="M10.53 9.18v5.61a1.79 1.79 0 1 1-1.27-1.71V10.5a4.44 4.44 0 1 0 3.93 4.42V8.93a5.3 5.3 0 0 0 3.1 1V7.39a2.72 2.72 0 0 1-2.11-2.32h-2.65v8.64a1.78 1.78 0 0 1-.99 1.61c.05-.16.07-.33.07-.5V9.18h-.08Z" />
      <path fill="#FE2C55" d="M10.94 8.72v5.61a1.79 1.79 0 1 1-1.27-1.71v-2.58a4.44 4.44 0 1 0 3.93 4.42V8.47a5.3 5.3 0 0 0 3.1 1V6.93a2.72 2.72 0 0 1-2.11-2.32h-2.65v8.64a1.79 1.79 0 0 1-1 1.61 1.92 1.92 0 0 0 .08-.5V8.72h-.08Z" />
      <path fill="#fff" d="M10.74 8.95v5.61a1.79 1.79 0 1 1-1.27-1.71v-2.58a4.44 4.44 0 1 0 3.93 4.42V8.7a5.3 5.3 0 0 0 3.1 1V7.16a2.72 2.72 0 0 1-2.11-2.32h-2.65v8.64a1.79 1.79 0 0 1-1 1.61c.05-.16.08-.33.08-.5V8.95h-.08Z" />
    </svg>
  )
}

function XHSLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#FF2442" />
      <path fill="#fff" d="M7.18 7.4h2.1l.98 1.48 1.35-1.48h2.12l-2.3 2.44 2.45 3.7h-2.1l-1.26-1.95-1.74 1.95H6.66l2.67-2.9L7.18 7.4Zm7.63.1h1.7v2.2l2.2-.74v1.62l-2.2.74v3.08c0 .32.15.48.45.48h1.75v1.62H16.4c-1.1 0-1.59-.46-1.59-1.5V7.5Z" />
    </svg>
  )
}

const socials = [
  { label: 'YouTube', href: 'https://www.youtube.com/@jnqjourney', icon: <YouTubeLogo className="h-4 w-4" /> },
  { label: 'Facebook', href: 'https://www.facebook.com/jnqjourney', icon: <FacebookLogo className="h-4 w-4" /> },
  { label: 'Instagram', href: 'https://www.instagram.com/jnqjourney', icon: <InstagramLogo className="h-4 w-4" /> },
  { label: 'TikTok', href: 'https://www.tiktok.com/@jnqjourney', icon: <TikTokLogo className="h-4 w-4" /> },
  { label: '\u5c0f\u7ea2\u4e66', href: 'https://www.xiaohongshu.com/user/profile/60ab1c5d000000000101def8', icon: <XHSLogo className="h-4 w-4" /> },
]

export default function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#04070d]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_28%,rgba(255,255,255,0.015)_72%,transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <h2 className="font-editorial-title text-4xl leading-none text-white md:text-5xl">Jayden &amp; Qing</h2>
            <p className="font-cjk-display text-[1.35rem] tracking-[0.08em] text-white/90 md:text-[1.65rem]">{'\u4e00\u8d77\u770b\u4e16\u754c'}</p>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm italic leading-7 text-white/58 md:text-base">{'\u628a\u53bb\u8fc7\u7684\u5730\u65b9\u6162\u6162\u5199\u6210\u4e0b\u4e00\u6b21\u51fa\u53d1\u7684\u7406\u7531'}</p>
        </div>

        <div className="mx-auto mt-7 flex max-w-xl flex-wrap items-center justify-center gap-2.5">
          {socials.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.label}
              title={social.label}
              className="group inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08]"
            >
              <span className="rounded-full bg-white/95 p-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.16)] transition group-hover:scale-105">
                {social.icon}
              </span>
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
