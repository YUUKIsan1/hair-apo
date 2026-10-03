import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { getBusinessHours } from "@/lib/queries";
import HoursForm from "./HoursForm";

export default async function SettingsHoursPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const hours = await getBusinessHours(ctx.salon.id);
  return (
    <div className="rounded-xl border hairline bg-card p-6">
      <HoursForm initial={hours} />
    </div>
  );
}
