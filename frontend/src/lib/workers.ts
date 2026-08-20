import type { Worker } from "./types";

/**
 * Aynı isimde birden fazla worker kaydı olabilir (örn. tekrar eklenmiş, farklı tarihte
 * listeden düşmüş vb.). "Personel Ekle" gibi kolaylık listelerinde aynı isim 2-3 kez
 * görünmesin diye isme göre tekilleştirir. Aktif (deleted_at yok) kayıt varsa o tercih edilir.
 */
export function dedupeWorkersByName(workers: Worker[]): Worker[] {
  const byName = new Map<string, Worker>();
  for (const w of workers) {
    const key = w.name.trim().toLocaleUpperCase("tr");
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || (existing.deleted_at && !w.deleted_at)) {
      byName.set(key, w);
    }
  }
  return Array.from(byName.values());
}
