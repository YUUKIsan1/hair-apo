import { createServiceClient } from "@/lib/supabase/server";

type Db = ReturnType<typeof createServiceClient>;
type Result = { error?: string };

// shifts_configured=false(シフトを一度も設定していない)のスタッフに、
// 営業時間と同じ週間シフトを初期値として入れる。
// 意図的に「全曜日休み」にしたスタッフや特定日シフトだけを持つ
// スタッフは shifts_configured=true なので対象にならない。
// 週間シフト行が既にあるのに未設定扱いのスタッフはフラグだけ戻す
export async function seedUnconfiguredShifts(
  db: Db,
  salonId: string,
  hours: { day_of_week: number; start_time: string; end_time: string }[]
): Promise<Result> {
  const { data: targets, error: tErr } = await db
    .from("staff")
    .select("id")
    .eq("salon_id", salonId)
    .eq("shifts_configured", false);
  if (tErr) return { error: tErr.message };
  const ids = (targets ?? []).map((t) => t.id);
  if (ids.length === 0 || hours.length === 0) return {};

  const { data: have, error: hErr } = await db
    .from("shifts")
    .select("staff_id")
    .in("staff_id", ids)
    .not("day_of_week", "is", null);
  if (hErr) return { error: hErr.message };
  const haveSet = new Set((have ?? []).map((s) => s.staff_id));
  const seed = ids
    .filter((id) => !haveSet.has(id))
    .flatMap((id) =>
      hours.map((r) => ({
        staff_id: id,
        day_of_week: r.day_of_week,
        start_time: r.start_time,
        end_time: r.end_time,
      }))
    );
  if (seed.length > 0) {
    const { error } = await db.from("shifts").insert(seed);
    if (error) return { error: error.message };
  }
  const { error: upErr } = await db
    .from("staff")
    .update({ shifts_configured: true })
    .in("id", ids);
  if (upErr) return { error: upErr.message };
  return {};
}
