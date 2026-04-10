import { redirect } from "next/navigation";

export default function LoglarPage() {
  redirect("/ayarlar?tab=loglar");
}
