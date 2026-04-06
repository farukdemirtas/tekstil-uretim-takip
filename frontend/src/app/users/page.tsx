"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UsersPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ayarlar?tab=kullanici");
  }, [router]);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-8">
      <p className="text-sm text-slate-500">Yönlendiriliyor…</p>
    </main>
  );
}
