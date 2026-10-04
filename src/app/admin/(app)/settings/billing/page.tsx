import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import BillingPanel from "./BillingPanel";

export default async function SettingsBillingPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  // 連携中アカウントの最新状態をStripeから取り直す
  let onboarded = ctx.salon.stripe_onboarded;
  const stripe = getStripe();
  if (stripe && ctx.salon.stripe_account_id) {
    try {
      const acct = await stripe.accounts.retrieve(ctx.salon.stripe_account_id);
      const fresh = acct.charges_enabled === true && acct.payouts_enabled === true;
      if (fresh !== onboarded) {
        onboarded = fresh;
        await createServiceClient()
          .from("salons")
          .update({ stripe_onboarded: fresh })
          .eq("id", ctx.salon.id);
      }
    } catch (e) {
      console.error("[stripe] account retrieve failed:", e);
    }
  }

  return (
    <div className="rounded-lg border hairline bg-card p-6">
      <BillingPanel
        configured={!!stripe}
        accountId={ctx.salon.stripe_account_id}
        onboarded={onboarded}
        feeBps={ctx.salon.fee_rate_direct_bps}
      />
    </div>
  );
}
