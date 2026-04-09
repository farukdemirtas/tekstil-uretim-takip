/** Log kaydı: anlık UTC (SQLite datetime('now') ile aynı anlam, açıkça yazılır). */
export function utcNowSqlite() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Takvim günü (YYYY-MM-DD) Türkiye saati; aralığın UTC karşılığı (log filtreleri).
 * Türkiye yıl boyu +03:00 (yaz saati yok).
 */
export function turkeyCalendarDayStartUtcSql(isoDate) {
  const d = new Date(`${isoDate}T00:00:00+03:00`);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function turkeyCalendarDayEndUtcSql(isoDate) {
  const d = new Date(`${isoDate}T23:59:59+03:00`);
  return d.toISOString().replace("T", " ").slice(0, 19);
}
