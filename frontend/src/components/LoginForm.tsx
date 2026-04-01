"use client";

import { FormEvent, useState } from "react";

type LoginFormProps = {
  onLogin: (payload: { username: string; password: string }) => Promise<void>;
};

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin({ username, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Arka plan */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(20,184,166,0.35),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-emerald-600/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(15,23,42,0.4)_100%)]"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[420px]">
          {/* Kart */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-px shadow-2xl shadow-teal-950/50 backdrop-blur-xl dark:border-white/10">
            <div className="rounded-[calc(1.5rem-1px)] bg-white/95 px-8 py-10 dark:bg-slate-900/95 sm:px-10 sm:py-12">
              <div className="mb-8 flex flex-col items-center text-center">
                <div className="mb-5 overflow-hidden rounded-2xl shadow-xl ring-1 ring-slate-200/80 ring-offset-4 ring-offset-white dark:ring-slate-600/60 dark:ring-offset-slate-900">
                  <img
                    src="/logo.png"
                    alt="Yeşil İmaj Tekstil"
                    width={144}
                    height={144}
                    className="h-28 w-28 object-contain sm:h-36 sm:w-36"
                    fetchPriority="high"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (el.dataset.fallback === "1") return;
                      el.dataset.fallback = "1";
                      el.src = "/logo.svg";
                    }}
                  />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                  Yeşil İmaj Tekstil
                </h1>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                  Üretim takip sistemi
                </p>
              </div>

              <div className="mb-6">
                <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                  Giriş
                </h2>
                <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-500">
                  Devam etmek için hesabınızla oturum açın
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="login-username" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Kullanıcı adı
                  </label>
                  <input
                    id="login-username"
                    name="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Kullanıcı adınızı girin"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400 dark:focus:bg-slate-800 dark:focus:ring-teal-400/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="login-password" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Şifre
                  </label>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400 dark:focus:bg-slate-800 dark:focus:ring-teal-400/20"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 transition hover:from-teal-500 hover:to-emerald-500 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-900"
                >
                  <span className="relative z-10">{loading ? "Giriş yapılıyor…" : "Giriş yap"}</span>
                  <span
                    className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 opacity-0 transition group-hover:opacity-100"
                    aria-hidden
                  />
                </button>
              </form>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-500">
            © {new Date().getFullYear()} Yeşil İmaj Tekstil
          </p>
        </div>
      </div>
    </div>
  );
}
