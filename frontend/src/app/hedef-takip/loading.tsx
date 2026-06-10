export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-3 pb-10 md:gap-5 md:p-6">
      <div className="h-[68px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      {/* Stats chips */}
      <div className="flex flex-wrap gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 w-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      {/* Stage cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-900/85">
            <div className="h-10 animate-pulse border-b border-slate-100 bg-slate-50 dark:border-slate-700/50 dark:bg-slate-800/50" />
            <div className="flex flex-col gap-2 p-4">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-4 w-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                  <div className="ml-auto h-7 w-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
