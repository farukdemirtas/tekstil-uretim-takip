"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import AdminPanel from "@/components/AdminPanel";
import LoginForm from "@/components/LoginForm";
import ProductionTable from "@/components/ProductionTable";
import WorkerForm from "@/components/WorkerForm";
import { addWorker, getProduction, login, removeWorker, saveProduction, setAuthToken, updateWorker } from "@/lib/api";
import { ProductionRow, Team } from "@/lib/types";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function teamLabel(team: Team) {
  if (team === "SAG_ON") return "SAĞ ÖN";
  if (team === "SOL_ON") return "SOL ÖN";
  if (team === "YAKA_HAZIRLIK") return "YAKA HAZIRLIK";
  if (team === "ARKA_HAZIRLIK") return "ARKA HAZIRLIK";
  if (team === "BITIM") return "BİTİM";
  return "ADET";
}

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("");
  const [role, setRole] = useState<string>("data_entry");
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isAdmin = role === "admin";

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    const username = window.localStorage.getItem("auth_user");
    const storedRole = window.localStorage.getItem("auth_role");
    if (token && username) {
      setAuthToken(token);
      setCurrentUser(username);
      if (storedRole) setRole(storedRole);
      setIsAuthenticated(true);
    }
  }, []);

  async function loadDateData(date: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await getProduction(date);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      void loadDateData(selectedDate);
    }
  }, [selectedDate, isAuthenticated]);

  async function handleLogin(payload: { username: string; password: string }) {
    const result = await login(payload);
    setAuthToken(result.token);
    window.localStorage.setItem("auth_token", result.token);
    window.localStorage.setItem("auth_user", result.username);
    if ("role" in result && typeof result.role === "string") {
      window.localStorage.setItem("auth_role", result.role);
      setRole(result.role);
    }
    setCurrentUser(result.username);
    setIsAuthenticated(true);
    await loadDateData(selectedDate);
  }

  function handleLogout() {
    setAuthToken("");
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("auth_user");
    window.localStorage.removeItem("auth_role");
    setCurrentUser("");
    setRole("data_entry");
    setIsAuthenticated(false);
    setRows([]);
  }

  function pushToHedefTakip() {
    // Admin panel özetini temsil eden takım toplamlarını alıp hedef-takip sayfasına bırakıyoruz.
    const totals = {
      sagOn: 0,
      solOn: 0,
      yaka: 0,
      arka: 0,
      bitim: 0
    };

    for (const row of rows) {
      const sum = row.t1000 + row.t1300 + row.t1600 + row.t1830;
      if (row.team === "SAG_ON") totals.sagOn += sum;
      else if (row.team === "SOL_ON") totals.solOn += sum;
      else if (row.team === "YAKA_HAZIRLIK") totals.yaka += sum;
      else if (row.team === "ARKA_HAZIRLIK") totals.arka += sum;
      else if (row.team === "BITIM") totals.bitim += sum;
    }

    try {
      window.localStorage.setItem("hedef_takip_stage_totals_v1", JSON.stringify({ ...totals, date: selectedDate }));
    } catch {
      // localStorage erişimi kısıtlıysa sayfa yine çalışır, sadece değerler 0 görünür.
    }

    router.push("/hedef-takip");
  }

  async function handleAddWorker(payload: { name: string; team: Team; process: string }) {
    await addWorker({ ...payload, addedDate: selectedDate });
    await loadDateData(selectedDate);
  }

  async function handleCellChange(workerId: number, field: "t1000" | "t1300" | "t1600" | "t1830", value: number) {
    const nextRows = rows.map((row) => (row.workerId === workerId ? { ...row, [field]: value } : row));
    setRows(nextRows);

    const target = nextRows.find((row) => row.workerId === workerId);
    if (!target) return;

    await saveProduction({
      workerId,
      date: selectedDate,
      t1000: target.t1000,
      t1300: target.t1300,
      t1600: target.t1600,
      t1830: target.t1830
    });
  }

  const dailyTotal = useMemo(
    () => rows.reduce((acc, row) => acc + row.t1000 + row.t1300 + row.t1600 + row.t1830, 0),
    [rows]
  );

  function handleExportExcel() {
    const data = rows.map((row, index) => ({
      No: index + 1,
      "Ad Soyad": row.name,
      Proses: row.process,
      Grup: teamLabel(row.team),
      "10:00": row.t1000,
      "13:00": row.t1300,
      "16:00": row.t1600,
      "18:30": row.t1830,
      Toplam: row.t1000 + row.t1300 + row.t1600 + row.t1830
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Üretim");
    XLSX.writeFile(workbook, `üretim-${selectedDate}.xlsx`);
  }

  async function handleEditWorker(workerId: number, process: string) {
    await updateWorker(workerId, { process });
    await loadDateData(selectedDate);
  }

  async function handleDeleteWorker(workerId: number, workerName: string) {
    const approved = window.confirm(`${workerName} kullanicisini silmek istiyor musunuz?`);
    if (!approved) return;
    await removeWorker(workerId, selectedDate);
    await loadDateData(selectedDate);
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 p-4 md:p-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.jpg"
              alt="Yeşil İmaj Tekstil Logo"
              width={52}
              height={52}
              className="rounded-md border border-slate-200 object-contain"
            />
            <div>
              <h1 className="text-xl font-semibold">Yeşil İmaj Tekstil</h1>
              <p className="mt-1 text-sm text-slate-600">Üretim Takip Programı</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">Kullanıcı: {currentUser}</span>
            <button onClick={handleLogout} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
              Çıkış Yap
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div className="flex items-center gap-3">
          <label htmlFor="date" className="text-sm font-medium">
            Tarih
          </label>
          <input
            id="date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Link href="/analysis" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700">
                Analiz
              </Link>
              <Link href="/users" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700">
                Kullanıcılar
              </Link>
              <Link href="/ayarlar" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700">
                Ayarlar
              </Link>
              <button
                onClick={pushToHedefTakip}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                type="button"
              >
                Hedef Takip
              </button>
            </>
          )}
          <button
            onClick={handleExportExcel}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            Excel Export
          </button>
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
            Günlük Toplam: {dailyTotal}
          </div>
        </div>
      </section>

      <WorkerForm onSubmit={handleAddWorker} />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          Hata: {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          Yükleniyor...
        </div>
      ) : (
        <ProductionTable
          rows={rows}
          onCellChange={(id, field, value) => void handleCellChange(id, field, value)}
          onDeleteWorker={(id, name) => void handleDeleteWorker(id, name)}
          onEditWorker={handleEditWorker}
          canDeleteWorkers={true}
        />
      )}

      <AdminPanel rows={rows} />
    </main>
  );
}
