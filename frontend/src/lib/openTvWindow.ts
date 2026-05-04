const TV_WINDOW_NAME = "ye tekstil tv";

/**
 * TV ekranlarını yeni sekmede tam boyut yerine sınırlı bir pencerede açar (masaüstü).
 * İsim sabit tutulduğu için aynı pencere yeniden kullanılır; TV’de tam ekran yine içerideki düğmeden.
 */
export function openTvWindow(path: string): void {
  if (typeof window === "undefined") return;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = `${window.location.origin}${normalized}`;

  const maxW = 1280;
  const maxH = 820;
  const sw = window.screen.availWidth || maxW;
  const sh = window.screen.availHeight || maxH;
  const pad = 56;
  /** Ekranın büyük kısmını kaplamasın: üst sınır + kenar payı */
  const w = Math.max(960, Math.min(maxW, Math.round(sw * 0.88), sw - pad));
  const h = Math.max(620, Math.min(maxH, Math.round(sh * 0.88), sh - pad));
  /** Çoklu monitörde konum için (bazı ortamlarda tanımlıdır) */
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  const left = Math.round((sw - w) / 2 + (scr.availLeft ?? 0));
  const top = Math.round((sh - h) / 2 + (scr.availTop ?? 0));

  const features = [
    "popup=yes",
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "scrollbars=yes",
    "menubar=no",
    "toolbar=no",
    "resizable=yes",
  ].join(",");

  const win = window.open(url, TV_WINDOW_NAME, features);
  win?.focus();
}
