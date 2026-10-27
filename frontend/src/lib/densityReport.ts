import type { Workbook, Worksheet } from "exceljs";

import { downloadWorkbook, loadExcelJS } from "@/lib/exceljsLazy";

export const DENSITY_TEMPLATE_URL = "/templates/density-taslak.xlsx";
const STORAGE_KEY = "density_report_v1";

export const DENSITY_BRANDS = [
  "Zara",
  "Zara Home",
  "Pull&Bear",
  "Oysho",
  "Bershka",
  "Massimo Dutti",
  "Stradivarius",
] as const;

export const DENSITY_PO_TYPES = ["-D", "-04", "-W", "-N", "-01", "-06", "-25", "-55"] as const;

export const DENSITY_DELIVERIES = Array.from({ length: 30 }, (_, i) => String(i + 1));

export const DENSITY_BOXES = [
  { label: "GtoP400  (58x38x40)", l: 58, w: 38, h: 40 },
  { label: "GtoP800/4  (78x58x40)", l: 78, w: 58, h: 40 },
  { label: "GtoP300   (58x38x30)", l: 58, w: 38, h: 30 },
  { label: "GtoP800/3 (78x58x30)", l: 78, w: 58, h: 30 },
  { label: "GtoP200  (58x38x20)", l: 58, w: 38, h: 20 },
  { label: "GtoP800/2 (78x58x20)", l: 78, w: 58, h: 20 },
  { label: "GtoPPULL800/4 (77x58x40)", l: 77, w: 58, h: 40 },
  { label: "GtoPPULL800/3 (77x58x30)", l: 77, w: 58, h: 30 },
  { label: "GtoPPULL800/2 (77x58x30)", l: 77, w: 58, h: 30 },
  { label: "GtoPP980/2  (98x58x20)", l: 99, w: 58, h: 20 },
  { label: "GtoP1160/2  (116x58x20)", l: 116, w: 58, h: 20 },
  { label: "GtoP29/4  (57x29,5x40)", l: 57, w: 29.5, h: 40 },
  { label: "SPECIAL", l: null, w: null, h: null },
] as const;

export const DENSITY_SPECIAL_VALUE = "Special";
export const DENSITY_SPECIAL_DIMS = [
  DENSITY_SPECIAL_VALUE,
  ...Array.from({ length: 181 }, (_, i) => String(i + 20)),
];
export const DENSITY_PLANCHA = ["Yes", "No"] as const;
export const DENSITY_SHIPMENTS = ["PLANE", "BOAT", "TRUCK"] as const;
export const DENSITY_GTOP = ["Yes", "No"] as const;

export const DENSITY_SIZE_TYPOLOGIES = [
  {
    label: "XXS / XS / S / M / L / XL / XXL",
    sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL", " - "],
  },
  {
    label: "32 / 34 / 36 / 38 / 40 / 42 / 44 / 46",
    sizes: ["32", "34", "36", "38", "40", "42", "44", "46"],
  },
  {
    label: "06 / 07 / 08 / 09 / 10 / 12 / 14",
    sizes: ["06", "07", "08", "09", "10", "12", "14", " - "],
  },
  {
    label: "06 / 09 / 12 / 18 / 24 / 36 / 48 / 60",
    sizes: ["06", "09", "12", "18", "24", "36", "48", "60"],
  },
] as const;

export const DENSITY_SIZES = [
  "XXS",
  "XS",
  "XS-S",
  "S",
  "S-M",
  "M",
  "M-L",
  "L",
  "L-XL",
  "XL",
  "XXL",
  "XXXL",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "50",
  "52",
  "53",
  "54",
  "56",
  "57",
  "58",
  "60",
  "61",
  "62",
  "63",
  "64",
  "66",
  "67",
  "68",
  "69",
  "70",
  "71",
  "72",
  "73",
  "74",
  "75",
  "76",
  "77",
  "78",
  "79",
  "80",
  "81",
  "82",
  "83",
  "84",
  "85",
  "89",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
  "100",
  " - ",
] as const;

export const DENSITY_PPC = Array.from({ length: 246 }, (_, i) => String(i + 5));
export const DENSITY_GW = Array.from({ length: 280 }, (_, i) => (5 + i * 0.1).toFixed(1));

const SIZE_VALUE_COLS = [4, 6, 8, 10, 12, 14, 16, 18] as const;

export type DensityPhoto = {
  dataUrl: string;
  ext: "jpeg" | "png";
};

export type DensityPhotoKey =
  | "cartonTop"
  | "cartonSide"
  | "cartonClosed"
  | "garmentThickness"
  | "garmentLength"
  | "garmentWidth";

export type DensityPhotos = Record<DensityPhotoKey, DensityPhoto | null>;

export const DENSITY_PHOTO_KEYS: DensityPhotoKey[] = [
  "cartonTop",
  "cartonSide",
  "cartonClosed",
  "garmentThickness",
  "garmentLength",
  "garmentWidth",
];

export const DENSITY_PICTURE_ROWS: {
  key: Extract<DensityPhotoKey, "cartonTop" | "cartonSide" | "cartonClosed">;
  example: string;
  tlRow: number;
  brRow: number;
}[] = [
  { key: "cartonTop", example: "/templates/density-examples/picture-1.jpg", tlRow: 16, brRow: 24 },
  { key: "cartonSide", example: "/templates/density-examples/picture-2.jpg", tlRow: 24, brRow: 34 },
  { key: "cartonClosed", example: "/templates/density-examples/picture-3.png", tlRow: 34, brRow: 44 },
];

/** Şablon birleşik hücreleri: G5:H10, J5:K10, M5:N10 (ExcelJS 0-tabanlı) */
export const DENSITY_GARMENT_PICTURES: {
  key: Extract<DensityPhotoKey, "garmentThickness" | "garmentLength" | "garmentWidth">;
  example: string;
  tlCol: number;
  tlRow: number;
  brCol: number;
  brRow: number;
}[] = [
  { key: "garmentThickness", example: "/templates/density-examples/garment-thickness.png", tlCol: 6, tlRow: 4, brCol: 8, brRow: 10 },
  { key: "garmentLength", example: "/templates/density-examples/garment-length.png", tlCol: 9, tlRow: 4, brCol: 11, brRow: 10 },
  { key: "garmentWidth", example: "/templates/density-examples/garment-width.png", tlCol: 12, tlRow: 4, brCol: 14, brRow: 10 },
];

export type DensitySizeSlot = {
  size: string;
  ppc: string;
  gw: string;
};

export type DensityForm = {
  fileName: string;
  brand: string;
  style: string;
  article: string;
  poNumber: string;
  poType: string;
  delivery: string;
  boxType: string;
  specialL: string;
  specialW: string;
  specialH: string;
  plancha: string;
  shipment: string;
  gtop: string;
  gThickness: string;
  gLength: string;
  gWidth: string;
  sizeTypology: string;
  sizes: DensitySizeSlot[];
};

export function emptyDensitySizeSlot(): DensitySizeSlot {
  return { size: "", ppc: "", gw: "" };
}

export function emptyDensityPhotos(): DensityPhotos {
  return {
    cartonTop: null,
    cartonSide: null,
    cartonClosed: null,
    garmentThickness: null,
    garmentLength: null,
    garmentWidth: null,
  };
}

export async function fileToDensityPhoto(file: File): Promise<DensityPhoto> {
  const bitmap = await createImageBitmap(file);
  const max = 1400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Görsel işlenemedi");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { dataUrl, ext: "jpeg" };
}

export function emptyDensityForm(): DensityForm {
  return {
    fileName: "",
    brand: "",
    style: "",
    article: "",
    poNumber: "",
    poType: "",
    delivery: "",
    boxType: DENSITY_BOXES[0].label,
    specialL: DENSITY_SPECIAL_VALUE,
    specialW: DENSITY_SPECIAL_VALUE,
    specialH: DENSITY_SPECIAL_VALUE,
    plancha: "No",
    shipment: "",
    gtop: "",
    gThickness: "",
    gLength: "",
    gWidth: "",
    sizeTypology: "",
    sizes: Array.from({ length: 8 }, emptyDensitySizeSlot),
  };
}

export function boxDimsFor(label: string) {
  const found = DENSITY_BOXES.find((b) => b.label === label);
  if (!found || found.l == null) return { l: "-", w: "-", h: "-" };
  return { l: String(found.l), w: String(found.w), h: String(found.h) };
}

export function isSpecialBox(label: string) {
  return label === "SPECIAL";
}

export function isFilledSizeSlot(slot: DensitySizeSlot) {
  const size = slot.size.trim();
  return Boolean(size) && size !== " - ";
}

export function compactDensitySizes(sizes: DensitySizeSlot[]): DensitySizeSlot[] {
  return sizes.filter(isFilledSizeSlot).map((slot) => ({ ...slot })).slice(0, 8);
}

export function applySizeTypology(form: DensityForm, typologyLabel: string): DensityForm {
  const found = DENSITY_SIZE_TYPOLOGIES.find((t) => t.label === typologyLabel);
  if (!found) return { ...form, sizeTypology: typologyLabel };
  return {
    ...form,
    sizeTypology: typologyLabel,
    sizes: compactDensitySizes(
      found.sizes.map((size, i) => ({
        ...(form.sizes[i] ?? emptyDensitySizeSlot()),
        size: size === " - " ? "" : size,
        ppc: "",
        gw: "",
      })),
    ),
  };
}

export function mergeDensityForm(parsed: Partial<DensityForm> | null | undefined): DensityForm {
  const base = emptyDensityForm();
  if (!parsed || typeof parsed !== "object") return base;
  return {
    ...base,
    ...parsed,
    specialL: parsed.specialL || DENSITY_SPECIAL_VALUE,
    specialW: parsed.specialW || DENSITY_SPECIAL_VALUE,
    specialH: parsed.specialH || DENSITY_SPECIAL_VALUE,
    sizes: compactDensitySizes(
      Array.from({ length: 8 }, (_, i) => ({
        ...emptyDensitySizeSlot(),
        ...(parsed.sizes?.[i] ?? {}),
      })),
    ),
  };
}

export function mergeDensityPhotos(parsed: Partial<DensityPhotos> | null | undefined): DensityPhotos {
  const base = emptyDensityPhotos();
  if (!parsed || typeof parsed !== "object") return base;
  const next = { ...base };
  for (const key of DENSITY_PHOTO_KEYS) {
    const p = parsed[key];
    next[key] = p?.dataUrl ? p : null;
  }
  return next;
}

export function sanitizeDensityDownloadName(form: DensityForm) {
  const raw = String(form.fileName || "").trim();
  const style = padStyle(form.style);
  const article = padArticle(form.article);
  const fallback = `Density-Report-${style || "style"}-${article || "article"}-${form.poNumber.trim() || "PO"}`;
  const base = (raw || fallback).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  const noExt = base.replace(/\.xlsx$/i, "");
  return `${noExt || fallback}.xlsx`;
}

export function loadDensityForm(): DensityForm {
  if (typeof window === "undefined") return emptyDensityForm();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDensityForm();
    return mergeDensityForm(JSON.parse(raw) as DensityForm);
  } catch {
    return emptyDensityForm();
  }
}

export function persistDensityForm(form: DensityForm) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
}

function padStyle(value: string) {
  const n = value.replace(/\D/g, "");
  if (!n) return "";
  return n.slice(-4).padStart(4, "0");
}

function padArticle(value: string) {
  const n = value.replace(/\D/g, "");
  if (!n) return "";
  return n.slice(-3).padStart(3, "0");
}

function asNumberOrText(value: string) {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && t !== " - " ? n : t;
}

function setCell(ws: { getCell: (addr: string) => { value: unknown } }, addr: string, value: unknown) {
  ws.getCell(addr).value = value === "" || value == null ? null : value;
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type SheetImage = {
  type?: string;
  range?: {
    tl?: { nativeCol?: number; nativeRow?: number; col?: number; row?: number };
    br?: { nativeCol?: number; nativeRow?: number; col?: number; row?: number };
  };
};

function garmentAnchorOverlaps(
  image: SheetImage,
  box: { tlCol: number; tlRow: number; brCol: number; brRow: number },
) {
  const tl = image.range?.tl;
  const br = image.range?.br;
  if (!tl) return false;
  const left = Number(tl.nativeCol ?? tl.col ?? 0);
  const top = Number(tl.nativeRow ?? tl.row ?? 0);
  const right = Number(br?.nativeCol ?? br?.col ?? left + 1);
  const bottom = Number(br?.nativeRow ?? br?.row ?? top + 1);
  return left < box.brCol && right > box.tlCol && top < box.brRow && bottom > box.tlRow;
}

/** Şablondaki örnek garment görsellerini yalnızca o alana fotoğraf yüklendiyse kaldır. */
function removeTemplateGarmentImage(ws: Worksheet, box: (typeof DENSITY_GARMENT_PICTURES)[number]) {
  const media = (ws as unknown as { _media?: SheetImage[] })._media;
  if (!Array.isArray(media)) return;
  for (let i = media.length - 1; i >= 0; i--) {
    const item = media[i];
    if (item?.type && item.type !== "image") continue;
    if (garmentAnchorOverlaps(item, box)) media.splice(i, 1);
  }
}

function addPhoto(
  wb: Workbook,
  ws: Worksheet,
  photo: DensityPhoto,
  tlCol: number,
  tlRow: number,
  brCol: number,
  brRow: number,
) {
  const bytes = dataUrlToBytes(photo.dataUrl);
  const id = wb.addImage({
    buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    extension: photo.ext,
  });
  const pad = 0.08;
  ws.addImage(id, {
    tl: { col: tlCol + pad, row: tlRow + pad },
    br: { col: brCol - pad, row: brRow - pad },
    editAs: "twoCell",
  } as Parameters<Worksheet["addImage"]>[1]);
}

export async function downloadDensityExcel(form: DensityForm, photos: DensityPhotos = emptyDensityPhotos()) {
  const res = await fetch(DENSITY_TEMPLATE_URL);
  if (!res.ok) throw new Error("Density şablonu yüklenemedi");
  const buffer = await res.arrayBuffer();
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // ExcelJS bazı şablon CF kurallarını yazarken çöküyor; görünüm formülleri durur.
  wb.eachSheet((sheet) => {
    const list = (sheet as unknown as { conditionalFormattings?: unknown[] }).conditionalFormattings;
    if (Array.isArray(list) && list.length) list.splice(0, list.length);
  });

  const ws = wb.getWorksheet("DENSITY");
  if (!ws) throw new Error("DENSITY sayfası bulunamadı");

  const style = padStyle(form.style);
  const article = padArticle(form.article);
  const special = isSpecialBox(form.boxType);

  setCell(ws, "C3", form.brand || null);
  setCell(ws, "C4", style || null);
  setCell(ws, "D4", article || null);
  setCell(ws, "C5", asNumberOrText(form.poNumber));
  setCell(ws, "D5", form.poType || null);
  setCell(ws, "E5", form.delivery ? Number(form.delivery) : null);
  setCell(ws, "C6", form.boxType || null);

  setCell(ws, "C8", asNumberOrText(form.specialL) ?? DENSITY_SPECIAL_VALUE);
  setCell(ws, "D8", asNumberOrText(form.specialW) ?? DENSITY_SPECIAL_VALUE);
  setCell(ws, "E8", asNumberOrText(form.specialH) ?? DENSITY_SPECIAL_VALUE);

  setCell(ws, "C9", form.plancha || null);
  setCell(ws, "C10", form.shipment || null);
  setCell(ws, "C11", form.gtop || null);
  setCell(ws, "H4", asNumberOrText(form.gThickness));
  setCell(ws, "K4", asNumberOrText(form.gLength));
  setCell(ws, "N4", asNumberOrText(form.gWidth));

  const sizes = compactDensitySizes(form.sizes);

  for (let i = 0; i < 8; i++) {
    const col = SIZE_VALUE_COLS[i];
    const slot = sizes[i] ?? emptyDensitySizeSlot();
    const sizeVal = slot.size.trim() && slot.size !== " - " ? slot.size : null;
    ws.getCell(14, col).value = sizeVal;
    ws.getCell(15, col).value = sizeVal && slot.ppc ? Number(slot.ppc) : null;
    ws.getCell(16, col).value = sizeVal && slot.gw ? Number(slot.gw) : null;
  }

  const datos = wb.getWorksheet("DATOS");
  if (datos) {
    const carton = boxDimsFor(form.boxType);
    const cartonL = special ? "-" : Number(carton.l);
    const cartonW = special ? "-" : Number(carton.w);
    const cartonH = special ? "-" : Number(carton.h);
    const specialL = asNumberOrText(form.specialL);
    const specialW = asNumberOrText(form.specialW);
    const specialH = asNumberOrText(form.specialH);

    for (let i = 0; i < 8; i++) {
      const row = 2 + i;
      const slot = sizes[i] ?? emptyDensitySizeSlot();
      const sizeVal = slot.size.trim() && slot.size !== " - " ? slot.size : "";
      const values = sizeVal
        ? [
            form.brand,
            style,
            article,
            asNumberOrText(form.poNumber),
            form.poType,
            form.delivery ? Number(form.delivery) : null,
            form.boxType,
            cartonL,
            cartonW,
            cartonH,
            typeof specialL === "number" ? specialL : null,
            typeof specialW === "number" ? specialW : null,
            typeof specialH === "number" ? specialH : null,
            form.plancha,
            form.shipment,
            form.gtop,
            asNumberOrText(form.gThickness),
            asNumberOrText(form.gLength),
            asNumberOrText(form.gWidth),
            sizeVal,
            slot.ppc ? Number(slot.ppc) : null,
            slot.gw ? Number(slot.gw) : null,
          ]
        : Array.from({ length: 22 }, () => null);
      values.forEach((v, colIdx) => {
        datos.getCell(row, colIdx + 1).value = v;
      });
    }
  }

  DENSITY_PICTURE_ROWS.forEach((rowDef) => {
    const photo = photos[rowDef.key];
    if (!photo) return;
    for (let i = 0; i < 8; i++) {
      const slot = sizes[i] ?? emptyDensitySizeSlot();
      if (!isFilledSizeSlot(slot)) continue;
      const tlCol = SIZE_VALUE_COLS[i] - 2;
      const brCol = SIZE_VALUE_COLS[i];
      addPhoto(wb, ws, photo, tlCol, rowDef.tlRow, brCol, rowDef.brRow);
    }
  });

  DENSITY_GARMENT_PICTURES.forEach((box) => {
    if (!photos[box.key]) return;
    removeTemplateGarmentImage(ws, box);
  });
  DENSITY_GARMENT_PICTURES.forEach((box) => {
    const photo = photos[box.key];
    if (!photo) return;
    addPhoto(wb, ws, photo, box.tlCol, box.tlRow, box.brCol, box.brRow);
  });

  await downloadWorkbook(wb, sanitizeDensityDownloadName(form));
}
