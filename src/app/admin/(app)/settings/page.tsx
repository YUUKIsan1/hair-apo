import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import LineCard from "./LineCard";
import SalonForm from "./SalonForm";

export default async function SettingsSalonPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border hairline bg-card p-6">
        <SalonForm
          initial={{
            name: ctx.salon.name,
            description: ctx.salon.description ?? "",
            phone: ctx.salon.phone ?? "",
            postal_code: ctx.salon.postal_code ?? "",
            address: ctx.salon.address ?? "",
            notify_email: ctx.salon.notify_email ?? "",
            cancel_deadline_hours: String(ctx.salon.cancel_deadline_hours),
            cancel_fee_rate_percent: String(ctx.salon.cancel_fee_rate_bps / 100),
          }}
          slug={ctx.salon.slug}
        />
      </div>
      <LineCard
        linked={Boolean(ctx.salon.line_user_id)}
        code={ctx.salon.line_link_code}
      />
    </div>
  );
}
