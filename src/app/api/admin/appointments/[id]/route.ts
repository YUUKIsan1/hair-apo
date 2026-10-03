import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

const STATUSES = ["confirmed", "cancelled", "completed", "no_show"] as const;

// PATCH /api/admin/appointments/[id] — 台帳からのステータス更新
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = (await req.json()) as { status?: string };
  if (!status || !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: appt } = await db
    .from("appointments")
    .select("id, salon_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!appt || appt.salon_id !== ctx.salon.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await db
    .from("appointments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    // confirmedへ戻す際に枠が埋まっていた場合の排他制約違反
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "その時間帯には別の予約が入っています" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
