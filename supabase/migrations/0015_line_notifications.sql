-- LINE通知連携。サロン・顧客それぞれがLINE公式アカウントと
-- 友だちになり、連携コードをトークに送るとuser_idが紐付く
alter table salons
  add column line_user_id text,
  add column line_link_code text;

alter table customers
  add column line_user_id text,
  add column line_link_code text;
