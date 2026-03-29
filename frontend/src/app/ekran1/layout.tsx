import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EKRAN1 — Genel İlerleme",
  description: "Üretim hedef takip — dev ekran görünümü"
};

export default function Ekran1Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
