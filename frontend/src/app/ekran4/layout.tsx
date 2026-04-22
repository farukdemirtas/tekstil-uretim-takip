import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EKRAN4 — Fabrika Özeti",
};

export default function Ekran4Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="relative h-full min-h-0 min-w-0 w-full">{children}</div>;
}
