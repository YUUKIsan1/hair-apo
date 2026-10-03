import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import ShiftEditor from "./ShiftEditor";

export default async function SettingsShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const db = createServiceClient();
  const { data: staffList } = await db
    .from("staff")
    .select("id, name")
    .eq("salon_id", ctx.salon.id)
    .eq("is_active", true)
    .order("sort_order");
  const staff = staffList ?? [];
  const selected =
    staff.find((s) => s.id === params.staff)?.id ?? staff[0]?.id ?? null;

  const [{ data: shifts }, { data: timeOffs }] = await Promise.all([
    selected
      ? db
          .from("shifts")
          .select("*")
          .eq("staff_id", selected)
          .not("day_of_week", "is", null)
      : Promise.resolve({ data: [] }),
    db
      .from("time_off")
      .select("*, staff(name)")
      .eq("salon_id", ctx.salon.id)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
  ]);

  return (
    <ShiftEditor
      staffList={staff}
      selectedStaffId={selected}
      shifts={shifts ?? []}
      timeOffs={(timeOffs ?? []).map((t) => ({
        id: t.id,
        staff_id: t.staff_id,
        staff_name: t.staff?.name ?? null,
        starts_at: t.starts_at,
        ends_at: t.ends_at,
        reason: t.reason,
      }))}
    />
  );
}
