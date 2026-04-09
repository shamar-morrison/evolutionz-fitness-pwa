export default function OfflinePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a] px-6 py-10 text-white">
      <div className="absolute -right-[320px] -top-[320px] h-[640px] w-[640px] rounded-full bg-amber-400/10 blur-[140px]" />
      <div className="absolute -bottom-[320px] -left-[320px] h-[640px] w-[640px] rounded-full bg-amber-400/10 blur-[140px]" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="mb-4 inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">
          Evolutionz Fitness
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">You are offline</h1>
        <p className="mt-4 text-sm leading-6 text-white/65">
          You are offline. Please check your connection and try again.
        </p>
      </div>
    </main>
  )
}
