export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-3 pb-10 md:gap-5 md:p-6">
      <div className="h-[68px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}
