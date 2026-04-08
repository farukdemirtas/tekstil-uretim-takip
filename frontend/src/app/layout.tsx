import type { Metadata, Viewport } from "next";
import "./globals.css";
import "react-day-picker/style.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: {
    default: "Yeşil İmaj Tekstil — Üretim Takip",
    template: "%s | Yeşil İmaj Tekstil",
  },
  description:
    "Yeşil İmaj Tekstil üretim takip uygulaması — günlük üretim, hedef takip ve raporlama.",
  applicationName: "Yeşil İmaj Tekstil — Üretim Takip",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png", sizes: "any" }],
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1222" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className="font-sans antialiased">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
