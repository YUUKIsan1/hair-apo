import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import StaffList from "./StaffList";

export default async function SettingsStaffPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  // 無効化したスタッフも一覧に出すため is_active 絞りなしで取得
  const { data: staff } = await createServiceClient()
    .from("staff")
    .select("*")
    .eq("salon_id", ctx.salon.id)
    .order("sort_order");

  return <StaffList initial={staff ?? []} />;
}
