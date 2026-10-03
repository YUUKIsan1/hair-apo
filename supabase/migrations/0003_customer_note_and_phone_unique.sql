-- 0003: 予約ごとの要望メモ + 顧客の電話番号ユニーク化
-- 既存データに (salon_id, phone) の重複があるとユニーク索引作成に失敗するので、
-- その場合は先に重複行をマージ/削除してから実行する。

alter table appointments add column customer_note text;

create unique index customers_salon_phone_key
  on customers (salon_id, phone)
  where phone is not null;
