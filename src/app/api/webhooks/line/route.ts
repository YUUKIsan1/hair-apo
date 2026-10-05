import { NextRequest, NextResponse } from "next/server";
import { sendLineReply, verifyLineSignature } from "@/lib/line";
import { createServiceClient } from "@/lib/supabase/server";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

const HELP_TEXT =
  "hair-apoの通知アカウントです。サロン管理画面や予約確認ページに表示される連携コード(S-XXXXXX / C-XXXXXX)をこのトークに送ると、通知がLINEに届くようになります。";

// POST /api/webhooks/line — LINE公式アカウントのイベント受信。
// 友だち追加・解除と連携コードメッセージを処理する
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-line-signature");
  if (!process.env.LINE_CHANNEL_SECRET || !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json({ error: "設定されていません" }, { status: 503 });
  }
  if (!sig || !verifyLineSignature(raw, sig)) {
    return NextResponse.json({ error: "署名が不正です" }, { status: 400 });
  }

  let events: LineEvent[];
  try {
    events = (JSON.parse(raw).events ?? []) as LineEvent[];
  } catch {
    return NextResponse.json({ error: "JSONが不正です" }, { status: 400 });
  }

  const db = createServiceClient();
  for (const ev of events) {
    const userId = ev.source?.userId;
    if (!userId) continue;
    try {
      if (ev.type === "follow") {
        if (ev.replyToken) await sendLineReply(ev.replyToken, HELP_TEXT);
      } else if (ev.type === "unfollow") {
        await db.from("salons").update({ line_user_id: null }).eq("line_user_id", userId);
        await db.from("customers").update({ line_user_id: null }).eq("line_user_id", userId);
      } else if (ev.type === "message" && ev.message?.type === "text") {
        const text = (ev.message.text ?? "").trim().toUpperCase();
        const salonMatch = /^S-([0-9A-Z]{6})$/.exec(text);
        const customerMatch = /^C-([0-9A-Z]{6})$/.exec(text);
        if (salonMatch) {
          const { data: salon } = await db
            .from("salons")
            .update({ line_user_id: userId, line_link_code: null })
            .eq("line_link_code", salonMatch[1])
            .select("name")
            .maybeSingle();
          if (ev.replyToken) {
            await sendLineReply(
              ev.replyToken,
              salon
                ? `「${salon.name}」との連携が完了しました。新しい予約やキャンセルをLINEでお知らせします。`
                : "その連携コードは無効です。サロン管理画面で最新のコードをご確認ください。"
            );
          }
        } else if (customerMatch) {
          const { data: customer } = await db
            .from("customers")
            .update({ line_user_id: userId, line_link_code: null })
            .eq("line_link_code", customerMatch[1])
            .select("id")
            .maybeSingle();
          if (ev.replyToken) {
            await sendLineReply(
              ev.replyToken,
              customer
                ? "連携が完了しました。予約の確定・変更・リマインダーをLINEでお知らせします。"
                : "その連携コードは無効です。予約確認ページで最新のコードをご確認ください。"
            );
          }
        } else if (ev.replyToken) {
          await sendLineReply(ev.replyToken, HELP_TEXT);
        }
      }
    } catch (e) {
      console.error(`[line webhook] event ${ev.type} failed:`, e);
    }
  }
  return NextResponse.json({ received: true });
}
