import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import MenuList from "./MenuList";

export default async function SettingsMenusPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const db = createServiceClient();
  const [{ data: menus }, { data: staff }, { data: pairs }] = await Promise.all([
    db
      .from("menus")
      .select("*")
      .eq("salon_id", ctx.salon.id)
      .order("sort_order"),
    db
      .from("staff")
      .select("id, name")
      .eq("salon_id", ctx.salon.id)
      .eq("is_active", true)
      .order("sort_order"),
    db.from("staff_menus").select("staff_id, menu_id, nominable"),
  ]);

  const staffByMenu: Record<string, { staff_id: string; nominable: boolean }[]> =
    {};
  for (const p of pairs ?? []) {
    (staffByMenu[p.menu_id] ??= []).push({
      staff_id: p.staff_id,
      nominable: p.nominable,
    });
  }

  return (
    <MenuList
      initial={menus ?? []}
      staffList={staff ?? []}
      staffByMenu={staffByMenu}
    />
  );
}
