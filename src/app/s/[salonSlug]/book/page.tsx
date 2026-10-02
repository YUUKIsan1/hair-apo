import { notFound } from "next/navigation";
import {
  getAllStaffMenuPairs,
  getMenus,
  getSalonBySlug,
  getStaffList,
} from "@/lib/queries";
import { BookingFlow } from "./BookingFlow";

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonSlug: string }>;
  searchParams: Promise<{ menu?: string }>;
}) {
  const { salonSlug } = await params;
  const { menu: initialMenuId } = await searchParams;
  const salon = await getSalonBySlug(salonSlug);
  if (!salon) notFound();

  const [menus, staff, pairs] = await Promise.all([
    getMenus(salon.id),
    getStaffList(salon.id),
    getAllStaffMenuPairs(salon.id),
  ]);

  // menuId → 指名可能なスタッフ
  const staffByMenu = new Map<string, typeof staff>(
    menus.map((m) => {
      const ids = new Set(
        pairs.filter((p) => p.menu_id === m.id && p.nominable).map((p) => p.staff_id)
      );
      return [m.id, staff.filter((s) => ids.has(s.id))];
    })
  );

  return (
    <BookingFlow
      salon={{ id: salon.id, slug: salon.slug, name: salon.name }}
      menus={menus}
      staffByMenu={Object.fromEntries(staffByMenu)}
      initialMenuId={initialMenuId ?? null}
    />
  );
}
