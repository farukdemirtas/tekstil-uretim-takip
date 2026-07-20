import "./loadEnv.js";

const DEFAULT_BASE = "https://izin.yesilimajtekstil.com/api";

let cachedToken = null;
let tokenExpiresAt = 0;

function apiBaseUrl() {
  const raw = String(process.env.IZIN_API_BASE_URL || DEFAULT_BASE).trim();
  return raw.replace(/\/+$/, "");
}

export function isIzinApiConfigured() {
  const enabled = String(process.env.IZIN_API_ENABLED || "").toLowerCase();
  if (enabled === "false" || enabled === "0") return false;
  return Boolean(
    String(process.env.IZIN_API_USERNAME || "").trim() &&
      String(process.env.IZIN_API_PASSWORD || "").length > 0
  );
}

async function login() {
  const username = String(process.env.IZIN_API_USERNAME || "").trim();
  const password = String(process.env.IZIN_API_PASSWORD || "");
  const res = await fetch(`${apiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`İzin API girişi başarısız (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.token) {
    throw new Error("İzin API giriş yanıtında token yok");
  }
  cachedToken = data.token;
  tokenExpiresAt = Date.now() + 7 * 60 * 60 * 1000;
  return cachedToken;
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return login();
}

async function apiRequest(path, options = {}) {
  const url = `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const run = async (token) =>
    fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

  let res = await run(await getToken());
  if (res.status === 401) {
    cachedToken = null;
    res = await run(await login());
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`İzin API hatası (${res.status}): ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

/** @param {string} date YYYY-MM-DD */
export async function fetchAttendanceSession(date) {
  return apiRequest(`/attendance?date=${encodeURIComponent(date)}`);
}
