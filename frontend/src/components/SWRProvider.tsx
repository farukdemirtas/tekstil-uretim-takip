"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        // Pencere odak değişiminde tekrar çekme — üretim sayfasında gereksiz
        revalidateOnFocus: false,
        // Ağ yeniden bağlanınca güncelle
        revalidateOnReconnect: true,
        // Hata durumunda 2x yeniden dene
        errorRetryCount: 2,
        // Çakışan istekleri 2 sn içinde birleştir
        dedupingInterval: 2000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
