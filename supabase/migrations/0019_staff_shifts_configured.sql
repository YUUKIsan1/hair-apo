-- シフトを一度でも設定したかを記録し、まだ一度も設定していない状態と
-- 「全曜日休み」「特定日シフトのみ」という意図的な設定を区別する
alter table staff
  add column if not exists shifts_configured boolean not null default false;

-- 既存スタッフはシフト行(週間・特定日どちらでも)が1件でもあれば設定済みとみなす
update staff s
set shifts_configured = true
where exists (select 1 from shifts sh where sh.staff_id = s.id);
