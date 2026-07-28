"use client";

import { useEffect } from "react";
import { postScreenHeartbeat, setAuthToken } from "@/lib/api";

export type ScreenPresenceId =
  | "ekran1"
  | "ekran1b"
  | "ekran2"
  | "ekran3"
  | "ekran4"
  | "ekran5";

const HEARTBEAT_MS = 20_000;
const INSTANCE_PREFIX = "screen_instance_";

function getOrCreateInstanceId(screenId: ScreenPresenceId): string {
  const key = `${INSTANCE_PREFIX}${screenId}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function sendOffline(screenId: ScreenPresenceId, instanceId: string) {
  void postScreenHeartbeat(screenId, instanceId, { offline: true, keepalive: true });
}

/** TV içerik sayfalarında periyodik canlılık sinyali gönderir. */
export function useScreenHeartbeat(screenId: ScreenPresenceId) {
  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    setAuthToken(token);

    const instanceId = getOrCreateInstanceId(screenId);
    let stopped = false;

    const ping = () => {
      if (stopped || document.hidden) return;
      void postScreenHeartbeat(screenId, instanceId).catch(() => {});
    };

    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);

    const onVisibility = () => {
      if (!document.hidden) ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onUnload = () => {
      sendOffline(screenId, instanceId);
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      sendOffline(screenId, instanceId);
    };
  }, [screenId]);
}
