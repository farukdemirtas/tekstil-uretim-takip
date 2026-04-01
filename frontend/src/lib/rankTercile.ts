/**
 * Sıralı personel listesini (0 = en yüksek üretim) üç gruba böler.
 * Kalan kişiler alt gruba eklenir (ör. 10 kişi → 4 + 3 + 3).
 */
export function rankTercileSegmentEnds(total: number): { greenEnd: number; blueEnd: number } {
  if (total <= 0) return { greenEnd: 0, blueEnd: 0 };
  const base = Math.floor(total / 3);
  const rem = total % 3;
  const s0 = base + (rem >= 1 ? 1 : 0);
  const s1 = base + (rem >= 2 ? 1 : 0);
  return { greenEnd: s0, blueEnd: s0 + s1 };
}

/** Üst üçte bir: yeşil, orta: mavi, alt üçte bir: kırmızı */
export function rankTercileStyles(index: number, total: number): { bar: string; rank: string } {
  const { greenEnd, blueEnd } = rankTercileSegmentEnds(total);
  if (index < greenEnd) {
    return {
      bar: "bg-emerald-500",
      rank: "font-bold text-emerald-600 dark:text-emerald-400",
    };
  }
  if (index < blueEnd) {
    return {
      bar: "bg-blue-500",
      rank: "text-slate-500 dark:text-slate-400",
    };
  }
  return {
    bar: "bg-red-500",
    rank: "font-bold text-red-500 dark:text-red-400",
  };
}
