export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-3 pb-10 md:gap-5 md:p-6">
      <div className="h-[68px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      <div className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-900/85">
        <div className="h-11 animate-pulse border-b border-slate-100 bg-slate-50 dark:border-slate-700/50 dark:bg-slate-800/50" />
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-700/50"
          >
            <div className="h-5 w-36 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-5 w-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-5 w-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="ml-auto h-5 w-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
