/**
 * Takipsan Plus oturum yönetimi ve sevkiyat verisi çekme.
 * TS820 okuma sayısı consignment detay sayfası veya packageZara API üzerinden alınır.
 */

const DEFAULT_BASE = "https://takipsan.takipsanplus.com";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function decodeLaravelXsrf(cookieValue) {
  if (!cookieValue) return "";
  try {
    return decodeURIComponent(cookieValue);
  } catch {
    return cookieValue;
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(response) {
    let list = [];
    if (typeof response.headers.getSetCookie === "function") {
      list = response.headers.getSetCookie();
    }
    if (!list.length) {
      const raw = response.headers.get("set-cookie");
      if (raw) {
        list = raw.includes(", ") && /,\s*[A-Za-z_][A-Za-z0-9_-]*=/.test(raw)
          ? raw.split(/,(?=\s*[A-Za-z_][A-Za-z0-9_-]*=)/)
          : [raw];
      }
    }
    for (const raw of list) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }

  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get(name) {
    return this.cookies.get(name);
  }
}

function extractHiddenToken(html) {
  if (!html || typeof html !== "string") return "";
  const patterns = [
    /<input[^>]*name=["']_token["'][^>]*value=["']([^"']+)["']/i,
    /<input[^>]*value=["']([^"']+)["'][^>]*name=["']_token["']/i,
    /name="_token"\s+value="([^"]+)"/i,
    /name='_token'\s+value='([^']+)'/i,
    /<meta\s+name="csrf-token"\s+content="([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function loginPageHint(html) {
  const title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() || "";
  const snippet = stripHtml(html).slice(0, 120);
  return title || snippet || `(boş sayfa, ${html?.length || 0} byte)`;
}

function stripHtml(text) {
  return String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuantityText(text) {
  const raw = stripHtml(text);
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function parseWidgetByLabel(html, label) {
  if (!html || !label) return null;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // İçteki ikon <span> yüzünden ilk </span> ile kesilmemesi için blok sonuna kadar al
  const re = new RegExp(
    `kt-widget__subtitle[^>]*>\\s*${escaped}\\s*</span>\\s*<span class="kt-widget__value"[^>]*>([\\s\\S]*?)</span>\\s*</div>`,
    "i"
  );
  const m = html.match(re);
  return m ? parseQuantityText(m[1]) : null;
}

function parseWidgetTextByLabel(html, label) {
  if (!html || !label) return "";
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `kt-widget__subtitle[^>]*>\\s*${escaped}\\s*</span>\\s*<span class="kt-widget__value"[^>]*>([\\s\\S]*?)</span>\\s*</div>`,
    "i"
  );
  const m = html.match(re);
  return m ? stripHtml(m[1]).trim() : "";
}

const CONSIGNMENT_EXCLUDED_WIDGET_LABELS = new Set([
  "Sipariş Kodu",
  "Sipariş Sayısı",
  "Paket Sayısı",
  "Okunan Sayısı",
  "Okunan",
  "Toplam",
  "Durum",
]);

/** Sevkiyat özetindeki tüm kt-widget alanları */
export function parseAllConsignmentWidgets(html) {
  const fields = {};
  if (!html || typeof html !== "string") return fields;
  const re =
    /kt-widget__subtitle[^>]*>\s*([^<]+)\s*<\/span>\s*<span class="kt-widget__value"[^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const label = stripHtml(m[1]).trim();
    const value = stripHtml(m[2]).trim();
    if (label && value) fields[label] = value;
  }
  return fields;
}

function looksLikeOrderCode(value) {
  const v = String(value || "").trim();
  return /^[A-Z]{2,}[-_][A-Z0-9]+$/i.test(v) && v.length <= 20;
}

function looksLikeProductRef(value, orderCode) {
  const v = String(value || "").trim();
  if (!v || v === orderCode) return false;
  if (looksLikeOrderCode(v)) return false;
  const digitsOnly = v.replace(/[^\d]/g, "");
  if (digitsOnly && digitsOnly.length >= v.replace(/[\s.,]/g, "").length * 0.8) return false;
  if (v.includes("/")) return true;
  if (v.length >= 12 && /\d/.test(v) && v.includes("-")) return true;
  return false;
}

function parseConsignmentSubheaderProductRef(html) {
  if (!html || typeof html !== "string") return "";
  const patterns = [
    /id=["']kt_subheader_total["'][^>]*>([\s\S]*?)<\/span>/i,
    /class=["'][^"']*kt-subheader__desc[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const v = stripHtml(m[1]).trim();
    if (!v) continue;
    if (v.includes("/") || (v.length >= 10 && /\d/.test(v) && v.includes("-"))) return v;
  }
  return "";
}

/**
 * Stok / ürün referansı (ör. 68131-01-KIND-SKYBLUE403-1/Bershka) — Sipariş Kodu değil.
 */
export function parseConsignmentProductRefFromHtml(html, orderCode = "") {
  const subheaderRef = parseConsignmentSubheaderProductRef(html);
  if (subheaderRef) return subheaderRef;

  const fields = parseAllConsignmentWidgets(html);
  const oc = String(orderCode || fields["Sipariş Kodu"] || "").trim();

  const refLabels = [
    "Stok Kodu",
    "Ürün Kodu",
    "Model Kodu",
    "Referans Kodu",
    "Müşteri Referansı",
    "Ürün Referansı",
    "Özel Kod",
    "Belge Kodu",
    "Alıcı Stok Kodu",
    "Buyer Product Code",
    "SKU",
  ];
  for (const label of refLabels) {
    const v = fields[label];
    if (v && v !== oc && !looksLikeOrderCode(v)) return v;
  }

  for (const [label, value] of Object.entries(fields)) {
    if (CONSIGNMENT_EXCLUDED_WIDGET_LABELS.has(label)) continue;
    if (looksLikeProductRef(value, oc)) return value;
  }

  return "";
}

/** Ürün adı ve model kodu ayrı widget’lardan (gösterim için) */
export function parseConsignmentProductFieldsFromHtml(html, orderCode = "") {
  const fields = parseAllConsignmentWidgets(html);
  const oc = String(orderCode || fields["Sipariş Kodu"] || "").trim();
  const productRef = parseConsignmentProductRefFromHtml(html, oc);

  const nameLabels = ["Ürün Adı", "Ürün", "Stok Adı", "Model Adı", "Ürün İsmi"];
  let productName = "";
  for (const label of nameLabels) {
    const v = fields[label];
    if (v && v !== oc && v !== productRef && !looksLikeOrderCode(v)) {
      productName = v;
      break;
    }
  }

  const modelLabels = ["Model", "Model Kodu", "Model No"];
  let modelCode = "";
  for (const label of modelLabels) {
    const v = fields[label];
    if (v && v !== oc && v !== productRef && v !== productName && !looksLikeOrderCode(v)) {
      modelCode = v;
      break;
    }
  }

  if (!productName && productRef.includes("/")) {
    const slash = productRef.split("/");
    productName = fields["Sevk Edilecek Firma"] || slash[slash.length - 1].trim();
    modelCode = modelCode || slash.slice(0, -1).join("/").trim();
  }

  if (!productName && fields["Sevk Edilecek Firma"]) {
    productName = fields["Sevk Edilecek Firma"];
  }

  if (!modelCode) modelCode = productRef;

  return { productRef, productName, modelCode, orderCode: oc };
}

/** Geriye dönük: ürün referansı (stok kodu); sipariş kodu kullanılmaz */
export function parseConsignmentProductLabelFromHtml(html) {
  const summary = parseConsignmentSummaryFromHtml(html);
  const { productRef } = parseConsignmentProductFieldsFromHtml(html, summary.orderCode);
  return productRef;
}

export function parseConsignmentSummaryFromHtml(html) {
  const orderCodeMatch = html.match(
    /kt-widget__subtitle[^>]*>\s*Sipariş Kodu\s*<\/span>\s*<span class="kt-widget__value"[^>]*>([\s\S]*?)<\/span>\s*<\/div>/i
  );
  const orderCodeRaw = orderCodeMatch ? stripHtml(orderCodeMatch[1]) : "";
  const orderCode =
    orderCodeRaw.match(/[A-Z]{2,}[-_][A-Z0-9]+/i)?.[0] ||
    orderCodeRaw.match(/[A-Z0-9-]{4,}/i)?.[0] ||
    orderCodeRaw;
  return {
    orderCode,
    orderQuantity: parseWidgetByLabel(html, "Sipariş Sayısı"),
    packageCount: parseWidgetByLabel(html, "Paket Sayısı"),
    readCount: parseWidgetByLabel(html, "Okunan Sayısı"),
  };
}

function parseReadCountFromHtml(html) {
  const summary = parseConsignmentSummaryFromHtml(html);
  if (summary.readCount != null) return summary.readCount;

  const patterns = [
    /Okunan[^0-9]{0,40}(\d+)/i,
    /"read_count"\s*:\s*(\d+)/i,
    /id=["']items_count["'][^>]*>[\s\S]*?(\d[\d.,]*)/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const n = parseQuantityText(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

function normalizePackageRow(row) {
  if (!row) return null;
  let raw;
  if (Array.isArray(row)) {
    raw = {
      package_no: row[1] ?? row[0],
      items: row[2],
      status: row[3],
      size: row[4],
      created_at: row[6],
    };
  } else if (typeof row === "object") {
    raw = {
      package_no: row.package_no ?? row.packageNo,
      items: row.items ?? row.item_count ?? row.itemCount,
      status: row.status,
      size: row.size ?? row.beden,
      created_at: row.created_at ?? row.createdAt,
    };
  } else {
    return null;
  }
  return {
    packageNo: String(raw.package_no ?? "").trim(),
    items: parseIntSafe(raw.items),
    status: stripHtml(raw.status),
    size: String(raw.size ?? "").trim().toUpperCase(),
    createdAt: String(raw.created_at ?? "").trim(),
  };
}

function parseIntSafe(v) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export class TakipsanClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.TAKIPSAN_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
    this.username = options.username || process.env.TAKIPSAN_USERNAME || "";
    this.password = options.password || process.env.TAKIPSAN_PASSWORD || "";
    this.jar = new CookieJar();
    this.loggedIn = false;
    this.lastLoginAt = null;
  }

  get csrfToken() {
    const xsrf = this.jar.get("XSRF-TOKEN");
    if (xsrf) return decodeLaravelXsrf(xsrf);
    return this._pageToken || "";
  }

  async request(path, { method = "GET", body, headers = {}, redirect = "follow", ajax = true } = {}) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const h = {
      "accept-language": "tr-TR,tr;q=0.9",
      "user-agent": BROWSER_UA,
      ...headers,
    };
    if (ajax) {
      h.accept = h.accept || "application/json, text/javascript, */*; q=0.01";
      h["x-requested-with"] = "XMLHttpRequest";
      const token = this.csrfToken;
      if (token) h["x-csrf-token"] = token;
    } else if (!h.accept) {
      h.accept = "text/html,application/xhtml+xml";
    }
    const cookie = this.jar.header();
    if (cookie) h.cookie = cookie;

    const res = await fetch(url, {
      method,
      headers: h,
      body,
      redirect,
    });
    this.jar.absorb(res);
    return res;
  }

  isLoginHtml(html) {
    return (
      typeof html === "string" &&
      html.includes('name="username"') &&
      html.includes("Kullanıcı Adı")
    );
  }

  async ensureSession() {
    // 12 dakikada bir yenile — Takipsan sunucu-taraflı timeout genellikle 15-20 dk
    if (this.loggedIn && this.lastLoginAt && Date.now() - this.lastLoginAt < 12 * 60 * 1000) {
      return;
    }
    // Yeni oturum öncesi eski cookieleri temizle
    this.jar = new CookieJar();
    this._pageToken = null;
    this.loggedIn = false;
    await this.login();
  }

  async fetchLoginBootstrap() {
    let url = `${this.baseUrl}/login`;
    let lastHint = "";
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-language": "tr-TR,tr;q=0.9",
          "user-agent": BROWSER_UA,
          cookie: this.jar.header(),
        },
        redirect: "manual",
      });
      this.jar.absorb(res);

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location") || "";
        if (!loc) break;
        url = loc.startsWith("http") ? loc : `${this.baseUrl}${loc.startsWith("/") ? loc : `/${loc}`}`;
        lastHint = `redirect ${res.status} → ${url}`;
        continue;
      }

      const html = await res.text();
      lastHint = `${url} → HTTP ${res.status}, ${loginPageHint(html)}`;
      if (!res.ok) break;

      const pageToken = extractHiddenToken(html);
      if (pageToken) {
        this._pageToken = pageToken;
        return { html, path: url };
      }
      const xsrf = this.jar.get("XSRF-TOKEN");
      if (xsrf) {
        this._pageToken = decodeLaravelXsrf(xsrf);
        if (this._pageToken) return { html, path: url };
      }
      break;
    }
    throw new Error(`Takipsan CSRF token bulunamadı (${lastHint})`);
  }

  async login() {
    const username = String(this.username || "").trim();
    const password = String(this.password || "");
    if (!username || !password) {
      throw new Error(
        "TAKIPSAN_USERNAME ve TAKIPSAN_PASSWORD tanımlı değil — sunucuda backend/.env dosyasını kontrol edin"
      );
    }

    await this.fetchLoginBootstrap();
    const token = this._pageToken || this.csrfToken;
    if (!token) {
      throw new Error("Takipsan CSRF token bulunamadı");
    }

    const form = new URLSearchParams();
    form.set("_token", token);
    form.set("username", username);
    form.set("password", password);
    form.set("remember", "on");

    const post = await fetch(`${this.baseUrl}/login`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "tr-TR,tr;q=0.9",
        "user-agent": BROWSER_UA,
        referer: `${this.baseUrl}/login`,
        origin: this.baseUrl,
        cookie: this.jar.header(),
      },
      body: form.toString(),
      redirect: "manual",
    });
    this.jar.absorb(post);

    const loc = post.headers.get("location") || "";

    // Başarısız giriş: /login'e redirect (yanlış şifre)
    if (post.status >= 300 && post.status < 400 && loc.includes("/login")) {
      throw new Error("Takipsan giriş başarısız — kullanıcı adı veya şifre hatalı");
    }

    if (post.status >= 300 && post.status < 400 && loc) {
      const hop = await fetch(loc, {
        headers: { cookie: this.jar.header(), accept: "text/html" },
        redirect: "follow",
      });
      this.jar.absorb(hop);
      const hopHtml = await hop.text();
      if (this.isLoginHtml(hopHtml)) {
        throw new Error("Takipsan giriş başarısız — kullanıcı adı veya şifre hatalı");
      }
      this.loggedIn = true;
      this.lastLoginAt = Date.now();
      return;
    }

    const afterHtml = await post.text();
    if (this.isLoginHtml(afterHtml)) {
      throw new Error("Takipsan giriş başarısız — kullanıcı adı veya şifre hatalı");
    }
    if (!post.ok) {
      throw new Error(`Takipsan giriş yanıtı beklenmedik (HTTP ${post.status})`);
    }

    this.loggedIn = true;
    this.lastLoginAt = Date.now();
  }

  async fetchConsignmentHtml(consignmentId, retry = true) {
    await this.ensureSession();
    const res = await this.request(`/consignment/${consignmentId}`, { ajax: false });
    const html = await res.text();
    if (!res.ok) {
      throw new Error(`Sevkiyat sayfası alınamadı (${res.status})`);
    }
    if (this.isLoginHtml(html)) {
      if (!retry) throw new Error("Takipsan oturumu geçersiz — yeniden giriş de başarısız oldu");
      // Eski cookieleri temizleyerek sıfırdan oturum aç
      this.jar = new CookieJar();
      this._pageToken = null;
      this.loggedIn = false;
      this.lastLoginAt = null;
      await this.login();
      return this.fetchConsignmentHtml(consignmentId, false);
    }
    return html;
  }

  buildPackageZaraUrl(consignmentId, { start = 0, length = 500 } = {}) {
    const token = this.csrfToken || this._pageToken || "";
    const params = new URLSearchParams();
    params.set("draw", "1");
    params.set("start", String(start));
    params.set("length", String(length));
    params.set("search[value]", "");
    params.set("search[regex]", "false");
    params.set("consignmentId", String(consignmentId));
    if (token) params.set("_token", token);

    const columns = [
      { data: "", name: "", orderable: "false" },
      { data: "package_no", name: "package_no", orderable: "true" },
      { data: "items", name: "items", orderable: "true" },
      { data: "status", name: "status", orderable: "true" },
      { data: "size", name: "size", orderable: "true" },
      { data: "created_user_id", name: "created_user_id", orderable: "true" },
      { data: "created_at", name: "created_at", orderable: "true" },
    ];
    columns.forEach((col, i) => {
      params.set(`columns[${i}][data]`, col.data);
      params.set(`columns[${i}][name]`, col.name);
      params.set(`columns[${i}][searchable]`, "true");
      params.set(`columns[${i}][orderable]`, col.orderable);
      params.set(`columns[${i}][search][value]`, "");
      params.set(`columns[${i}][search][regex]`, "false");
    });

    return `${this.baseUrl}/consignment/packageZara?${params.toString()}`;
  }

  async fetchPackageZara(consignmentId) {
    await this.ensureSession();
    const url = this.buildPackageZaraUrl(consignmentId);
    const res = await this.request(url, {
      headers: {
        referer: `${this.baseUrl}/consignment/${consignmentId}`,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`packageZara isteği başarısız (${res.status})`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("packageZara JSON yanıtı parse edilemedi");
    }
    const rows = (json.data || []).map(normalizePackageRow).filter(Boolean);
    const totalItems = rows.reduce((s, r) => s + (r.items || 0), 0);
    const beden = {};
    for (const r of rows) {
      if (!r.size) continue;
      beden[r.size] = (beden[r.size] || 0) + (r.items || 0);
    }
    return {
      rows,
      totalItems,
      beden,
      recordsTotal: parseIntSafe(json.recordsTotal),
      recordsFiltered: parseIntSafe(json.recordsFiltered),
    };
  }

  /**
   * Okunan sayıyı HTML özetinden alır; yoksa packageZara items toplamını kullanır.
   */
  async fetchConsignmentReadData(consignmentId) {
    const id = String(consignmentId || "").trim();
    if (!id) throw new Error("consignmentId zorunlu");

    const html = await this.fetchConsignmentHtml(id);
    const summary = parseConsignmentSummaryFromHtml(html);
    const fromHtml = summary.readCount ?? parseReadCountFromHtml(html);

    let packages = { rows: [], totalItems: 0, beden: {}, recordsFiltered: 0 };
    try {
      packages = await this.fetchPackageZara(id);
    } catch {
      // packageZara opsiyonel; HTML özet yeterli
    }
    const fromPackages = packages.totalItems;

    let readCount = fromHtml ?? fromPackages;
    let source = fromHtml != null ? "html" : "packageZara_items";

    if (fromHtml != null && fromPackages > 0 && fromHtml !== fromPackages) {
      readCount = Math.max(fromHtml, fromPackages);
      source = "html_and_packages_max";
    }

    const packageCountFromHtml = summary.packageCount;
    const packageCount =
      packageCountFromHtml ??
      packages.recordsFiltered ??
      packages.rows.length ??
      null;
    const orderQuantity = summary.orderQuantity;
    const productFields = parseConsignmentProductFieldsFromHtml(html, summary.orderCode);
    const productRef = productFields.productRef;
    const productLabel =
      productRef ||
      (productFields.productName && productFields.modelCode
        ? `${productFields.productName} · ${productFields.modelCode}`
        : productFields.productName || productFields.modelCode || "");

    return {
      consignmentId: id,
      readCount,
      orderQuantity,
      orderCode: summary.orderCode || "",
      productRef,
      productName: productFields.productName,
      modelCode: productFields.modelCode,
      productLabel,
      packageCount: packageCount ?? 0,
      packageCountFromHtml,
      source,
      fromHtml,
      fromPackages,
      packages: packages.rows,
      bedenFromPackages: packages.beden,
    };
  }
}

export function isTakipsanConfigured() {
  const enabled = String(process.env.TAKIPSAN_ENABLED || "").toLowerCase();
  if (enabled === "false" || enabled === "0") return false;
  return Boolean(
    String(process.env.TAKIPSAN_USERNAME || "").trim() &&
      String(process.env.TAKIPSAN_PASSWORD || "").length > 0 &&
      String(process.env.TAKIPSAN_CONSIGNMENT_ID || "").trim()
  );
}
