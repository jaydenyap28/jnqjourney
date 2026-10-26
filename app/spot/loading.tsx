export default function Loading() {
  return (
    <main className="min-h-screen bg-[#020617] text-white" aria-busy="true" aria-label="正在载入景点">
      <section className="relative min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0 animate-pulse bg-[linear-gradient(135deg,#0b1728,#142238_48%,#09111f)]" />
        <div className="absolute left-1/2 top-4 h-16 w-[min(94vw,56rem)] -translate-x-1/2 animate-pulse rounded-[18px] border border-white/10 bg-white/10" />
        <div className="absolute inset-x-3 bottom-5 flex gap-3 overflow-hidden md:inset-x-8 md:bottom-10">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 w-48 shrink-0 animate-pulse rounded-2xl border border-white/10 bg-white/10 md:h-40 md:w-72" />
          ))}
        </div>
      </section>
    </main>
  )
}
