"use server";

import { headers } from "next/headers";
import { getAdminContext } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

async function origin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

// Stripe Expressアカウントを用意してオンボーディングリンクを返す
export async function startStripeConnect(): Promise<{
  url?: string;
  error?: string;
}> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "ログインしてください" };
  const stripe = getStripe();
  if (!stripe) {
    return { error: "Stripeが未設定です(STRIPE_SECRET_KEY)" };
  }
  const db = createServiceClient();
  const base = await origin();
  let accountId = ctx.salon.stripe_account_id;
  try {
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        country: "JP",
        email: ctx.salon.notify_email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = acct.id;
      const { error } = await db
        .from("salons")
        .update({ stripe_account_id: accountId })
        .eq("id", ctx.salon.id);
      if (error) return { error: error.message };
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/admin/settings/billing`,
      return_url: `${base}/admin/settings/billing?connected=1`,
      type: "account_onboarding",
    });
    return { url: link.url };
  } catch (e) {
    console.error("[stripe] connect failed:", e);
    return { error: "Stripe連携の開始に失敗しました" };
  }
}
