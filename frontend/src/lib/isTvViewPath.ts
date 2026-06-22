/** TV / tam ekran görünümlerinde üst chrome (tema, dil vb.) gizlenir. */
export function isTvViewPath(pathname: string): boolean {
  return (
    pathname.startsWith("/ekran1") ||
    pathname.startsWith("/ekran2") ||
    pathname.startsWith("/ekran3") ||
    pathname.startsWith("/ekran4") ||
    pathname.startsWith("/ekran5") ||
    pathname.startsWith("/ekranlar") ||
    pathname.startsWith("/proses-kontrol") ||
    pathname.startsWith("/hata-rapor")
  );
}
