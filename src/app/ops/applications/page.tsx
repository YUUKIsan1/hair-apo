import Link from "next/link";
import { redirect } from "next/navigation";
import { dateLabelJst, dateOnlyJst } from "@/lib/format";
import { getOpsUser } from "@/lib/ops";
import { createServiceClient } from "@/lib/supabase/server";
import { approveApplication, rejectApplication } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "未対応",
  approved: "承認済み",
  rejected: "却下",
};

export default async function OpsApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getOpsUser();
  if (!user) redirect("/admin/login");

  const errMsg =
    typeof params.error === "string" && params.error ? params.error : null;

  const filter =
    params.status && ["pending", "approved", "rejected"].includes(params.status)
      ? params.status
      : "pending";

  const db = createServiceClient();
  const { data: apps } = await db
    .from("salon_applications")
    .select("*")
    .eq("status", filter)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-xl font-bold">導入申し込み</h1>
      {errMsg && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errMsg}
        </p>
      )}
      <div className="mt-3 flex gap-2 text-xs">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <Link
            key={s}
            href={`/ops/applications?status=${s}`}
            className={`rounded-full border hairline px-3 py-1 ${
              filter === s ? "bg-ink text-paper" : "bg-card text-mute"
            }`}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {!apps || apps.length === 0 ? (
          <p className="rounded-lg border hairline bg-card px-6 py-12 text-center text-sm text-mute">
            {STATUS_LABEL[filter]}の申し込みはありません
          </p>
        ) : (
          apps.map((a) => (
            <section
              key={a.id}
              className="rounded-lg border hairline bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{a.salon_name}</div>
                  <div className="mt-1 text-xs text-mute">
                    {a.contact_name} / {a.email}
                    {a.phone ? ` / ${a.phone}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-mute">
                    申込日 {dateLabelJst(dateOnlyJst(a.created_at))}
                    {a.staff_count ? ` / スタッフ${a.staff_count}名` : ""}
                    {a.slug ? ` / 希望URL /s/${a.slug}` : ""}
                  </div>
                  {a.note && (
                    <p className="mt-2 whitespace-pre-wrap text-xs">
                      {a.note}
                    </p>
                  )}
                  {a.created_salon_id && (
                    <p className="mt-2 text-xs text-emerald-700">
                      サロン作成済み
                      {a.accept_token
                        ? "・オーナーの有効化待ち"
                        : "・オーナー有効化済み"}
                    </p>
                  )}
                </div>
                {a.status === "pending" && (
                  <div className="flex items-center gap-2">
                    <form
                      action={approveApplication.bind(null, a.id)}
                      className="flex items-center gap-1"
                    >
                      <input
                        name="slug"
                        defaultValue={a.slug ?? ""}
                        placeholder="店舗URL(空なら自動)"
                        className="w-36 rounded-md border hairline bg-paper px-2 py-1.5 text-xs"
                      />
                      <button className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-85">
                        承認する
                      </button>
                    </form>
                    <form action={rejectApplication.bind(null, a.id)}>
                      <button className="rounded-md border hairline bg-card px-3 py-1.5 text-xs text-mute hover:bg-accent-soft">
                        却下
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
