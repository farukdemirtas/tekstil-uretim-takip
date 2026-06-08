/** Takipsan ürün etiketi: "403-SKY BLUE · 3108-557 KING" */

export function splitTakipsanProductLabel(fullLabel: string) {
  const raw = String(fullLabel || "").trim();
  if (!raw) {
    return { productName: "", modelCode: "", takipsanProductLabel: "" };
  }
  const m = raw.match(/^(.+?)\s*[·•|]\s*(.+)$/);
  if (m) {
    return {
      productName: m[1].trim(),
      modelCode: m[2].trim(),
      takipsanProductLabel: raw,
    };
  }
  return { productName: raw, modelCode: "", takipsanProductLabel: raw };
}

export function buildTakipsanProductLabel(productName: string, modelCode: string) {
  const p = String(productName || "").trim();
  const c = String(modelCode || "").trim();
  if (p && c) return `${p} · ${c}`;
  return p || c;
}

/** Üretim ekranı / Hedef Takip gösterimi */
export function formatProductDisplayLine(productName: string, modelCode: string) {
  const p = String(productName || "").trim();
  const c = String(modelCode || "").trim();
  if (p && c) return `Ürün: ${p} · Kod: ${c}`;
  if (p) return `Ürün: ${p}`;
  if (c) return `Kod: ${c}`;
  return "—";
}

export function formatModelPickerLabel(
  productName: string,
  modelCode: string,
  targetQuantity?: number
) {
  const label = buildTakipsanProductLabel(productName, modelCode);
  const qty =
    targetQuantity != null && Number.isFinite(targetQuantity) && targetQuantity > 0
      ? ` (${targetQuantity.toLocaleString("tr-TR")} adet)`
      : "";
  return `${label}${qty}`;
}
