import { createHmac, timingSafeEqual } from "crypto";

// LINE Messaging API連携。プラットフォームの公式アカウント1つを
// 全サロン・顧客で共用し、連携コードで宛先を紐付ける。
// 未設定(LINE_CHANNEL_ACCESS_TOKENなし)のときは何もしないでfalseを返す

export function lineEnabled(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

// 連携コード。紛らわしい文字を除いた8文字(I,O,0,1は除外)
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newLinkCode(): string {
  let s = "";
  const buf = crypto.getRandomValues(new Uint8Array(8));
  for (const b of buf) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

// webhookのx-line-signature検証(HMAC-SHA256のbase64)
export function verifyLineSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function postLine(path: string, body: unknown): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;
  const res = await fetch(`https://api.line.me/v2/bot/message/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[line] ${path} failed ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

// 任意のユーザーへプッシュ送信
export async function sendLinePush(userId: string, text: string): Promise<boolean> {
  return postLine("push", {
    to: userId,
    messages: [{ type: "text", text }],
  });
}

// webhookイベントへの応答
export async function sendLineReply(replyToken: string, text: string): Promise<boolean> {
  return postLine("reply", {
    replyToken,
    messages: [{ type: "text", text }],
  });
}
