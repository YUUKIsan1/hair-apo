import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";

// プラットフォーム(hair-apo運営)側のStripeキー。未設定なら決済機能は丸ごと無効
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

interface CheckoutArgs {
  appointmentId: string;
  manageToken: string;
  salonName: string;
  menuName: string;
  price: number;
  feeBps: number;
  destination: string; // サロンのstripe_account_id
  origin: string;
}

// 事前決済用のCheckout Sessionを発行し、payments行を用意して最新sessionで更新する。
// 返り値は遷移先URL。失敗時はnull(呼び出し側で現地扱いにフォールバック等)
export async function createCheckoutSession(
  a: CheckoutArgs
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const db = createServiceClient();
  const now = new Date().toISOString();
  const fee = Math.floor((a.price * a.feeBps) / 10000);

  try {
    // payments行は予約1件に1つの想定。pending/failedなら再利用、
    // succeeded/refundedは再支払い不要・再返金不可なので新規sessionを作らない
    const { data: pay } = await db
      .from("payments")
      .select("id, status, stripe_checkout_session_id")
      .eq("appointment_id", a.appointmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pay && (pay.status === "succeeded" || pay.status === "refunded")) {
      return null;
    }
    const paymentId =
      pay?.id ??
      (
        await db
          .from("payments")
          .insert({
            appointment_id: a.appointmentId,
            amount: a.price,
            application_fee_amount: fee,
            status: "pending",
          })
          .select("id")
          .single()
      ).data?.id;
    if (!paymentId) return null;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // paypayも選べる。支払い方法はStripeダッシュボード側の有効化も必要
      payment_method_types: ["card", "paypay"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "jpy",
            unit_amount: a.price,
            product_data: { name: `${a.salonName} — ${a.menuName}` },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: a.destination },
        metadata: { appointment_id: a.appointmentId },
      },
      client_reference_id: a.appointmentId,
      metadata: { appointment_id: a.appointmentId },
      success_url: `${a.origin}/booking/${a.manageToken}?paid=1`,
      cancel_url: `${a.origin}/booking/${a.manageToken}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // Stripe最小値は30分
    });
    // 新しいsessionを指す前に旧sessionを失効させる。
    // 残したままだと古いsession経由の支払いがwebhookで照合できず宙に浮く
    if (
      pay?.stripe_checkout_session_id &&
      pay.stripe_checkout_session_id !== session.id
    ) {
      try {
        await stripe.checkout.sessions.expire(pay.stripe_checkout_session_id);
      } catch (e) {
        console.error("[stripe] old session expire failed:", e);
      }
    }
    const pi =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    const { error } = await db
      .from("payments")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: pi,
        updated_at: now,
      })
      .eq("id", paymentId);
    if (error) {
      console.error(`[stripe] payment row update failed: ${error.message}`);
      return null;
    }
    return session.url;
  } catch (e) {
    console.error("[stripe] checkout session failed:", e);
    return null;
  }
}

// キャンセル時に未決済のCheckout Sessionを失効させ、後から支払えないようにする
export async function expirePendingCheckout(
  appointmentId: string
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;
  const db = createServiceClient();
  const { data: pay } = await db
    .from("payments")
    .select("id, status, stripe_checkout_session_id")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pay?.status !== "pending" || !pay.stripe_checkout_session_id) return;
  try {
    await stripe.checkout.sessions.expire(pay.stripe_checkout_session_id);
  } catch (e) {
    console.error(`[stripe] expire failed for ${appointmentId}:`, e);
  }
}

// キャンセル/ノーショー時の返金。feeRateBps分をキャンセル料として残し、
// 残額だけ返金する。未払い/キー未設定/対象外なら何もしない。
// cancel_fee_amountは初回に保存するので、リトライ時に料率が変わっても同じ額を引く
export async function refundAppointment(
  appointmentId: string,
  feeRateBps = 0
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;
  const db = createServiceClient();
  const { data: pay } = await db
    .from("payments")
    .select("id, stripe_payment_intent_id, status, amount, cancel_fee_amount")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pay?.stripe_payment_intent_id || pay.status !== "succeeded") return;
  const fee =
    pay.cancel_fee_amount || Math.floor((pay.amount * feeRateBps) / 10000);
  // Stripe呼出前に料金を固定保存する。返金失敗時のリトライが
  // fee=0(全額返金)で走らないようにするため
  if (!pay.cancel_fee_amount && fee > 0) {
    await db
      .from("payments")
      .update({ cancel_fee_amount: fee })
      .eq("id", pay.id);
  }
  const refundAmount = pay.amount - fee;
  try {
    if (refundAmount > 0) {
      await stripe.refunds.create({
        payment_intent: pay.stripe_payment_intent_id,
        amount: refundAmount,
        reverse_transfer: true,
        refund_application_fee: true,
      });
    }
    await db
      .from("payments")
      .update({
        status: "refunded",
        cancel_fee_amount: fee,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pay.id);
  } catch (e) {
    console.error(`[stripe] refund failed for ${appointmentId}:`, e);
  }
}
