import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import {
  getAllStaffMenuPairs,
  getMenus,
  getStaffList,
} from "@/lib/queries";
import ManualBookingForm from "./ManualBookingForm";

export default async function AdminNewBookingPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const [menus, staffList, pairs] = await Promise.all([
    getMenus(ctx.salon.id),
    getStaffList(ctx.salon.id),
    getAllStaffMenuPairs(ctx.salon.id),
  ]);

  const staffByMenu: Record<string, string[]> = {};
  for (const p of pairs) {
    (staffByMenu[p.menu_id] ??= []).push(p.staff_id);
  }

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">New Reservation</p>
      <h1 className="font-display mt-1 text-2xl">予約登録</h1>
      <p className="mt-1 text-sm text-mute">
        電話・来店での予約を手入力します。HPB併用期間の枠ブロックにも使えます。
      </p>
      <div className="mt-6 rounded-xl border hairline bg-card p-6">
        <ManualBookingForm
          salonSlug={ctx.salon.slug}
          menus={menus.map((m) => ({
            id: m.id,
            name: m.name,
            price: m.price,
            duration_minutes: m.duration_minutes,
          }))}
          staffList={staffList.map((s) => ({ id: s.id, name: s.name }))}
          staffByMenu={staffByMenu}
        />
      </div>
    </div>
  );
}
