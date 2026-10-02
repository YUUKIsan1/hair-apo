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
import { createServiceClient } from "@/lib/supabase/server";

interface BookingBody {
  salon: string;
  menu_id: string;
  staff_id: string | null; // null = フリー
  starts_at: string; // ISO +09:00
  customer: {
    name: string;
    name_kana?: string;
    phone: string;
    email?: string;
    notes?: string;
  };
}

// POST /api/bookings — 空き枠即時確定
export async function POST(req: NextRequest) {
  const body = (await req.json()) as BookingBody;
  const { salon: slug, menu_id, staff_id, starts_at, customer } = body;
  if (!slug || !menu_id || !starts_at || !customer?.name || !customer?.phone) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const salon = await getSalonBySlug(slug);
  if (!salon) return NextResponse.json({ error: "not found" }, { status: 404 });

  const menus = await getMenus(salon.id);
  const menu = menus.find((m) => m.id === menu_id);
  if (!menu) return NextResponse.json({ error: "menu not found" }, { status: 404 });

  const date = starts_at.slice(0, 10);
  const from = `${date}T00:00:00+09:00`;
  const to = `${date}T23:59:59+09:00`;
  const [staffList, shifts, timeOffs, appointments, businessHours] =
    await Promise.all([
      getStaffForMenu(salon.id, menu_id),
      getStaffForMenu(salon.id, menu_id).then((l) =>
        getShifts(l.map((s) => s.id))
      ),
      getTimeOff(salon.id, from, to),
      getAppointments(salon.id, from, to),
      getBusinessHours(salon.id),
    ]);

  // 指定スタッフ or フリー(空いているスタッフから選ぶ)
  const candidates = staff_id
    ? staffList.filter((s) => s.id === staff_id)
    : staffList;
  if (candidates.length === 0)
    return NextResponse.json({ error: "staff not found" }, { status: 404 });

  const perStaff = new Map(
    candidates.map((s) => [
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
  const slot = mergeSlots(perStaff).find((s) => s.start === starts_at);
  if (!slot) {
    return NextResponse.json(
      { error: "選択された時間は予約できません。別の時間を選んでください。" },
      { status: 409 }
    );
  }
  const assignedStaffId = staff_id ?? slot.staffIds[0];

  const db = createServiceClient();

  // 顧客: 電話番号で find-or-create
  let customerId: string;
  {
    const { data: existing } = await db
      .from("customers")
      .select("id")
      .eq("salon_id", salon.id)
      .eq("phone", customer.phone)
      .maybeSingle();
    if (existing) {
      customerId = existing.id;
      await db
        .from("customers")
        .update({
          name: customer.name,
          name_kana: customer.name_kana ?? null,
          email: customer.email ?? null,
        })
        .eq("id", customerId);
    } else {
      const { data: created, error } = await db
        .from("customers")
        .insert({
          salon_id: salon.id,
          name: customer.name,
          name_kana: customer.name_kana ?? null,
          phone: customer.phone,
          email: customer.email ?? null,
        })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      customerId = created.id;
    }
  }

  const start = new Date(starts_at);
  const end = new Date(
    start.getTime() + (menu.duration_minutes + menu.buffer_minutes) * 60_000
  );

  const { data: appt, error } = await db
    .from("appointments")
    .insert({
      salon_id: salon.id,
      staff_id: assignedStaffId,
      customer_id: customerId,
      menu_id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: "confirmed",
      channel: "direct",
      // 決済未実装のため any→on_site で確定。Stripe導入後に payment_mode を反映
      payment_mode: "on_site",
    })
    .select("id, manage_token, staff_id, starts_at, ends_at")
    .single();

  if (error) {
    // 排他制約違反 = 同時予約の競合
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "先ほど別の方が同じ時間を予約しました。別の時間を選んでください。" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    appointment: appt,
    manage_url: `/booking/${appt.manage_token}`,
  });
}
