// サロン管理者ユーザーを作成する
//   node scripts/create-admin-user.mjs <salon_slug> <email> <password> [role] [staff_id]
// 例: node scripts/create-admin-user.mjs theater owner@theater.example.jp password owner
import { createClient } from "@supabase/supabase-js";

const [slug, email, password, role = "owner", staffId = null] =
  process.argv.slice(2);
if (!slug || !email || !password) {
  console.error(
    "usage: node scripts/create-admin-user.mjs <salon_slug> <email> <password> [role] [staff_id]"
  );
  process.exit(1);
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: salon, error: salonErr } = await db
  .from("salons")
  .select("id, name")
  .eq("slug", slug)
  .single();
if (salonErr || !salon) {
  console.error(`salon "${slug}" not found`);
  process.exit(1);
}

const { data: created, error: userErr } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (userErr) {
  console.error("createUser failed:", userErr.message);
  process.exit(1);
}

const { error: linkErr } = await db.from("salon_users").insert({
  salon_id: salon.id,
  user_id: created.user.id,
  role,
  staff_id: staffId,
});
if (linkErr) {
  console.error("salon_users insert failed:", linkErr.message);
  process.exit(1);
}

console.log(`created ${email} (${role}) for ${salon.name}`);
