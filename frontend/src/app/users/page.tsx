"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { addUser, deleteUser, getUsers, resetUserPassword, setAuthToken } from "@/lib/api";
import { User } from "@/lib/types";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [resetValue, setResetValue] = useState<Record<number, string>>({});

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const result = await getUsers();
      setUsers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kullanıcılar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    const role = window.localStorage.getItem("auth_role");
    if (!token) {
      window.location.href = "/";
      return;
    }
    if (role !== "admin") {
      window.location.href = "/";
      return;
    }
    setAuthToken(token);
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newUsername.trim()) {
      setError("Kullanıcı adı zorunlu");
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setError("Şifre en az 4 karakter olmalı");
      return;
    }

    try {
      await addUser({ username: newUsername.trim(), password: newPassword });
      setNewUsername("");
      setNewPassword("");
      setResetValue({});
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kullanıcı eklenemedi");
    }
  }

  async function handleDeleteUser(userId: number) {
    const target = users.find((u) => u.id === userId);
    const name = target?.username ?? "";
    const ok = window.confirm(`${name} kullanıcısını silmek istiyor musunuz?`);
    if (!ok) return;

    try {
      await deleteUser(userId);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kullanıcı silinemedi");
    }
  }

  async function handleResetPassword(userId: number) {
    const password = resetValue[userId] ?? "";
    if (password.length < 4) {
      setError("Şifre en az 4 karakter olmalı");
      return;
    }

    try {
      await resetUserPassword(userId, password);
      setResetValue((prev) => ({ ...prev, [userId]: "" }));
      setError(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre sıfırlanamadı");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 p-4 md:p-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Kullanıcılar</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Kullanıcı ekleme, silme ve parola sıfırlama.</p>
          </div>
          <Link href="/" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700">
            Üretim Ekranı
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-base font-semibold">Yeni Kullanıcı Ekle</h2>
        <form onSubmit={handleAddUser} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Kullanıcı adı</label>
            <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Şifre</label>
            <input value={newPassword} type="password" onChange={(e) => setNewPassword(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
              Kullanıcı Ekle
            </button>
          </div>
        </form>
      </section>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">{error}</div>}

      <section className="overflow-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-base font-semibold">Kullanıcı Listesi</h2>
        {loading ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">Yükleniyor...</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">Kullanıcı bulunamadı.</div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-2 py-2 text-left">ID</th>
                <th className="px-2 py-2 text-left">Kullanıcı adı</th>
                <th className="px-2 py-2 text-left">Oluşturulma</th>
                <th className="px-2 py-2 text-left">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isAdmin = u.username === "admin";
                return (
                  <tr key={u.id} className="border-b border-slate-200 dark:border-slate-700">
                    <td className="px-2 py-2">{u.id}</td>
                    <td className="px-2 py-2">{u.username}</td>
                    <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{u.created_at ?? "-"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                          disabled={isAdmin}
                          onClick={() => void handleDeleteUser(u.id)}
                          type="button"
                        >
                          Sil
                        </button>
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={resetValue[u.id] ?? ""}
                            onChange={(e) => setResetValue((prev) => ({ ...prev, [u.id]: e.target.value }))}
                            placeholder="Yeni şifre"
                            className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                          />
                          <button
                            className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                            onClick={() => void handleResetPassword(u.id)}
                            type="button"
                          >
                            Sıfırla
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

