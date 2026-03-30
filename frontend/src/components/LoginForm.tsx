"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

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
    <div className="mx-auto mt-20 w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-3">
        <Image
          src="/logo.jpg"
          alt="Yeşil İmaj Tekstil Logo"
          width={44}
          height={44}
          className="rounded-md border border-slate-200 object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold">Yeşil İmaj Tekstil</h1>
          <p className="text-xs text-slate-600">Üretim Takip Programı</p>
        </div>
      </div>
      <h2 className="mb-1 text-lg font-semibold">Kullanıcı Girişi</h2>
      <p className="mb-4 text-sm text-slate-600">Üretim takip ekranına erişmek için giriş yapın.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Kullanıcı adı"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Şifre"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
        {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">{error}</div>}
        <button className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60" disabled={loading}>
          {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
        </button>
      </form>
    </div>
  );
}
