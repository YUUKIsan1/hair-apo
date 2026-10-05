import { lineEnabled, sendLinePush } from "@/lib/line";
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

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[notify] RESEND_API_KEY 未設定のため送信スキップ: ${subject} -> ${to}`);
    return false;
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
    return false;
  }
  return true;
}

interface MailData {
  salonName: string;
  salonPhone: string | null;
  salonAddress: string | null;
  notifyEmail: string | null;
  salonLineUserId: string | null;
  menuName: string;
  price: number;
  staffName: string;
  customerName: string;
  customerEmail: string | null;
  customerLineUserId: string | null;
  startsAt: string;
  manageToken: string;
}

async function fetchMailData(apptId: string): Promise<MailData | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("appointments")
    .select(
      "starts_at, manage_token, line_user_id, salons(name, phone, address, notify_email, line_user_id), menus(name, price), staff(name), customers(name, email)"
    )
    .eq("id", apptId)
    .single();
  if (error) console.error(`[notify] fetch failed: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as {
    starts_at: string;
    manage_token: string;
    line_user_id: string | null;
    salons: {
      name: string;
      phone: string | null;
      address: string | null;
      notify_email: string | null;
      line_user_id: string | null;
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
    salonLineUserId: r.salons.line_user_id,
    menuName: r.menus.name,
    price: r.menus.price,
    staffName: r.staff.name,
    customerName: r.customers.name,
    customerEmail: r.customers.email,
    // 顧客側のLINE連携は予約単位(appointments.line_user_id)
    customerLineUserId: r.line_user_id,
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

// LINEはHTMLが使えないのでテキスト版を別途組み立てる
function bookingLineText(
  d: MailData,
  kind: "confirmed" | "cancelled",
  when: string,
  manageUrl: string
): string {
  const head =
    kind === "confirmed"
      ? `【${d.salonName}】ご予約を確定しました`
      : `【${d.salonName}】ご予約をキャンセルしました`;
  const lines = [
    head,
    "",
    `${d.customerName} 様`,
    "",
    kind === "confirmed"
      ? "以下の内容でご予約を確定しました。"
      : "以下のご予約をキャンセルしました。",
    `店舗: ${d.salonName}`,
    `日時: ${when}`,
    `メニュー: ${d.menuName}`,
    `担当: ${d.staffName}`,
    `料金: ¥${d.price.toLocaleString("ja-JP")}(現地支払い)`,
    ...(d.salonAddress ? [`住所: ${d.salonAddress}`] : []),
    ...(d.salonPhone ? [`電話: ${d.salonPhone}`] : []),
  ];
  if (kind === "confirmed") {
    lines.push("", `変更・キャンセルはこちら: ${manageUrl}`);
  }
  return lines.join("\n");
}

function salonLineText(
  d: MailData,
  kind: "confirmed" | "cancelled",
  when: string
): string {
  const head =
    kind === "confirmed" ? "【hair-apo】新規予約" : "【hair-apo】予約キャンセル";
  return [
    head,
    "",
    kind === "confirmed" ? "新しい予約が入りました。" : "予約がキャンセルされました。",
    `日時: ${when}`,
    `顧客: ${d.customerName}`,
    `メニュー: ${d.menuName}`,
    `担当: ${d.staffName}`,
  ].join("\n");
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
    const tasks: Promise<unknown>[] = [];

    // LINE連携済みならLINE優先(二重通知を避ける)。送信失敗時はメールに落とす
    const sendToCustomer = async (): Promise<void> => {
      if (d.customerLineUserId && lineEnabled()) {
        const ok = await sendLinePush(
          d.customerLineUserId,
          bookingLineText(d, kind, when, manageUrl)
        );
        if (ok) return;
      }
      if (!d.customerEmail) return;
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
      await sendEmail(d.customerEmail!, subject, html);
    };
    if (opts.toCustomer !== false) tasks.push(sendToCustomer());

    const sendToSalon = async (): Promise<void> => {
      if (d.salonLineUserId && lineEnabled()) {
        const ok = await sendLinePush(d.salonLineUserId, salonLineText(d, kind, when));
        if (ok) return;
      }
      if (!d.notifyEmail) return;
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
      await sendEmail(d.notifyEmail!, subject, html);
    };
    if (opts.toSalon !== false) tasks.push(sendToSalon());

    await Promise.all(tasks);
  } catch (e) {
    console.error("[notify] failed:", e);
  }
}

const JST = 9 * 3600_000;

// JST基準で「明日」の0:00〜24:00に相当するUTCの範囲
function tomorrowJstRange(): { from: string; to: string } {
  const nowJst = new Date(Date.now() + JST);
  const start = Date.UTC(
    nowJst.getUTCFullYear(),
    nowJst.getUTCMonth(),
    nowJst.getUTCDate() + 1
  );
  return {
    from: new Date(start - JST).toISOString(),
    to: new Date(start - JST + 24 * 3600_000).toISOString(),
  };
}

/**
 * 明日の予約にリマインダーを送る。cronエンドポイントから日1回呼ぶ想定。
 * reminder_sent_atを先に立ててから送るので重複送信しない。
 */
export async function sendBookingReminders(opts: {
  baseUrl: string;
}): Promise<{ found: number; sent: number }> {
  if (!process.env.RESEND_API_KEY && !lineEnabled()) {
    console.warn("[notify] 通知経路未設定のためリマインダーをスキップ");
    return { found: 0, sent: 0 };
  }
  const db = createServiceClient();
  const { from, to } = tomorrowJstRange();
  const { data: appts, error } = await db
    .from("appointments")
    .select("id")
    .eq("status", "confirmed")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .is("reminder_sent_at", null);
  if (error) {
    console.error(`[notify] reminder query failed: ${error.message}`);
    return { found: 0, sent: 0 };
  }

  let sent = 0;
  for (const { id } of appts ?? []) {
    // 先に占有する(同時実行の重複送信防止)。送信不可でも再送は不要なので取り下げない
    const { data: claimed } = await db
      .from("appointments")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", id)
      .is("reminder_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      const d = await fetchMailData(id);
      if (!d) continue;
      const when = fmtJst(d.startsAt);
      const manageUrl = `${opts.baseUrl}/booking/${d.manageToken}`;
      // LINE連携済みならLINEのみ。未連携はメール
      if (d.customerLineUserId && lineEnabled()) {
        const lines = [
          `【${d.salonName}】明日のご予約のお知らせ`,
          "",
          `${d.customerName} 様`,
          "",
          "明日のご予約をお知らせします。",
          `店舗: ${d.salonName}`,
          `日時: ${when}`,
          `メニュー: ${d.menuName}`,
          `担当: ${d.staffName}`,
          ...(d.salonAddress ? [`住所: ${d.salonAddress}`] : []),
          ...(d.salonPhone ? [`電話: ${d.salonPhone}`] : []),
          "",
          `変更・キャンセルはこちら: ${manageUrl}`,
        ];
        if (await sendLinePush(d.customerLineUserId, lines.join("\n"))) {
          sent++;
          continue;
        }
        // LINE送信失敗時はメールにフォールバック
      }
      if (!d.customerEmail) continue;
      const html = shell(`
        <p>${esc(d.customerName)} 様<br><br>明日のご予約をお知らせします。</p>
        <table style="margin:16px 0;border-collapse:collapse">
          ${row("店舗", esc(d.salonName))}
          ${row("日時", when)}
          ${row("メニュー", esc(d.menuName))}
          ${row("担当", esc(d.staffName))}
          ${d.salonAddress ? row("住所", esc(d.salonAddress)) : ""}
          ${d.salonPhone ? row("電話", esc(d.salonPhone)) : ""}
        </table>
        <p>変更・キャンセルはこちらから: <a href="${manageUrl}">${manageUrl}</a></p>
        <p style="color:#78716c;font-size:12px">※ このメールは hair-apo から自動送信されています。</p>
      `);
      if (await sendEmail(d.customerEmail, `【${d.salonName}】明日のご予約のお知らせ`, html)) {
        sent++;
      }
    } catch (e) {
      console.error(`[notify] reminder failed for ${id}:`, e);
    }
  }
  return { found: appts?.length ?? 0, sent };
}
