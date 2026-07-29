const CHANNEL_NAME = "ekran-refresh";
const EVENT_NAME = "ekran-refresh";

/** Ütü–paket / Ekran5 ayarı değişince aynı sekme ve diğer sekmelerde anlık yenileme */
export function notifyEkranRefresh(reason?: string) {
  if (typeof window === "undefined") return;
  const detail = { reason, ts: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage(detail);
    bc.close();
  } catch {
    /* BroadcastChannel desteklenmiyorsa yalnızca custom event */
  }
}

export function subscribeEkranRefresh(onRefresh: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => onRefresh();
  window.addEventListener(EVENT_NAME, handler);

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = handler;
  } catch {
    bc = null;
  }

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    bc?.close();
  };
}
