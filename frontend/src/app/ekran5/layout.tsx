import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EKRAN5 — Ütü–Paket Takip",
  description: "Ütü–paket hattı TV görünümü",
};

export default function Ekran5Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="relative h-full min-h-0 min-w-0 w-full">{children}</div>;
}
