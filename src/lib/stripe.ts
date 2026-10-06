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
// (支払い用とカード登録用の両方のsessionを対象にする)
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
  const { data: appt } = await db
    .from("appointments")
    .select("stripe_setup_session_id, stripe_payment_method_id")
    .eq("id", appointmentId)
    .maybeSingle();
  const sessionIds = [
    pay?.status === "pending" ? pay.stripe_checkout_session_id : null,
    // 登録済みなら新しいカード登録sessionは不要
    appt?.stripe_payment_method_id ? null : appt?.stripe_setup_session_id,
  ];
  for (const sid of sessionIds) {
    if (!sid) continue;
    try {
      await stripe.checkout.sessions.expire(sid);
    } catch (e) {
      console.error(`[stripe] expire failed for ${appointmentId}:`, e);
    }
  }
}

// card_on_file: 顧客のStripe Customerを(なければ作って)返す。
// Customerはプラットフォームアカウント側に作成 — 事前決済と同じ
// transfer_data方式で接続先サロンへ課金するため
export async function ensureStripeCustomer(
  customerId: string
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const db = createServiceClient();
  const { data: c } = await db
    .from("customers")
    .select("id, stripe_customer_id, name, email, phone")
    .eq("id", customerId)
    .maybeSingle();
  if (!c) return null;
  if (c.stripe_customer_id?.startsWith("cus_")) return c.stripe_customer_id;
  // 並行してStripe Customerを二重作成しないよう、"creating" を先に書いて
  // 作成権を取る(負けた側は実IDが入るまで待つ)。書けなかったCustomerは
  // 孤児になるとカードの登録先とDBが食い違って請求に失敗するため
  const { data: claimed } = await db
    .from("customers")
    .update({ stripe_customer_id: "creating" })
    .eq("id", c.id)
    .is("stripe_customer_id", null)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    // 他の処理が作成中(またはさっき完成した)。実IDが入るまで待つ
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const { data: again } = await db
        .from("customers")
        .select("stripe_customer_id")
        .eq("id", c.id)
        .maybeSingle();
      if (again?.stripe_customer_id?.startsWith("cus_")) {
        return again.stripe_customer_id;
      }
    }
    // "creating"が残ったまま = 途中で落ちた可能性。引き継いで作り直す
    const { data: stole } = await db
      .from("customers")
      .update({ stripe_customer_id: "creating" })
      .eq("id", c.id)
      .eq("stripe_customer_id", "creating")
      .select("id")
      .maybeSingle();
    if (!stole) return null;
  }
  try {
    const sc = await stripe.customers.create({
      name: c.name,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      metadata: { customer_id: c.id },
    });
    const { error } = await db
      .from("customers")
      .update({ stripe_customer_id: sc.id })
      .eq("id", c.id);
    if (error) {
      // 保存失敗で孤児Customerになるので印を戻して次回に任せる
      await db
        .from("customers")
        .update({ stripe_customer_id: null })
        .eq("id", c.id);
      console.error(`[stripe] customer id save failed: ${error.message}`);
      return null;
    }
    return sc.id;
  } catch (e) {
    await db
      .from("customers")
      .update({ stripe_customer_id: null })
      .eq("id", c.id)
      .eq("stripe_customer_id", "creating");
    console.error(`[stripe] customer create failed:`, e);
    return null;
  }
}

// card_on_file: カード登録用のSetupモードCheckout Sessionを発行する。
// 返り値は遷移先URL。登録されたカードはキャンセル料/ノーショー料の請求に使う
export async function createCardSetupSession(a: {
  appointmentId: string;
  manageToken: string;
  stripeCustomerId: string;
  origin: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const db = createServiceClient();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      currency: "jpy",
      customer: a.stripeCustomerId,
      payment_method_types: ["card"],
      setup_intent_data: {
        metadata: { appointment_id: a.appointmentId },
      },
      metadata: { appointment_id: a.appointmentId },
      success_url: `${a.origin}/booking/${a.manageToken}?card=1`,
      cancel_url: `${a.origin}/booking/${a.manageToken}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    // 旧setup sessionを失効させる。残すと古いsession経由の登録が
    // webhookで最新か分からなくなる
    const { data: appt } = await db
      .from("appointments")
      .select("stripe_setup_session_id")
      .eq("id", a.appointmentId)
      .maybeSingle();
    if (
      appt?.stripe_setup_session_id &&
      appt.stripe_setup_session_id !== session.id
    ) {
      try {
        await stripe.checkout.sessions.expire(appt.stripe_setup_session_id);
      } catch (e) {
        console.error("[stripe] old setup session expire failed:", e);
      }
    }
    await db
      .from("appointments")
      .update({ stripe_setup_session_id: session.id })
      .eq("id", a.appointmentId);
    return session.url;
  } catch (e) {
    console.error("[stripe] card setup session failed:", e);
    return null;
  }
}

// card_on_file: 登録済みカードへキャンセル料/ノーショー料をオフセッション請求。
// feeRateBps = サロンのキャンセル料率、appFeeBps = プラットフォーム手数料率。
// payments行に記録するので台帳・請求と同じ場所で見える
export async function chargeCardCancelFee(
  appointmentId: string,
  feeRateBps: number,
  appFeeBps: number
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;
  const db = createServiceClient();
  const { data: appt } = await db
    .from("appointments")
    .select(
      "id, price, stripe_payment_method_id, customers(stripe_customer_id), salons(stripe_account_id)"
    )
    .eq("id", appointmentId)
    .maybeSingle();
  const cust = appt?.customers as unknown as {
    stripe_customer_id: string | null;
  } | null;
  const salon = appt?.salons as unknown as {
    stripe_account_id: string | null;
  } | null;
  if (
    !appt?.stripe_payment_method_id ||
    !cust?.stripe_customer_id ||
    !salon?.stripe_account_id
  ) {
    return;
  }
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("payments")
    .select("id, status, amount, application_fee_amount")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let paymentId: string;
  let amount: number;
  let appFee: number;
  if (existing) {
    // succeeded=請求済み、failed=カード拒否の確定失敗でここで終わる。
    // pendingは「請求中」か「成功後のDB保存や通信で中断した残り」。
    // 同じ冪等キーで作り直せばStripe側は同じPaymentIntentを返すので、
    // 再実行がそのまま台帳の復旧になる(二重請求にはならない)
    if (existing.status !== "pending") return;
    paymentId = existing.id;
    amount = existing.amount;
    appFee = existing.application_fee_amount;
  } else {
    if (feeRateBps <= 0) return;
    amount = Math.floor(((appt.price ?? 0) * feeRateBps) / 10000);
    if (amount <= 0) return;
    appFee = Math.floor((amount * appFeeBps) / 10000);
    // payments行は予約1件に1つ(unique index)。請求中を表すpending行を
    // 先に立てる — 同時実行はinsertに負けた方が戻る
    const { data: row, error } = await db
      .from("payments")
      .insert({
        appointment_id: appointmentId,
        amount,
        application_fee_amount: appFee,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !row) return;
    paymentId = row.id;
  }
  try {
    // 予約単位の冪等キー: 応答喪失後の再試行や並行実行でも
    // Stripe側は同じ請求として1回しか課金しない
    const pi = await stripe.paymentIntents.create(
      {
        amount,
        currency: "jpy",
        customer: cust.stripe_customer_id,
        payment_method: appt.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        application_fee_amount: appFee,
        transfer_data: { destination: salon.stripe_account_id },
        metadata: { appointment_id: appointmentId, kind: "cancel_fee" },
      },
      { idempotencyKey: `cancel-fee-${appointmentId}` }
    );
    const { error } = await db
      .from("payments")
      .update({
        status: "succeeded",
        stripe_payment_intent_id: pi.id,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);
    if (error) {
      console.error(
        `[stripe] payment row update failed for ${appointmentId}: ${error.message}`
      );
    }
  } catch (e) {
    // カード拒否だけは確定失敗としてfailedに倒す。通信喪失など
    // 結果不明のエラーはpendingのまま残し、次の呼び出し(cronの
    // スイープや再実行)が同じ冪等キーで結果を拾って復旧する
    if ((e as { type?: string }).type === "StripeCardError") {
      await db
        .from("payments")
        .update({ status: "failed", updated_at: now })
        .eq("id", paymentId);
    }
    console.error(`[stripe] cancel fee charge failed for ${appointmentId}:`, e);
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
    .select(
      "id, stripe_payment_intent_id, status, amount, cancel_fee_amount, appointments(payment_mode)"
    )
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // card_on_fileのpayments行はキャンセル料の「請求」行で返金対象ではない。
  // ここで返すとcronの返金スイープが料金をまるごと客に返してしまう
  const mode = (pay?.appointments as unknown as { payment_mode: string } | null)
    ?.payment_mode;
  if (mode === "card_on_file") return;
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
