import type { Metadata, Viewport } from "next";
import "./globals.css";
import "react-day-picker/style.css";
import AppChrome from "@/components/AppChrome";
import { I18nProvider } from "@/components/I18nProvider";
import { SWRProvider } from "@/components/SWRProvider";

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
    <html lang="tr" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <I18nProvider>
          <AppChrome />
          <SWRProvider>{children}</SWRProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
