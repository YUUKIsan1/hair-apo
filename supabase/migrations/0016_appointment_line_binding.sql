-- 顧客側のLINE連携を顧客単位から予約単位に移す。
-- 電話番号で既存顧客行を再利用する設計のため、顧客単位の紐付けは
-- 第三者の予約で他人の通知先を奪えてしまう。予約ごとの連携なら
-- manage_tokenを持つ本人だけが自分の予約の通知先を決められる
alter table appointments
  add column line_user_id text,
  add column line_link_code text;

-- 連携コードの衝突で通知先が入れ替わるのを防ぐ一意制約
create unique index appointments_line_link_code_key
  on appointments (line_link_code) where line_link_code is not null;
create unique index salons_line_link_code_key
  on salons (line_link_code) where line_link_code is not null;
create unique index customers_line_link_code_key
  on customers (line_link_code) where line_link_code is not null;
