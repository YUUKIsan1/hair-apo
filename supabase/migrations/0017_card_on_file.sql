-- 0017: card_on_file(事前カード登録・当日決済)
-- カードは予約単位で登録(Stripe Customerは顧客単位で使い回し)
alter table customers add column if not exists stripe_customer_id text;
alter table appointments add column if not exists stripe_payment_method_id text;
alter table appointments add column if not exists stripe_setup_session_id text;
