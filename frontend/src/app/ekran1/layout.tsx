import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EKRAN1 — Genel İlerleme",
  description: "Üretim hedef takip — dev ekran görünümü"
};

export default function Ekran1Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="relative h-full min-h-0 min-w-0 w-full">{children}</div>;
}
