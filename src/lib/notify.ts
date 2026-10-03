import { createServiceClient } from "@/lib/supabase/server";

const FROM = process.env.EMAIL_FROM ?? "hair-apo <onboarding@resend.dev>";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtJst(iso: string): string {
  const d = new Date(iso);
  const dow = "日月火水木金土"[d.getDay()];
  // JSTで整形(サーバーTZに依存しないよう+9時間してUTC表記を読む)
  const jst = new Date(d.getTime() + 9 * 3600_000);
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日(${dow}) ${String(
    jst.getUTCHours()
  ).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[notify] RESEND_API_KEY 未設定のため送信スキップ: ${subject} -> ${to}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error(`[notify] resend failed ${res.status}: ${await res.text()}`);
  }
}

interface MailData {
  salonName: string;
  salonPhone: string | null;
  salonAddress: string | null;
  notifyEmail: string | null;
  menuName: string;
  price: number;
  staffName: string;
  customerName: string;
  customerEmail: string | null;
  startsAt: string;
  manageToken: string;
}

async function fetchMailData(apptId: string): Promise<MailData | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("appointments")
    .select(
      "starts_at, manage_token, salons(name, phone, address, notify_email), menus(name, price), staff(name), customers(name, email)"
    )
    .eq("id", apptId)
    .single();
  if (error) console.error(`[notify] fetch failed: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as {
    starts_at: string;
    manage_token: string;
    salons: {
      name: string;
      phone: string | null;
      address: string | null;
      notify_email: string | null;
    } | null;
    menus: { name: string; price: number } | null;
    staff: { name: string } | null;
    customers: { name: string; email: string | null } | null;
  };
  if (!r.salons || !r.menus || !r.staff || !r.customers) return null;
  return {
    salonName: r.salons.name,
    salonPhone: r.salons.phone,
    salonAddress: r.salons.address,
    notifyEmail: r.salons.notify_email,
    menuName: r.menus.name,
    price: r.menus.price,
    staffName: r.staff.name,
    customerName: r.customers.name,
    customerEmail: r.customers.email,
    startsAt: r.starts_at,
    manageToken: r.manage_token,
  };
}

function shell(body: string): string {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1c1917;font-size:14px;line-height:1.8">${body}</div>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 16px 4px 0;color:#78716c;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0">${value}</td></tr>`;
}

/**
 * 予約確定/キャンセルの通知を客とサロンに送る。
 * toSalon=false はサロン自身の操作による通知を抑制するために使う。
 * 送信失敗は握りつぶす(通知ミスで予約処理を落とさない)。
 */
export async function notifyBooking(
  appointmentId: string,
  kind: "confirmed" | "cancelled",
  opts: { baseUrl: string; toCustomer?: boolean; toSalon?: boolean }
): Promise<void> {
  try {
    const d = await fetchMailData(appointmentId);
    if (!d) return;
    const when = fmtJst(d.startsAt);
    const manageUrl = `${opts.baseUrl}/booking/${d.manageToken}`;
    const tasks: Promise<void>[] = [];

    if (opts.toCustomer !== false && d.customerEmail) {
      const subject =
        kind === "confirmed"
          ? `【${d.salonName}】ご予約を確定しました`
          : `【${d.salonName}】ご予約をキャンセルしました`;
      const intro =
        kind === "confirmed"
          ? `${esc(d.customerName)} 様<br><br>以下の内容でご予約を確定しました。`
          : `${esc(d.customerName)} 様<br><br>以下のご予約をキャンセルしました。`;
      const html = shell(`
        <p>${intro}</p>
        <table style="margin:16px 0;border-collapse:collapse">
          ${row("店舗", esc(d.salonName))}
          ${row("日時", when)}
          ${row("メニュー", esc(d.menuName))}
          ${row("担当", esc(d.staffName))}
          ${row("料金", `¥${d.price.toLocaleString("ja-JP")}(現地支払い)`)}
          ${d.salonAddress ? row("住所", esc(d.salonAddress)) : ""}
          ${d.salonPhone ? row("電話", esc(d.salonPhone)) : ""}
        </table>
        ${
          kind === "confirmed"
            ? `<p>変更・キャンセルはこちらから: <a href="${manageUrl}">${manageUrl}</a></p>`
            : ""
        }
        <p style="color:#78716c;font-size:12px">※ このメールは hair-apo から自動送信されています。</p>
      `);
      tasks.push(sendEmail(d.customerEmail, subject, html));
    }

    if (opts.toSalon !== false && d.notifyEmail) {
      const subject =
        kind === "confirmed"
          ? `【hair-apo】新規予約: ${when}`
          : `【hair-apo】予約キャンセル: ${when}`;
      const html = shell(`
        <p>${kind === "confirmed" ? "新しい予約が入りました。" : "予約がキャンセルされました。"}</p>
        <table style="margin:16px 0;border-collapse:collapse">
          ${row("日時", when)}
          ${row("顧客", esc(d.customerName))}
          ${row("メニュー", esc(d.menuName))}
          ${row("担当", esc(d.staffName))}
        </table>
      `);
      tasks.push(sendEmail(d.notifyEmail, subject, html));
    }

    await Promise.all(tasks);
  } catch (e) {
    console.error("[notify] failed:", e);
  }
}
