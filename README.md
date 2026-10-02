# ヘアアポ (hair-apo)

個人〜小規模美容室(スタッフ1〜10名)のための予約・顧客管理SaaS。
HOT PEPPER Beauty に替わる、手数料が安く透明なプラットフォームを目指す。

## コンセプト

- **SaaS先行**: サロンが「自前の予約ページ」として使える(店舗独自URL)、集客モールは後で育てる
- **空き枠即時確定**: シフト − time_off − 既存予約 = 公開枠。ダブルブッキングはDB排他制約で防止
- **料金**: 月額1万円 + 予約経由売上の手数料(決済手数料込)。
  自前導線は決済費相当の低率、モール送客は高めの2本建てを想定
- **決済形態**: 事前決済 / カード登録+現地払い / 現地払いのみをメニューごとにサロンが選択

## 技術スタック

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + RLS)
- Stripe Connect Express(Phase 2: 事前決済・手数料徴収・サロン入金)
- 通知: LINE Messaging API + メール(Phase 2)

## ドキュメント

- [docs/requirements.md](docs/requirements.md) — 要件定義
- [docs/screens.md](docs/screens.md) — 画面一覧・予約フロー
- [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql) — DBスキーマ

## セットアップ

```bash
npm install
cp .env.example .env.local   # Supabaseの値を入れる
npm run dev
```

## ディレクトリ

```
src/app/            ページ(App Router)
  s/[salonSlug]/    客側: 店舗ページ・予約フロー
  admin/            サロン管理(予約台帳・カルテ・請求)
  ops/              運営管理(今後)
src/lib/supabase/   Supabaseクライアント
supabase/migrations/ DBマイグレーション
docs/               要件・設計ドキュメント
```
