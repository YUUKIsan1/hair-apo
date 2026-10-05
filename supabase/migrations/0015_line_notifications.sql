-- LINE通知連携。サロン・顧客それぞれがLINE公式アカウントと
-- 友だちになり、連携コードをトークに送るとuser_idが紐付く。
-- customers.line_user_id は初期スキーマに既にあるので if not exists
alter table salons
  add column if not exists line_user_id text,
  add column if not exists line_link_code text;

alter table customers
  add column if not exists line_user_id text,
  add column if not exists line_link_code text;
