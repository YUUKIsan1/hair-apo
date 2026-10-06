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
import { notifyBooking } from "@/lib/notify";
import {
  createCardSetupSession,
  createCheckoutSession,
  ensureStripeCustomer,
  getStripe,
} from "@/lib/stripe";
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
  channel?: "direct" | "mall";
}

// POST /api/bookings — 空き枠即時確定
export async function POST(req: NextRequest) {
  const body = (await req.json()) as BookingBody;
  const { salon: slug, menu_id, staff_id, starts_at, customer } = body;
  // モール経由の予約はモール料率で手数料を取る(請求集計もchannelで分かれる)
  const channel = body.channel === "mall" ? "mall" : "direct";
  if (!slug || !menu_id || !starts_at || !customer?.name || !customer?.phone) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const salon = await getSalonBySlug(slug);
  if (!salon) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 });

  const menus = await getMenus(salon.id);
  const menu = menus.find((m) => m.id === menu_id);
  if (!menu) return NextResponse.json({ error: "メニューが見つかりません" }, { status: 404 });

  const pairs = await getStaffForMenu(salon.id, menu_id);
  // 指定スタッフは指名可能な者のみ。フリーは担当可能な全員が候補
  const candidates = staff_id
    ? pairs
        .filter((p) => p.nominable && p.staff.id === staff_id)
        .map((p) => p.staff)
    : pairs.map((p) => p.staff);
  if (candidates.length === 0)
    return NextResponse.json({ error: "スタッフが見つかりません" }, { status: 404 });

  const date = starts_at.slice(0, 10);
  const from = `${date}T00:00:00+09:00`;
  const to = `${date}T23:59:59+09:00`;
  const [shifts, timeOffs, appointments, businessHours] = await Promise.all([
    getShifts(candidates.map((s) => s.id)),
    getTimeOff(salon.id, from, to),
    getAppointments(salon.id, from, to),
    getBusinessHours(salon.id),
  ]);

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
  const db = createServiceClient();

  // 顧客: 電話番号で find-or-create。既存顧客のプロフィールは無認証APIから上書きしない
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
      if (error?.code === "23505") {
        // customers(salon_id, phone)のユニーク制約との競合 = 同時初回予約
        const { data: again } = await db
          .from("customers")
          .select("id")
          .eq("salon_id", salon.id)
          .eq("phone", customer.phone)
          .single();
        if (!again)
          return NextResponse.json({ error: "顧客情報の取得に失敗しました" }, { status: 500 });
        customerId = again.id;
      } else if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        customerId = created.id;
      }
    }
  }

  const start = new Date(starts_at);
  const end = new Date(
    start.getTime() + (menu.duration_minutes + menu.buffer_minutes) * 60_000
  );

  // 事前決済/カード登録はサロンがStripe連携済みのときだけ。
  // 未連携なら現地払いに落とす
  const stripeReady =
    !!salon.stripe_account_id && salon.stripe_onboarded && !!getStripe();
  const usePrepaid = menu.payment_mode === "prepaid" && stripeReady;
  const useCardOnFile = menu.payment_mode === "card_on_file" && stripeReady;

  // フリーは先に埋まったスタッフで409にならないよう、他の候補で順に試す
  const tryOrder = [...slot.staffIds].sort(() => Math.random() - 0.5);
  let appt: {
    id: string;
    manage_token: string;
    staff_id: string;
    starts_at: string;
    ends_at: string;
  } | null = null;
  for (const sid of tryOrder) {
    const { data, error } = await db
      .from("appointments")
      .insert({
        salon_id: salon.id,
        staff_id: sid,
        customer_id: customerId,
        menu_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: "confirmed",
        channel,
        price: menu.price,
        customer_note: customer.notes?.trim() || null,
        payment_mode: usePrepaid
          ? "prepaid"
          : useCardOnFile
            ? "card_on_file"
            : "on_site",
      })
      .select("id, manage_token, staff_id, starts_at, ends_at")
      .single();
    if (!error) {
      appt = data;
      break;
    }
    // 排他制約違反 = 同時予約の競合。フリーなら次のスタッフ候補で試す
    if (error.code !== "23P01")
      return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!appt) {
    return NextResponse.json(
      { error: "先ほど別の方が同じ時間を予約しました。別の時間を選んでください。" },
      { status: 409 }
    );
  }

  const origin = new URL(req.url).origin;
  await notifyBooking(appt.id, "confirmed", { baseUrl: origin });

  let checkoutUrl: string | null = null;
  if (useCardOnFile) {
    // カード登録メニュー: 決済は当日なので登録導線だけ用意する。
    // 登録をサボられても予約自体は確定のまま(キャンセル料が取れないだけ)
    const stripeCustomerId = await ensureStripeCustomer(customerId);
    if (stripeCustomerId) {
      checkoutUrl = await createCardSetupSession({
        appointmentId: appt.id,
        manageToken: appt.manage_token,
        stripeCustomerId,
        origin,
      });
    }
    if (!checkoutUrl) {
      // 登録sessionを発行できなければ現地払いに落とす
      await db
        .from("appointments")
        .update({ payment_mode: "on_site", updated_at: new Date().toISOString() })
        .eq("id", appt.id);
    }
  }
  if (usePrepaid) {
    checkoutUrl = await createCheckoutSession({
      appointmentId: appt.id,
      manageToken: appt.manage_token,
      salonName: salon.name,
      menuName: menu.name,
      price: menu.price,
      feeBps:
        channel === "mall"
          ? salon.fee_rate_mall_bps
          : salon.fee_rate_direct_bps,
      destination: salon.stripe_account_id!,
      origin,
    });
    if (!checkoutUrl) {
      // セッション発行失敗でも予約は確定させる。支払いは現地扱いに戻す
      await db
        .from("appointments")
        .update({ payment_mode: "on_site", updated_at: new Date().toISOString() })
        .eq("id", appt.id);
      await db
        .from("payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("appointment_id", appt.id)
        .eq("status", "pending");
    }
  }

  return NextResponse.json({
    appointment: appt,
    manage_url: `/booking/${appt.manage_token}`,
    checkout_url: checkoutUrl,
  });
}
