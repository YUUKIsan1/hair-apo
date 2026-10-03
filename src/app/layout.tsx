import type { Metadata } from "next";
import { Noto_Sans_JP, Shippori_Mincho_B1 } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans",
});

const shipporiMincho = Shippori_Mincho_B1({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-shippori",
});

export const metadata: Metadata = {
  title: "ヘアアポ | 美容室の予約・顧客管理",
  description: "個人〜小規模サロンのための予約・顧客管理プラットフォーム",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ja"
      className={`${notoSans.variable} ${shipporiMincho.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
