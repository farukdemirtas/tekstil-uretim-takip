"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { addUser, deleteUser, getUsers, resetUserPassword, setAuthToken, updateUserPermissions } from "@/lib/api";
import { PERMISSION_ROWS } from "@/lib/permissions";
import type { AppPermissions, User } from "@/lib/types";

function emptyDraft(): AppPermissions {
  return {
    analysis: false,
    karsilastirma: false,
    ayarlar: false,
    hedefTakip: false,
    ekran1: false,
    ekran2: false,
    ekran3: false,
  };
}

export default function UsersSettingsSection() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetValue, setResetValue] = useState<Record<number, string>>({});
  const [permDraft, setPermDraft] = useState<Record<number, AppPermissions>>({});
  const [permSaving, setPermSaving] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getUsers();
      setUsers(result);
      const draft: Record<number, AppPermissions> = {};
      for (const u of result) {
        if (u.role === "data_entry" && u.permissions) {
          draft[u.id] = { ...u.permissions };
        }
      }
      setPermDraft(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kullanıcılar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    const role = window.localStorage.getItem("auth_role");
    if (!token || role !== "admin") return;
    setAuthToken(token);
    void loadUsers();
  }, [loadUsers]);

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
    if (!window.confirm(`${name} kullanıcısını silmek istiyor musunuz?`)) return;
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

  function setPermKey(userId: number, key: keyof AppPermissions, value: boolean) {
    setPermDraft((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? emptyDraft()), [key]: value },
    }));
  }

  async function handleSavePermissions(userId: number) {
    const payload = permDraft[userId];
    if (!payload) return;
    setPermSaving(userId);
    setError(null);
    try {
      await updateUserPermissions(userId, payload);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yetkiler kaydedilemedi");
    } finally {
      setPermSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-2 text-base font-semibold">Yetkilendirme</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong>Yönetici</strong> hesapları tüm menülere ve API’lere erişir. <strong>Veri girişi</strong> kullanıcılarında aşağıdaki
          kutularla ekran bazında izin verin. Değişikliklerin etkisi, ilgili kullanıcının <strong>bir sonraki girişinde</strong>{" "}
          (yeni oturum / token) tam olarak uygulanır.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-base font-semibold">Yeni kullanıcı ekle</h2>
        <form onSubmit={handleAddUser} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Kullanıcı adı</label>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Şifre</label>
            <input
              value={newPassword}
              type="password"
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700" type="submit">
              Kullanıcı ekle
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Yeni kullanıcılar “veri girişi” rolüyle oluşur; varsayılan yetkiler sunucuda tanımlıdır.
        </p>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      )}

      <section className="overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-base font-semibold">Kullanıcı listesi</h2>
        {loading ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">Yükleniyor...</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">Kullanıcı bulunamadı.</div>
        ) : (
          <div className="space-y-6">
            {users.map((u) => {
              const isBootstrapAdmin = u.username === "admin";
              const isRoleAdmin = u.role === "admin";
              const draft = permDraft[u.id] ?? emptyDraft();
              return (
                <div
                  key={u.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-900/40"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500">#{u.id}</span>
                        <span className="font-semibold">{u.username}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            isRoleAdmin
                              ? "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
                              : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                          }`}
                        >
                          {isRoleAdmin ? "Yönetici" : "Veri girişi"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Oluşturulma: {u.created_at ?? "—"}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                        disabled={isBootstrapAdmin}
                        onClick={() => void handleDeleteUser(u.id)}
                        type="button"
                      >
                        Sil
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="password"
                          value={resetValue[u.id] ?? ""}
                          onChange={(e) => setResetValue((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          placeholder="Yeni şifre"
                          className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
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
                  </div>
                  {isRoleAdmin ? (
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                      Yöneticiler tüm yetkilere sahiptir; ayrıca kısıtlama uygulanmaz.
                    </p>
                  ) : (
                    <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-600">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Ekran yetkileri
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {PERMISSION_ROWS.map(({ key, label, description }) => (
                          <label
                            key={key}
                            className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={draft[key]}
                              onChange={(e) => setPermKey(u.id, key, e.target.checked)}
                            />
                            <span>
                              <span className="font-medium">{label}</span>
                              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={permSaving === u.id}
                        onClick={() => void handleSavePermissions(u.id)}
                        className="mt-3 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
                      >
                        {permSaving === u.id ? "Kaydediliyor…" : "Yetkileri kaydet"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
