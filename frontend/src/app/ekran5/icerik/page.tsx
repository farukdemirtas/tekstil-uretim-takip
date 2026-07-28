"use client";

import UtuPaketEkran5 from "@/components/utu-paket/UtuPaketEkran5";
import { useScreenHeartbeat } from "@/lib/useScreenHeartbeat";

export default function Ekran5IcerikPage() {
  useScreenHeartbeat("ekran5");
  return <UtuPaketEkran5 embedded={false} />;
}
