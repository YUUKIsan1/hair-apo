import { NextRequest, NextResponse } from "next/server";
import { mergeSlots, slotsForStaff } from "@/lib/availability";
import {
  getAppointments,
  getBusinessHours,
  getMenus,
  getSalonBySlug,
  getShifts,
  getStaffForMenu,
  getTimeOff,
} from "@/lib/queries";

// GET /api/availability?salon=<slug>&menu=<id>&staff=<id|"free">&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const slug = q.get("salon");
  const menuId = q.get("menu");
  const staffParam = q.get("staff") ?? "free";
  const date = q.get("date");
  if (!slug || !menuId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const salon = await getSalonBySlug(slug);
  if (!salon) return NextResponse.json({ error: "not found" }, { status: 404 });

  const menus = await getMenus(salon.id);
  const menu = menus.find((m) => m.id === menuId);
  if (!menu) return NextResponse.json({ error: "menu not found" }, { status: 404 });

  let staffList = await getStaffForMenu(salon.id, menuId);
  if (staffParam !== "free") {
    staffList = staffList.filter((s) => s.id === staffParam);
    if (staffList.length === 0)
      return NextResponse.json({ error: "staff not found" }, { status: 404 });
  }

  const from = `${date}T00:00:00+09:00`;
  const to = `${date}T23:59:59+09:00`;
  const [shifts, timeOffs, appointments, businessHours] = await Promise.all([
    getShifts(staffList.map((s) => s.id)),
    getTimeOff(salon.id, from, to),
    getAppointments(salon.id, from, to),
    getBusinessHours(salon.id),
  ]);

  const perStaff = new Map(
    staffList.map((s) => [
      s.id,
      slotsForStaff({
        date,
        staffId: s.id,
        menu,
        shifts,
        businessHours,
        timeOffs,
        appointments,
      }),
    ])
  );

  return NextResponse.json({
    date,
    slots: mergeSlots(perStaff).map(({ start, label, staffIds }) => ({
      start,
      label,
      staffIds,
    })),
  });
}
