// JST表示用の日時フォーマット
export function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function timeJst(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// ISO時刻のJST日付部分("YYYY-MM-DD")
export function dateOnlyJst(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// "2026年10月5日(月)" 形式
export function dateLabelJst(date: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00+09:00`));
}

export function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

// JST日付文字列の加算(月末またぎ対応)
export function addDaysJst(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  return new Date(d.getTime() + days * 86400000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}
