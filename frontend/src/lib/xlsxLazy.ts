/**
 * xlsx kütüphanesini yalnızca gerçekten ihtiyaç duyulduğunda (export butonuna
 * tıklanınca) yükler. Bu sayede sayfa ilk açılışında ~500 KB'lık xlsx bundle'ı
 * indirilmez ve route geçişleri hızlanır.
 *
 * Kullanım:
 *   const XLSX = await loadXlsx();
 *   const wb = XLSX.utils.book_new();
 */
export async function loadXlsx() {
  return import("xlsx");
}

export type XlsxModule = Awaited<ReturnType<typeof loadXlsx>>;
