/**
 * SWR tabanlı veri cache hook'ları.
 *
 * Sayfa geçişlerinde aynı verilerin tekrar tekrar API'den çekilmesini önler.
 * stale-while-revalidate stratejisi: önceki veriyi anında göster, arka planda güncelle.
 *
 * Cache süresi:
 *   - Teams / Processes: 5 dakika (nadiren değişir)
 *   - DayProductMeta: 60 saniye (gün içinde değişebilir)
 *   - ProductModels: 5 dakika
 */
import useSWR from "swr";
import {
  getTeams,
  getProcesses,
  getDayProductMeta,
  listProductModels,
  type TeamRow,
  type ProcessRow,
  type DayProductMeta,
  type ProductModelListItem,
} from "@/lib/api";

const FIVE_MIN = 5 * 60 * 1000;
const ONE_MIN = 60 * 1000;

// ── Teams ────────────────────────────────────────────────────────────────────

export function useTeams() {
  const { data, error, isLoading, mutate } = useSWR<TeamRow[]>(
    "teams",
    () => getTeams(),
    { dedupingInterval: FIVE_MIN, revalidateOnFocus: false }
  );
  return { teams: data ?? [], error, isLoading, mutate };
}

// ── Processes ────────────────────────────────────────────────────────────────

export function useProcesses() {
  const { data, error, isLoading, mutate } = useSWR<ProcessRow[]>(
    "processes",
    () => getProcesses(),
    { dedupingInterval: FIVE_MIN, revalidateOnFocus: false }
  );
  return { processes: data ?? [], error, isLoading, mutate };
}

// ── Day Product Meta ─────────────────────────────────────────────────────────

export function useDayProductMeta(date: string | null) {
  const { data, error, isLoading, mutate } = useSWR<DayProductMeta>(
    date ? ["dayProductMeta", date] : null,
    () => getDayProductMeta(date!),
    { dedupingInterval: ONE_MIN, revalidateOnFocus: false }
  );
  return { meta: data ?? null, error, isLoading, mutate };
}

// ── Product Models ───────────────────────────────────────────────────────────

export function useProductModels() {
  const { data, error, isLoading, mutate } = useSWR<ProductModelListItem[]>(
    "productModels",
    () => listProductModels(),
    { dedupingInterval: FIVE_MIN, revalidateOnFocus: false }
  );
  return { models: data ?? [], error, isLoading, mutate };
}
