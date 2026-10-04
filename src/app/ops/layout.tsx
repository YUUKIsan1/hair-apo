import { redirect } from "next/navigation";
import LogoutButton from "@/app/admin/(app)/LogoutButton";
import { getOpsUser } from "@/lib/ops";
import OpsNav from "./OpsNav";

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getOpsUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="min-h-dvh">
      <header className="border-b hairline bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <span className="text-base font-semibold tracking-wide">
            hair-apo ops
          </span>
          <OpsNav />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-mute sm:inline">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
