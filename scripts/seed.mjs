// シードデータ投入: REST(PostgREST)経由。SUPABASE_SERVICE_ROLE_KEY が必要。
// 使い方: node scripts/seed.mjs  (.env.local を読む)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const SALON = "00000000-0000-0000-0000-000000000001";
const S = (n) => `00000000-0000-0000-0000-000000000${n}`;

async function insert(table, rows) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  console.log(`${table}: ${data.length} rows`);
  return data;
}

await insert("salons", [{
  id: SALON,
  slug: "theater",
  name: "THEATER",
  description: "表参道の美容室。お客様一人一人の物語に彩りを与えるサロン。\n髪質や骨格に合わせた丁寧なカウンセリングと、再現性の高いスタイルを提供します。",
  phone: "03-6451-1083",
  postal_code: "150-0001",
  address: "東京都渋谷区神宮前4-3-2 TOKYU REIT表参道スクエア4F",
}]);

await insert("business_hours", [
  { salon_id: SALON, day_of_week: 0, start_time: "10:00", end_time: "18:00" },
  { salon_id: SALON, day_of_week: 1, start_time: "10:00", end_time: "20:00" },
  { salon_id: SALON, day_of_week: 2, start_time: "10:00", end_time: "20:00" },
  { salon_id: SALON, day_of_week: 3, start_time: "10:00", end_time: "20:00" },
  { salon_id: SALON, day_of_week: 4, start_time: "10:00", end_time: "20:00" },
  { salon_id: SALON, day_of_week: 5, start_time: "10:00", end_time: "20:00" },
  { salon_id: SALON, day_of_week: 6, start_time: "10:00", end_time: "21:00" },
]);

await insert("staff", [
  { id: S("101"), salon_id: SALON, name: "藤原 大輔", role: "owner", bio: "代表。骨格矯正カットと艶髪が得意。", sort_order: 0 },
  { id: S("102"), salon_id: SALON, name: "田中 美咲", role: "stylist", bio: "レイヤーカット・韓国ヘア。丁寧なカウンセリングが好評です。", sort_order: 1 },
  { id: S("103"), salon_id: SALON, name: "佐藤 健一", role: "stylist", bio: "メンズカット・パーマ。", sort_order: 2 },
  { id: S("104"), salon_id: SALON, name: "山本 莉子", role: "stylist", bio: "カラーリスト。ブリーチなしの透明感カラー。", sort_order: 3 },
]);

const staffShifts = {
  [S("101")]: [[1, "10:00", "20:00"], [2, "10:00", "20:00"], [3, "10:00", "20:00"], [4, "10:00", "20:00"], [5, "10:00", "20:00"], [6, "10:00", "21:00"]],
  [S("102")]: [[0, "10:00", "18:00"], [1, "10:00", "20:00"], [2, "10:00", "20:00"], [3, "10:00", "20:00"], [4, "10:00", "20:00"], [5, "10:00", "20:00"], [6, "10:00", "21:00"]],
  [S("103")]: [[1, "10:00", "20:00"], [2, "10:00", "20:00"], [3, "10:00", "20:00"], [4, "10:00", "20:00"], [5, "10:00", "20:00"], [6, "10:00", "21:00"]],
  [S("104")]: [[0, "10:00", "18:00"], [2, "10:00", "20:00"], [3, "10:00", "20:00"], [4, "10:00", "20:00"], [5, "10:00", "20:00"], [6, "10:00", "21:00"]],
};
await insert("shifts", Object.entries(staffShifts).flatMap(([staff_id, days]) =>
  days.map(([day_of_week, start_time, end_time]) => ({ staff_id, day_of_week, start_time, end_time }))));

const menus = [
  ["201", "カット", "シャンプー・ブロー込み", 6600, 60, 15],
  ["202", "カット + カラー", "シャンプー・ブロー込み", 14300, 120, 15],
  ["203", "カット + パーマ", "シャンプー・ブロー込み", 15400, 150, 15],
  ["204", "カット + トリートメント", "内部補修トリートメント", 9900, 90, 15],
  ["205", "カラー(リタッチ)", "根元のみ", 8800, 90, 15],
  ["206", "ヘッドスパ", "45分コース", 5500, 45, 15],
  ["207", "ヘアセット", "", 4400, 30, 15],
  ["208", "前髪カット", "", 1100, 15, 0],
];
await insert("menus", menus.map(([n, name, description, price, duration_minutes, buffer_minutes], i) => ({
  id: S(n), salon_id: SALON, name, description, price, duration_minutes, buffer_minutes, payment_mode: "any", sort_order: i,
})));

await insert("staff_menus",
  [S("101"), S("102"), S("103"), S("104")].flatMap((staff_id) =>
    menus.map(([n]) => ({ staff_id, menu_id: S(n), nominable: true }))));

console.log("seed done");
