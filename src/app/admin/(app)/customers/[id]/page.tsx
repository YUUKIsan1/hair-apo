import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { dateLabelJst, dateOnlyJst, timeJst, yen } from "@/lib/format";
import { getStaffList } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/server";
import type { Kart } from "@/lib/types";
import CustomerForm from "./CustomerForm";
import KarteSection from "./KarteSection";

interface ApptRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  menus: { name: string; price: number } | null;
  staff: { name: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "予約確定",
  completed: "完了",
  cancelled: "キャンセル",
  no_show: "ノーショー",
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-accent-soft text-accent-dark",
  completed: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-neutral-100 text-neutral-500",
  no_show: "bg-red-50 text-red-700",
};

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ karte?: string }>;
}) {
  const { id } = await params;
  const { karte: prefillAppointmentId } = await searchParams;
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const db = createServiceClient();
  const [{ data: customer }, { data: appointments }, { data: kartes }, staffList] =
    await Promise.all([
      db
        .from("customers")
        .select("*")
        .eq("id", id)
        .eq("salon_id", ctx.salon.id)
        .maybeSingle(),
      db
        .from("appointments")
        .select("id, starts_at, ends_at, status, menus(name, price), staff(name)")
        .eq("salon_id", ctx.salon.id)
        .eq("customer_id", id)
        .order("starts_at", { ascending: false }),
      db
        .from("karts")
        .select("*")
        .eq("salon_id", ctx.salon.id)
        .eq("customer_id", id)
        .order("visited_at", { ascending: false }),
      getStaffList(ctx.salon.id),
    ]);

  if (!customer) notFound();
  const appts = (appointments ?? []) as unknown as ApptRow[];

  const karteApptIds = new Set(
    ((kartes ?? []) as Kart[]).map((k) => k.appointment_id).filter(Boolean)
  );

  return (
    <div>
      <div className="text-sm text-mute">
        <Link href="/admin/customers" className="hover:text-ink">
          ← 顧客一覧
        </Link>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-xl border hairline bg-card p-5">
            <CustomerForm customer={customer} />
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border hairline bg-card">
            <h2 className="border-b hairline px-5 py-3 text-sm font-medium">
              来店履歴
            </h2>
            {appts.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-mute">
                来店履歴はありません
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b hairline text-left text-xs text-mute">
                      <th className="px-5 py-2.5 font-medium">日時</th>
                      <th className="px-5 py-2.5 font-medium">メニュー</th>
                      <th className="px-5 py-2.5 font-medium">担当</th>
                      <th className="px-5 py-2.5 font-medium">状態</th>
                      <th className="px-5 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {appts.map((a) => (
                      <tr
                        key={a.id}
                        className={`border-b hairline last:border-0 ${
                          a.status === "cancelled" || a.status === "no_show"
                            ? "opacity-55"
                            : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-5 py-3">
                          <div className="font-medium">
                            {dateLabelJst(dateOnlyJst(a.starts_at))}
                          </div>
                          <div className="text-xs text-mute tabular-nums">
                            {timeJst(a.starts_at)}–{timeJst(a.ends_at)}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div>{a.menus?.name}</div>
                          <div className="text-xs text-mute">
                            {a.menus ? yen(a.menus.price) : ""}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          {a.staff?.name}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[a.status]}`}
                          >
                            {STATUS_LABEL[a.status] ?? a.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right text-xs text-mute">
                          {a.status === "completed" &&
                            !karteApptIds.has(a.id) && (
                              <Link
                                href={`/admin/customers/${id}?karte=${a.id}`}
                                className="underline-offset-2 hover:underline"
                              >
                                カルテを書く
                              </Link>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <KarteSection
            customerId={id}
            kartes={(kartes ?? []) as Kart[]}
            appointments={appts.map((a) => ({
              id: a.id,
              label: `${dateLabelJst(dateOnlyJst(a.starts_at))} ${timeJst(a.starts_at)} ${a.menus?.name ?? ""}`,
              starts_at: a.starts_at,
              staff_name: a.staff?.name ?? null,
            }))}
            staffList={staffList.map((s) => ({ id: s.id, name: s.name }))}
            prefillAppointmentId={prefillAppointmentId ?? null}
          />
        </div>
      </div>
    </div>
  );
}
