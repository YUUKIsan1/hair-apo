-- 運営(プラットフォーム側)のops画面に入れるユーザーの許可リスト。
-- ポリシーは定義しない = anon/authenticatedからは読み書き不可、
-- service role経由のみ参照する
create table ops_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table ops_users enable row level security;
