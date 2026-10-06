import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, refundAppointment } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// POST /api/webhooks/stripe — Stripeプラットフォームアカウントのイベント受信。
// 接続先(サロン)アカウントではなくプラットフォームのWebhookエンドポイントに登録する
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "設定されていません" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "署名がありません" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return NextResponse.json({ error: "署名が不正です" }, { status: 400 });
  }

  const db = createServiceClient();
  const now = new Date().toISOString();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // card_on_fileのカード登録完了: SetupIntentから支払い方法を取って
      // 予約に保存する(この時点では課金しない)
      if (session.mode === "setup") {
        const si =
          typeof session.setup_intent === "string"
            ? session.setup_intent
            : (session.setup_intent?.id ?? null);
        const appointmentId = session.metadata?.appointment_id;
        if (si && appointmentId) {
          const intent = await stripe.setupIntents.retrieve(si);
          const pm =
            typeof intent.payment_method === "string"
              ? intent.payment_method
              : (intent.payment_method?.id ?? null);
          if (pm) {
            const { error } = await db
              .from("appointments")
              .update({ stripe_payment_method_id: pm, updated_at: now })
              .eq("id", appointmentId);
            if (error) {
              console.error(`[webhook] card save failed: ${error.message}`);
              return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
            }
          }
        }
        break;
      }
      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      const { data: pay, error } = await db
        .from("payments")
        .update({
          status: "succeeded",
          stripe_payment_intent_id: pi,
          paid_at: now,
          updated_at: now,
        })
        .eq("stripe_checkout_session_id", session.id)
        .eq("status", "pending")
        .select("appointment_id")
        .maybeSingle();
      // 更新に失敗したまま200を返すとStripeの再送が止まるので500で受け付け直させる
      if (error) {
        console.error(`[webhook] completed update failed: ${error.message}`);
        return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
      }
      // 支払い直前にキャンセルされた予約なら即返金して帳尻を合わせる
      if (pay) {
        const { data: appt } = await db
          .from("appointments")
          .select("status")
          .eq("id", pay.appointment_id)
          .maybeSingle();
        if (appt?.status === "cancelled") {
          await refundAppointment(pay.appointment_id);
        }
      }
      break;
    }
    case "checkout.session.expired": {
      // 最新のsessionのみ対象(payments行のsession_idと一致する場合)。
      // 古いretry sessionのexpiredでは予約をキャンセルしない
      const session = event.data.object as Stripe.Checkout.Session;
      const { data: pay, error } = await db
        .from("payments")
        .update({ status: "failed", updated_at: now })
        .eq("stripe_checkout_session_id", session.id)
        .eq("status", "pending")
        .select("appointment_id")
        .maybeSingle();
      if (error) {
        console.error(`[webhook] expired update failed: ${error.message}`);
        return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
      }
      if (pay) {
        await db
          .from("appointments")
          .update({ status: "cancelled", updated_at: now })
          .eq("id", pay.appointment_id)
          .eq("status", "confirmed");
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const pi =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : (charge.payment_intent?.id ?? null);
      if (pi) {
        const { error } = await db
          .from("payments")
          .update({ status: "refunded", updated_at: now })
          .eq("stripe_payment_intent_id", pi)
          .eq("status", "succeeded");
        if (error) {
          console.error(`[webhook] refunded update failed: ${error.message}`);
          return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
