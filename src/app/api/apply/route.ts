import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

// サロン導入の申し込み受付(認証不要)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  // ボット対策のハニーポット。人間には見えない入力に値が入っていたら
  // エラーにせず成功を装って捨てる
  if (body.company) {
    return NextResponse.json({ ok: true });
  }

  const salonName = String(body.salon_name ?? "").trim();
  const contactName = String(body.contact_name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim() || null;
  const note = String(body.note ?? "").trim() || null;
  const slug = String(body.slug ?? "").trim().toLowerCase() || null;
  const staffCount =
    body.staff_count === null || body.staff_count === undefined || body.staff_count === ""
      ? null
      : Number(body.staff_count);

  if (!salonName || salonName.length > 100) {
    return NextResponse.json({ error: "店舗名を入力してください" }, { status: 400 });
  }
  if (!contactName || contactName.length > 100) {
    return NextResponse.json({ error: "担当者名を入力してください" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "メールアドレスを正しく入力してください" }, { status: 400 });
  }
  if (slug && !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "希望URLは半角英数字とハイフン(2〜63文字)で入力してください" },
      { status: 400 }
    );
  }
  if (staffCount !== null && (!Number.isInteger(staffCount) || staffCount < 1 || staffCount > 99)) {
    return NextResponse.json({ error: "スタッフ数を正しく入力してください" }, { status: 400 });
  }
  if (note && note.length > 1000) {
    return NextResponse.json({ error: "備考は1000文字以内で入力してください" }, { status: 400 });
  }

  const db = createServiceClient();

  // 同じメールアドレスの未対応申し込みがあれば追加しない(二重送信・連打対策)
  const { data: dup } = await db
    .from("salon_applications")
    .select("id")
    .eq("email", email)
    .eq("status", "pending")
    .limit(1);
  if (dup && dup.length > 0) {
    return NextResponse.json({ ok: true });
  }

  if (slug) {
    const { data: taken } = await db
      .from("salons")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (taken) {
      return NextResponse.json(
        { error: "その希望URLはすでに使われています。別のURLを入力してください" },
        { status: 409 }
      );
    }
  }

  const { error } = await db.from("salon_applications").insert({
    salon_name: salonName,
    contact_name: contactName,
    email,
    phone,
    slug,
    staff_count: staffCount,
    note,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
