import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EKRAN2 — Aşama Analiz Panosu",
  description: "Sağ/Sol ön, yaka, arka, bitim — analiz istatistikleri, TV görünümü",
};

export default function Ekran2Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
