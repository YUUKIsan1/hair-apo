import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin";
import { notifyBooking } from "@/lib/notify";
import { getMenus } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/server";

interface Body {
  menu_id: string;
  staff_id: string | null;
  starts_at: string; // ISO +09:00
  customer: {
    name: string;
    name_kana?: string;
    phone: string;
    email?: string;
  };
}

// POST /api/admin/bookings — 電話・来店予約の手入力(channel=manual)。
// 客側と違い空き枠計算は通さず、DBの排他制約だけでダブルブッキングを防ぐ
// (シフト外・営業時間外の予約も台帳上は取れるようにするため)。
export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "認証されていません" }, { status: 401 });

  const body = (await req.json()) as Body;
  const { menu_id, staff_id, starts_at, customer } = body;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.length > 0 && v.length <= max;
  const optStr = (v: unknown, max: number) =>
    v === undefined || v === null || (typeof v === "string" && v.length <= max);
  if (
    !str(menu_id, 64) ||
    !str(staff_id, 64) ||
    !str(starts_at, 40) ||
    !customer ||
    !str(customer.name, 100) ||
    !str(customer.phone, 30) ||
    !optStr(customer.name_kana, 100) ||
    !optStr(customer.email, 254)
  ) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const menu = (await getMenus(ctx.salon.id)).find((m) => m.id === menu_id);
  if (!menu) {
    return NextResponse.json({ error: "メニューが見つかりません" }, { status: 404 });
  }

  const db = createServiceClient();
  const { data: staff } = await db
    .from("staff")
    .select("id")
    .eq("id", staff_id)
    .eq("salon_id", ctx.salon.id)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ error: "スタッフが見つかりません" }, { status: 404 });
  }

  let customerId: string;
  {
    const { data: existing } = await db
      .from("customers")
      .select("id")
      .eq("salon_id", ctx.salon.id)
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
          salon_id: ctx.salon.id,
          name: customer.name,
          name_kana: customer.name_kana ?? null,
          phone: customer.phone,
          email: customer.email ?? null,
        })
        .select("id")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      customerId = created.id;
    }
  }

  const start = new Date(starts_at);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }
  const end = new Date(
    start.getTime() + (menu.duration_minutes + menu.buffer_minutes) * 60_000
  );

  const { data: appt, error } = await db
    .from("appointments")
    .insert({
      salon_id: ctx.salon.id,
      staff_id,
      customer_id: customerId,
      menu_id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: "confirmed",
      channel: "manual",
      price: menu.price,
      payment_mode: "on_site",
    })
    .select("id, manage_token, starts_at, ends_at")
    .single();

  if (error) {
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "その時間帯には別の予約が入っています" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 手入力はサロン自身の操作なので客への確定メールのみ送る
  await notifyBooking(appt.id, "confirmed", {
    baseUrl: new URL(req.url).origin,
    toSalon: false,
  });

  return NextResponse.json({ appointment: appt });
}
