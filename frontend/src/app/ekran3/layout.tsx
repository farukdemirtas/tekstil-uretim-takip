import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EKRAN3 — Bölüm panosu",
};

/** TV / iframe: tam yükseklik zinciri, taşmayı kes */
export default function Ekran3Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="relative min-h-0 min-w-0 h-full w-full">{children}</div>;
}
