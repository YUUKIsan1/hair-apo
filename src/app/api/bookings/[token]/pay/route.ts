import { NextRequest, NextResponse } from "next/server";
import {
  createCardSetupSession,
  createCheckoutSession,
  ensureStripeCustomer,
} from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// POST /api/bookings/[token]/pay — 支払い待ちの予約にCheckout Sessionを(再)発行する
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const db = createServiceClient();

  const { data: appt } = await db
    .from("appointments")
    .select(
      "id, status, payment_mode, manage_token, channel, customer_id, stripe_payment_method_id, salons(name, stripe_account_id, stripe_onboarded, fee_rate_direct_bps, fee_rate_mall_bps), menus(name, price), payments(status)"
    )
    .eq("manage_token", token)
    .maybeSingle();
  if (!appt || appt.status === "cancelled") {
    return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
  }
  // card_on_file: 支払いではなくカード登録sessionを発行する
  if (appt.payment_mode === "card_on_file") {
    if (appt.stripe_payment_method_id) {
      return NextResponse.json({ error: "カードは登録済みです" }, { status: 400 });
    }
    const stripeCustomerId = await ensureStripeCustomer(appt.customer_id);
    if (!stripeCustomerId) {
      return NextResponse.json({ error: "決済設定がありません" }, { status: 400 });
    }
    const url = await createCardSetupSession({
      appointmentId: appt.id,
      manageToken: appt.manage_token,
      stripeCustomerId,
      origin: new URL(req.url).origin,
    });
    if (!url) {
      return NextResponse.json(
        { error: "決済セッションを作成できませんでした" },
        { status: 500 }
      );
    }
    return NextResponse.json({ checkout_url: url });
  }
  if (appt.payment_mode !== "prepaid") {
    return NextResponse.json({ error: "事前決済の予約ではありません" }, { status: 400 });
  }
  const salon = appt.salons as unknown as {
    name: string;
    stripe_account_id: string | null;
    stripe_onboarded: boolean;
    fee_rate_direct_bps: number;
    fee_rate_mall_bps: number;
  } | null;
  const menu = appt.menus as unknown as { name: string; price: number } | null;
  if (!salon?.stripe_account_id || !menu) {
    return NextResponse.json({ error: "決済設定がありません" }, { status: 400 });
  }
  const payments = (appt.payments as unknown as { status: string }[]) ?? [];
  if (payments.some((p) => p.status === "succeeded")) {
    return NextResponse.json({ error: "支払い済みです" }, { status: 400 });
  }

  const url = await createCheckoutSession({
    appointmentId: appt.id,
    manageToken: appt.manage_token,
    salonName: salon.name,
    menuName: menu.name,
    price: menu.price,
    feeBps:
      appt.channel === "mall"
        ? salon.fee_rate_mall_bps
        : salon.fee_rate_direct_bps,
    destination: salon.stripe_account_id,
    origin: new URL(req.url).origin,
  });
  if (!url) {
    return NextResponse.json({ error: "決済セッションを作成できませんでした" }, { status: 500 });
  }
  return NextResponse.json({ checkout_url: url });
}
