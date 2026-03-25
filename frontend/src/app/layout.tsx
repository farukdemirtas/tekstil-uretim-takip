import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Yesil Imaj Tekstil",
  description: "Yesil Imaj Tekstil uretim takip uygulamasi"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
