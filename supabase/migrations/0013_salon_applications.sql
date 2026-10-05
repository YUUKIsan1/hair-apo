-- サロン導入の申し込み。公開フォームから登録され、opsが承認/却下する
-- RLSポリシーを作らないため、参照・操作はservice roleのみ
create table salon_applications (
  id uuid primary key default gen_random_uuid(),
  salon_name text not null,
  slug text,                    -- 希望する店舗URL(任意)
  contact_name text not null,
  email text not null,
  phone text,
  staff_count int,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  created_salon_id uuid references salons(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table salon_applications enable row level security;
