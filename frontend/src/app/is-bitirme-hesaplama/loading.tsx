export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-3 pb-10 md:gap-5 md:p-6">
      <div className="h-[68px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/85">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}
