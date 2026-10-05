"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin";
import { newLinkCode } from "@/lib/line";
import { createServiceClient } from "@/lib/supabase/server";

type Result = { error?: string };

async function requireCtx() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  return ctx;
}

const TIME_RE = /^\d{2}:\d{2}$/;

// ---- 店舗情報 ----

export async function updateSalon(input: {
  name: string;
  description: string;
  phone: string;
  postal_code: string;
  address: string;
  notify_email: string;
  cancel_deadline_hours: string;
  cancel_fee_rate_percent: string;
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  if (!input.name.trim()) return { error: "店舗名は必須です" };

  const deadline = Number(input.cancel_deadline_hours);
  if (!Number.isInteger(deadline) || deadline < 0 || deadline > 720) {
    return { error: "キャンセル期限は0〜720時間で指定してください" };
  }
  const feePct = Number(input.cancel_fee_rate_percent);
  if (!Number.isInteger(feePct) || feePct < 0 || feePct > 100) {
    return { error: "キャンセル料率は0〜100%で指定してください" };
  }

  const { error } = await createServiceClient()
    .from("salons")
    .update({
      name: input.name.trim(),
      description: input.description.trim() || null,
      phone: input.phone.trim() || null,
      postal_code: input.postal_code.trim() || null,
      address: input.address.trim() || null,
      notify_email: input.notify_email.trim() || null,
      cancel_deadline_hours: deadline,
      cancel_fee_rate_bps: feePct * 100,
    })
    .eq("id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- 営業時間 ----

export async function saveBusinessHours(
  rows: { day_of_week: number; start_time: string; end_time: string }[]
): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  for (const r of rows) {
    if (!TIME_RE.test(r.start_time) || !TIME_RE.test(r.end_time)) {
      return { error: "時刻の形式が正しくありません" };
    }
    if (r.end_time <= r.start_time) {
      return { error: "終了時刻は開始時刻より後にしてください" };
    }
  }

  const db = createServiceClient();
  // 先に新しい行を書き込み、残っていない曜日だけ後から消す。
  // delete→insert の順だと insert 失敗時に営業時間が全部消える
  if (rows.length > 0) {
    const { error } = await db
      .from("business_hours")
      .upsert(
        rows.map((r) => ({ ...r, salon_id: ctx.salon.id })),
        { onConflict: "salon_id,day_of_week" }
      );
    if (error) return { error: error.message };
  }
  let del = db.from("business_hours").delete().eq("salon_id", ctx.salon.id);
  if (rows.length > 0) {
    del = del.not(
      "day_of_week",
      "in",
      `(${rows.map((r) => r.day_of_week).join(",")})`
    );
  }
  const { error: delErr } = await del;
  if (delErr) return { error: delErr.message };
  revalidatePath("/admin/settings/hours");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- スタッフ ----

export async function upsertStaff(input: {
  id?: string;
  name: string;
  role: "owner" | "stylist" | "assistant";
  bio: string;
  sort_order: number;
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  if (!input.name.trim()) return { error: "名前は必須です" };

  const db = createServiceClient();
  if (input.id) {
    const { error } = await db
      .from("staff")
      .update({
        name: input.name.trim(),
        role: input.role,
        bio: input.bio.trim() || null,
        sort_order: input.sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("salon_id", ctx.salon.id);
    if (error) return { error: error.message };
  } else {
    const { data: created, error } = await db
      .from("staff")
      .insert({
        salon_id: ctx.salon.id,
        name: input.name.trim(),
        role: input.role,
        bio: input.bio.trim() || null,
        sort_order: input.sort_order,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    // 新規スタッフは全メニュー担当可・指名可で作成(メニュー画面で調整)
    const { data: menus } = await db
      .from("menus")
      .select("id")
      .eq("salon_id", ctx.salon.id);
    if (menus && menus.length > 0) {
      const { error: smErr } = await db.from("staff_menus").insert(
        menus.map((m) => ({
          staff_id: created.id,
          menu_id: m.id,
          nominable: true,
        }))
      );
      if (smErr) {
        // メニュー割当なしのスタッフが残らないようロールバック
        await db.from("staff").delete().eq("id", created.id);
        return { error: smErr.message };
      }
    }
  }
  revalidatePath("/admin/settings/staff");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

export async function setStaffActive(
  staffId: string,
  active: boolean
): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  const { error } = await createServiceClient()
    .from("staff")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", staffId)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/staff");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- メニュー ----

export async function upsertMenu(input: {
  id?: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  buffer_minutes: number;
  sort_order: number;
  payment_mode: "on_site" | "prepaid";
  staff: { staff_id: string; nominable: boolean }[];
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  if (!input.name.trim()) return { error: "メニュー名は必須です" };
  if (input.price < 0 || input.duration_minutes <= 0 || input.buffer_minutes < 0) {
    return { error: "価格・所要時間が不正です" };
  }
  if (input.payment_mode !== "on_site" && input.payment_mode !== "prepaid") {
    return { error: "決済方法が不正です" };
  }
  if (input.staff.length === 0) {
    return { error: "担当スタッフを1人以上選んでください" };
  }

  const db = createServiceClient();
  let menuId = input.id;
  const fields = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    price: input.price,
    duration_minutes: input.duration_minutes,
    buffer_minutes: input.buffer_minutes,
    sort_order: input.sort_order,
    payment_mode: input.payment_mode,
  };
  if (menuId) {
    const { error } = await db
      .from("menus")
      .update(fields)
      .eq("id", menuId)
      .eq("salon_id", ctx.salon.id);
    if (error) return { error: error.message };
  } else {
    const { data: created, error } = await db
      .from("menus")
      .insert({
        ...fields,
        salon_id: ctx.salon.id,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    menuId = created.id;
  }

  // staff_menus は「有効スタッフの分だけ」選択状態で置き換え。
  // 非表示スタッフの担当割当はフォームに出ないので残す
  const { data: activeStaff } = await db
    .from("staff")
    .select("id")
    .eq("salon_id", ctx.salon.id)
    .eq("is_active", true);
  const activeIds = (activeStaff ?? []).map((s) => s.id);
  // 他店舗・非表示スタッフのIDを送りつけられても割り当てない
  if (input.staff.some((s) => !activeIds.includes(s.staff_id))) {
    return { error: "担当者にこの店舗の有効なスタッフ以外が含まれています" };
  }
  if (activeIds.length > 0) {
    const { error: delErr } = await db
      .from("staff_menus")
      .delete()
      .eq("menu_id", menuId)
      .in("staff_id", activeIds);
    if (delErr) return { error: delErr.message };
  }
  const { error: insErr } = await db.from("staff_menus").insert(
    input.staff.map((s) => ({
      menu_id: menuId,
      staff_id: s.staff_id,
      nominable: s.nominable,
    }))
  );
  if (insErr) return { error: insErr.message };

  revalidatePath("/admin/settings/menus");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

export async function setMenuActive(
  menuId: string,
  active: boolean
): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  const { error } = await createServiceClient()
    .from("menus")
    .update({ is_active: active })
    .eq("id", menuId)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/menus");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- シフト ----

// 曜日繰り返しシフトを保存(特定日のシフトは消さない)
export async function saveShifts(
  staffId: string,
  rows: { day_of_week: number; start_time: string; end_time: string }[]
): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  for (const r of rows) {
    if (!TIME_RE.test(r.start_time) || !TIME_RE.test(r.end_time)) {
      return { error: "時刻の形式が正しくありません" };
    }
    if (r.end_time <= r.start_time) {
      return { error: "終了時刻は開始時刻より後にしてください" };
    }
  }

  const db = createServiceClient();
  const { data: staff } = await db
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("salon_id", ctx.salon.id)
    .maybeSingle();
  if (!staff) return { error: "スタッフが見つかりません" };

  const { data: oldShifts, error: oldErr } = await db
    .from("shifts")
    .select("id")
    .eq("staff_id", staffId)
    .not("day_of_week", "is", null);
  if (oldErr) return { error: oldErr.message };
  // 先に新しい行を入れ、旧行はid指定で後から消す。
  // delete→insert の順だと insert 失敗時に週間シフトが全部消える
  if (rows.length > 0) {
    const { error } = await db
      .from("shifts")
      .insert(rows.map((r) => ({ ...r, staff_id: staffId })));
    if (error) return { error: error.message };
  }
  if (oldShifts && oldShifts.length > 0) {
    const { error: delErr } = await db
      .from("shifts")
      .delete()
      .in("id", oldShifts.map((s) => s.id));
    if (delErr) return { error: delErr.message };
  }
  revalidatePath("/admin/settings/shifts");
  return {};
}

// ---- 休み(特定日時) ----

export async function addTimeOff(input: {
  staff_id: string | null; // null = 店休
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { error: "日付が不正です" };
  }
  if (!TIME_RE.test(input.start_time) || !TIME_RE.test(input.end_time)) {
    return { error: "時刻の形式が正しくありません" };
  }
  if (input.end_time <= input.start_time) {
    return { error: "終了時刻は開始時刻より後にしてください" };
  }

  const db = createServiceClient();
  if (input.staff_id) {
    const { data: st } = await db
      .from("staff")
      .select("id")
      .eq("id", input.staff_id)
      .eq("salon_id", ctx.salon.id)
      .maybeSingle();
    if (!st) return { error: "スタッフが見つかりません" };
  }
  const { error } = await db.from("time_off").insert({
    salon_id: ctx.salon.id,
    staff_id: input.staff_id,
    starts_at: `${input.date}T${input.start_time}:00+09:00`,
    ends_at: `${input.date}T${input.end_time}:00+09:00`,
    reason: input.reason.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/shifts");
  return {};
}

export async function deleteTimeOff(id: string): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  const { error } = await createServiceClient()
    .from("time_off")
    .delete()
    .eq("id", id)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/shifts");
  return {};
}

// ---- ページデザイン ----

const TEMPLATES = ["photo", "card", "simple"] as const;

export async function updateSalonDesign(input: {
  template: string;
  theme_color: string;
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  if (!(TEMPLATES as readonly string[]).includes(input.template)) {
    return { error: "テンプレートが不正です" };
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.theme_color)) {
    return { error: "カラーは #RRGGBB 形式で指定してください" };
  }

  const { error } = await createServiceClient()
    .from("salons")
    .update({ template: input.template, theme_color: input.theme_color })
    .eq("id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/design");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// 宣言MIMEだけでなく先頭バイトも検査する
function isRealImage(buf: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (type === "image/png")
    return (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    );
  if (type === "image/webp")
    return (
      buf.length > 11 &&
      buf[0] === 0x52 && // R
      buf[1] === 0x49 && // I
      buf[2] === 0x46 && // F
      buf[3] === 0x46 && // F
      buf[8] === 0x57 && // W
      buf[9] === 0x45 && // E
      buf[10] === 0x42 && // B
      buf[11] === 0x50 // P
    );
  return false;
}

export async function uploadHeroImage(formData: FormData): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "認証されていません" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "ファイルを選択してください" };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: "JPEG / PNG / WebP のみアップロードできます" };
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "5MB以下の画像を選択してください" };
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!isRealImage(head, file.type)) {
    return { error: "画像ファイルが壊れているか形式が一致しません" };
  }

  const db = createServiceClient();
  const path = `${ctx.salon.id}/hero-${Date.now()}.${ext}`;
  const { error: upErr } = await db.storage
    .from("salon-assets")
    .upload(path, file, { contentType: file.type });
  if (upErr) return { error: upErr.message };

  const {
    data: { publicUrl },
  } = db.storage.from("salon-assets").getPublicUrl(path);
  const { error } = await db
    .from("salons")
    .update({ hero_image_url: publicUrl })
    .eq("id", ctx.salon.id);
  if (error) return { error: error.message };

  // 差し替えで古い画像が溜まらないよう掃除(失敗しても本体は成功させる)
  const prefix = "/storage/v1/object/public/salon-assets/";
  const oldUrl = ctx.salon.hero_image_url;
  if (oldUrl?.includes(prefix)) {
    const oldPath = oldUrl.slice(oldUrl.indexOf(prefix) + prefix.length);
    if (oldPath.startsWith(`${ctx.salon.id}/`)) {
      await db.storage.from("salon-assets").remove([oldPath]);
    }
  }

  revalidatePath("/admin/settings/design");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- LINE連携 ----

// 連携コードを発行/再発行する。サロンはLINE公式アカウントに
// このコードをトーク送信すると通知がLINEに届くようになる
export async function issueLineLinkCode(): Promise<void> {
  const ctx = await requireCtx();
  if (!ctx) return;
  const db = createServiceClient();
  const { error } = await db
    .from("salons")
    .update({ line_link_code: newLinkCode() })
    .eq("id", ctx.salon.id);
  if (error) {
    console.error(`[settings] issueLineLinkCode failed:`, error);
    return;
  }
  revalidatePath("/admin/settings");
}

// LINE連携を解除する
export async function unlinkLine(): Promise<void> {
  const ctx = await requireCtx();
  if (!ctx) return;
  const db = createServiceClient();
  const { error } = await db
    .from("salons")
    .update({ line_user_id: null })
    .eq("id", ctx.salon.id);
  if (error) {
    console.error(`[settings] unlinkLine failed:`, error);
    return;
  }
  revalidatePath("/admin/settings");
}
