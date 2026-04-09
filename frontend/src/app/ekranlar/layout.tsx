import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TV ekranları",
  description: "EKRAN1, EKRAN2, EKRAN3 tek sayfada",
};

export default function EkranlarLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
