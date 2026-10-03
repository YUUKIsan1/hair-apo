import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import DesignForm from "./DesignForm";

export default async function SettingsDesignPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  return (
    <div className="rounded-lg border hairline bg-card p-6">
      <DesignForm
        initialTemplate={ctx.salon.template}
        initialColor={ctx.salon.theme_color}
        heroImageUrl={ctx.salon.hero_image_url}
        slug={ctx.salon.slug}
      />
    </div>
  );
}
