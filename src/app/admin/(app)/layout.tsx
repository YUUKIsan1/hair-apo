import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import AdminNav from "./AdminNav";
import LogoutButton from "./LogoutButton";

export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  return (
    <div className="min-h-dvh">
      <header className="border-b hairline bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <span className="text-base font-semibold tracking-wide">
            {ctx.salon.name}
          </span>
          <AdminNav />
          <div className="ml-auto flex items-center gap-3">
            <a
              href={`/s/${ctx.salon.slug}`}
              target="_blank"
              className="hidden text-xs text-mute underline-offset-2 hover:underline sm:inline"
            >
              予約ページを見る
            </a>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
