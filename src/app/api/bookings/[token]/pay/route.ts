import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/stripe";
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
      "id, status, payment_mode, manage_token, salons(name, stripe_account_id, stripe_onboarded, fee_rate_direct_bps), menus(name, price), payments(status)"
    )
    .eq("manage_token", token)
    .maybeSingle();
  if (!appt || appt.status === "cancelled") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (appt.payment_mode !== "prepaid") {
    return NextResponse.json({ error: "事前決済の予約ではありません" }, { status: 400 });
  }
  const salon = appt.salons as unknown as {
    name: string;
    stripe_account_id: string | null;
    stripe_onboarded: boolean;
    fee_rate_direct_bps: number;
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
    feeBps: salon.fee_rate_direct_bps,
    destination: salon.stripe_account_id,
    origin: new URL(req.url).origin,
  });
  if (!url) {
    return NextResponse.json({ error: "決済セッションを作成できませんでした" }, { status: 500 });
  }
  return NextResponse.json({ checkout_url: url });
}
