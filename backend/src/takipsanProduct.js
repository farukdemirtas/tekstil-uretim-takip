/** Takipsan ürün etiketi: "403-SKY BLUE · 3108-557 KING" → parçalara ayırma */

export function splitTakipsanProductLabel(fullLabel) {
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

export function buildTakipsanProductLabel(productName, modelCode) {
  const p = String(productName || "").trim();
  const c = String(modelCode || "").trim();
  if (p && c) return `${p} · ${c}`;
  return p || c;
}
