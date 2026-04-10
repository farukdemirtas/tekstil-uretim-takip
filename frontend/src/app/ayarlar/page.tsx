import { Suspense } from "react";
import AyarlarPageClient from "./AyarlarPageClient";

export default function AyarlarPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center p-4">
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        </main>
      }
    >
      <AyarlarPageClient />
    </Suspense>
  );
}
