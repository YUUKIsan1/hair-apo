# 画面一覧・フロー

ルート構成は3エリア: 客側公開ページ `/s/[salonSlug]`、サロン管理 `/admin`、運営 `/ops`。

## 客側(public)

| パス | 画面 | 内容 |
|---|---|---|
| `/s/[salonSlug]` | 店舗ページ | 店舗情報・スタッフ・メニュー一覧。Instagram等のプロフィールからの着地先 |
| `/s/[salonSlug]/book` | 予約: メニュー選択 | メニュー(価格・所要時間・支払方式)選択 |
| `/s/[salonSlug]/book/staff` | 予約: 指名選択 | スタッフ指名 or フリー(対応可能スタッフのみ表示) |
| `/s/[salonSlug]/book/datetime` | 予約: 日時選択 | 空き枠カレンダー(シフト−time_off−既存予約−バッファ) |
| `/s/[salonSlug]/book/form` | 予約: 情報入力 | 名前・連絡先。会員なら自動入力。支払方式に応じてカード決済/登録 |
| `/s/[salonSlug]/book/done` | 予約完了 | 確定表示。manage_token付きURLをメール/LINEに送信 |
| `/booking/[manageToken]` | 予約確認・変更・キャンセル | ゲスト可。キャンセルポリシー表示 |
| `/login`, `/signup` | 会員認証 | LINEログイン or メール |
| `/mypage/bookings` | 予約履歴 | 会員向け |

### 予約フロー

```
メニュー選択 → 指名/フリー → 空き枠選択 → 情報入力
  → 支払方式判定 (menu.payment_mode)
    prepaid:      Stripe決済 → 確定
    card_on_file: カード登録のみ → 確定
    on_site:      そのまま確定
  → 即時確定(appointments INSERT、staff×時間帯の排他制約でダブルブッキング防止)
  → 通知(客へ確認、サロンへ新規予約通知)
```

## サロン側 `/admin`(salon_users で認証)

| パス | 画面 | 内容 |
|---|---|---|
| `/admin` | ダッシュボード | 今日の予約、今月の売上・手数料 |
| `/admin/calendar` | 予約台帳 | 日/週カレンダー、スタッフ列。手入力予約・ブロック登録 |
| `/admin/appointments/[id]` | 予約詳細 | 変更・キャンセル・no_show記録 |
| `/admin/customers` | 顧客一覧 | 検索(名前/電話) |
| `/admin/customers/[id]` | 顧客詳細・カルテ | 来店履歴・写真・メモ追記 |
| `/admin/menus` | メニュー管理 | 価格・時間・バッファ・支払方式・対応スタッフ |
| `/admin/staff` | スタッフ管理 | プロフィール・指名可否 |
| `/admin/shifts` | シフト管理 | 曜日繰り返し+特定日、time_off登録 |
| `/admin/settings` | 店舗設定 | 店舗情報・営業時間・通知(LINE連携)・キャンセルポリシー |
| `/admin/billing` | 請求・手数料 | 手数料明細(経路別)、月次invoice。透明表示が差別化 |
| `/admin/onboarding` | 初期設定 | Stripe Connect KYC・最初のメニュー/スタッフ登録 |

## 運営側 `/ops`

| パス | 画面 | 内容 |
|---|---|---|
| `/ops/salons` | 店舗管理 | 契約・KYC進捗・手数料率 |
| `/ops/billing` | 請求管理 | 現地払い分手数料の月次請求・回収状況 |

## MVPスコープ外

モール検索トップ `/` のサロン横断検索、ポイント、DM一斉配信、POS連携、ネイティブアプリ、複数店舗管理。
