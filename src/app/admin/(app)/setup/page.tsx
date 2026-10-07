import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { getBusinessHours } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/server";
import SetupWizard from "./SetupWizard";

// 初期設定ウィザード — 新規サロンが予約を受け付けるまでに必要な
// 店舗情報・営業時間・スタッフ・メニューを順に設定する
export default async function SetupPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const db = createServiceClient();
  const [hours, { data: staff }, { data: menus }] = await Promise.all([
    getBusinessHours(ctx.salon.id),
    db
      .from("staff")
      .select("id, name, role")
      .eq("salon_id", ctx.salon.id)
      .eq("is_active", true)
      .order("sort_order"),
    db
      .from("menus")
      .select("id, name, price")
      .eq("salon_id", ctx.salon.id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <SetupWizard
        slug={ctx.salon.slug}
        salon={{
          name: ctx.salon.name,
          description: ctx.salon.description ?? "",
          phone: ctx.salon.phone ?? "",
          postal_code: ctx.salon.postal_code ?? "",
          address: ctx.salon.address ?? "",
          notify_email: ctx.salon.notify_email ?? "",
          cancel_deadline_hours: String(ctx.salon.cancel_deadline_hours),
          cancel_fee_rate_percent: String(
            Math.round(ctx.salon.cancel_fee_rate_bps / 100)
          ),
        }}
        initialHours={hours}
        initialStaff={staff ?? []}
        initialMenus={menus ?? []}
      />
    </div>
  );
}
