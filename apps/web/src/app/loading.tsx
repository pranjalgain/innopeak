export default function LoadingHomePage() {
  return (
    <section
      className="bg-background relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4"
      role="status"
      aria-label="Loading content">
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="bg-primary/10 pointer-events-none absolute top-1/2 left-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
      <div className="relative flex flex-col items-center">
        <div className="bg-card relative flex size-16 items-center justify-center rounded-2xl border shadow-xl">
          <span className="bg-primary size-3 animate-pulse rounded-full shadow-[0_0_20px_var(--color-primary)]" />
          <span className="border-primary/30 absolute inset-2 animate-[spin_3s_linear_infinite] rounded-xl border-t" />
        </div>
        <p className="mt-6 text-sm font-medium">Preparing your workspace</p>
        <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
          <span className="bg-primary/80 size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
          <span className="bg-primary/80 size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
          <span className="bg-primary/80 size-1.5 animate-bounce rounded-full" />
        </div>
        <span className="sr-only">Loading, please wait…</span>
      </div>
    </section>
  );
}
