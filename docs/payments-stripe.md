# Stripe Connect 決済 運用ガイド

hair-apo の事前決済(Stripe Connect)の仕組みと、有効化までの手順まとめ。
コード自体は実装済み(PR #10)で、環境変数が未設定でも既存機能には影響しない。

## 構成

```
客 ──Stripe Checkout──> 決済
                          ├─ プラットフォーム手数料 → hair-apo運営アカウント
                          └─ 残額 → サロンのExpressアカウント(自動送金)
```

- **プラットフォーム** = hair-apo運営のStripeアカウント。APIキーとWebhookはこれ1つだけ管理する
- **サロン** = 各サロンが設定画面からExpressアカウントを作成・本人確認。入金先はサロン自身が管理
- 決済は「デスティネーションチャージ」: Checkoutで客が全額払い、`application_fee_amount` を控除した残額がサロンへ送金される

## 環境変数

| 変数 | 用途 | 取得場所 |
|---|---|---|
| `STRIPE_SECRET_KEY` | Connect/Checkout/返金API | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Webhook署名検証 | Dashboard → Developers → Webhooks → エンドポイント作成時に発行 |

未設定時の挙動: `STRIPE_SECRET_KEY`なし → 決済連携タブに「未設定」表示・事前決済メニューは現地払いにフォールバック。`STRIPE_WEBHOOK_SECRET`なし → webhookエンドポイントは503。

## セットアップ(プラットフォーム側、1回だけ)

1. https://stripe.com でアカウント作成(まずテストモードで進めてOK)
2. **APIキー**: Developers → API keys → Secret keyを `STRIPE_SECRET_KEY` に
3. **Connect有効化**: 左メニュー Connect → Get started。ブランド設定(サービス名・ロゴ)を入れる
4. **Webhook登録**: Developers → Webhooks → Add endpoint
   - URL: `https://<本番ドメイン>/api/webhooks/stripe`
   - イベント: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`
   - 作成後に表示される Signing secret を `STRIPE_WEBHOOK_SECRET` に
5. **DB**: `0008_payment_session.sql` 適用済みであること(`payments.stripe_checkout_session_id`)

## サロン側の連携(サロンごと)

1. 管理画面 → 設定 → **決済連携**タブ
2. 「Stripeと連携する」→ Expressアカウントが自動作成されStripeのオンボーディングへ
3. メール・電話・事業者情報・本人確認・入金口座を入力して完了
4. ページに戻ると `charges_enabled && payouts_enabled` を取り直して「連携済み」表示になる
5. メニュー設定で各メニューの「決済方法」を「事前カード決済」にすると、以後そのメニューの予約がCheckout決済になる(未連携の間は自動で現地払いにフォールバック)

## 決済フローの状態遷移

| イベント | 結果 |
|---|---|
| 予約確定(prepaidメニュー) | `confirmed`で枠占有 + `payments(pending)` + Checkout Session発行(30分で失効) |
| 支払い完了 | webhook `checkout.session.completed` → `payments.succeeded` |
| 支払わず放置 | `checkout.session.expired` → `payments.failed` + 予約を`cancelled`(枠解放) |
| 支払いページを閉じた | 予約は残る。確認ページの「支払いを完了する」でSession再発行可能 |
| 予約キャンセル(客/サロン) | 支払い済みなら全額返金(`reverse_transfer`+`refund_application_fee`)→ `payments.refunded` |

※ 失効で自動キャンセルされるのは「payments行に記録された最新sessionが期限切れになった場合」のみ。支払いリトライ後に古いsessionが期限切れになっても予約は消えない。

## 手数料

- `salons.fee_rate_direct_bps`(自前導線)が事前決済の `application_fee_amount` に使われる。現行デフォルト **4%**
- `salons.fee_rate_mall_bps`(モール経由・将来)8%
- Stripeのカード決済手数料(~3.6%)はプラットフォーム手数料側から出る設計なので、4%だと運営側の粗利はほぼない点に注意。料率を上げるか、Stripe手数料をサロン負担にするかは後で調整ポイント

## テスト方法(テストモード)

1. 上記をテストモードのキーで設定し、開発環境に `.env.local` へ記入
2. サロン連携はテストモードのオンボーディングで進む(ダミー情報でOK)
3. ローカルでWebhookを受けるには Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   # 表示される whsec_... を STRIPE_WEBHOOK_SECRET に
   stripe trigger checkout.session.completed  # 動作確認
   ```
4. テストカード: `4242 4242 4242 4242` / 未来の有効期限 / 任意CVC・郵便番号

## 未実装・今後の論点

- `card_on_file`(カード登録のみ・当日現地払い) — SetupIntent+顧客カード保存が要る
- `any`(客が決済方法を選択) — 予約フローに支払い選択ステップが要る
- キャンセルポリシー — 現状は全額返金。期限・キャンセル料を入れるなら別設計
- 現地払い分の月次請求(`invoices`) — 運営がサロンに請求する徴収フロー
- 予約完了メール・リマインダー — Resend(`RESEND_API_KEY`)とは別系統
