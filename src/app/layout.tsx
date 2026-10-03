import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans",
});

export const metadata: Metadata = {
  title: "ヘアアポ | 美容室の予約・顧客管理",
  description: "個人〜小規模サロンのための予約・顧客管理プラットフォーム",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={notoSans.variable}>
      <body>{children}</body>
    </html>
  );
}
