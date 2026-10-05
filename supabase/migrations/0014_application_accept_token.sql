-- 承認後の本人有効化リンク用トークン。メール内リンクで本人が
-- ログイン済み状態でアクセスしたときだけオーナー紐付けを行う
alter table salon_applications
  add column accept_token uuid not null default gen_random_uuid();

create unique index salon_applications_accept_token_key
  on salon_applications (accept_token);
