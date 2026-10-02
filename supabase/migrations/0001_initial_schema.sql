-- hair-apo initial schema
-- 対象: 個人〜小規模サロン(スタッフ1〜10名)の予約・顧客管理SaaS
-- 方針: 空き枠即時確定 / 事前決済・カード登録・現地払いのサロン選択制 / Stripe Connect

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- salons
-- ---------------------------------------------------------------------------
create table salons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  description text,
  phone text,
  postal_code text,
  address text,
  -- Stripe Connect (Express) アカウント
  stripe_account_id text unique,
  stripe_onboarded boolean not null default false,
  -- 手数料率の2本建て (bps: 10000 = 100%)
  fee_rate_direct_bps int not null default 400,  -- 自前導線(店舗URL/SNS)
  fee_rate_mall_bps int not null default 800,    -- モール経由送客(将来)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- サロン側ログインアカウント(オーナー/スタッフ)
create table salon_users (
  salon_id uuid not null references salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_id uuid, -- FKは staff 作成後に add constraint
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (salon_id, user_id)
);

-- ---------------------------------------------------------------------------
-- staff / shift / time_off / business_hours
-- ---------------------------------------------------------------------------
create table staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  name text not null,
  role text not null default 'stylist' check (role in ('owner', 'stylist', 'assistant')),
  photo_url text,
  bio text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table salon_users
  add constraint salon_users_staff_id_fkey
  foreign key (staff_id) references staff(id) on delete set null;

-- サロン全体の営業時間(曜日単位)
create table business_hours (
  salon_id uuid not null references salons(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=日曜
  start_time time not null,
  end_time time not null check (end_time > start_time),
  primary key (salon_id, day_of_week)
);

-- スタッフシフト: 曜日の繰り返し or 特定日のどちらか一方
create table shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  day_of_week smallint check (day_of_week between 0 and 6),
  date date,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  check ((day_of_week is null) <> (date is null))
);
create index shifts_staff_date_idx on shifts (staff_id, date);
create index shifts_staff_dow_idx on shifts (staff_id, day_of_week);

-- 休み・休憩・私用ブロック(staff_id null = 店舗全体の休業)
create table time_off (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  staff_id uuid references staff(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text,
  created_at timestamptz not null default now()
);
create index time_off_salon_range_idx on time_off (salon_id, starts_at, ends_at);
create index time_off_staff_range_idx on time_off (staff_id, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- menus / staff_menus
-- ---------------------------------------------------------------------------
create table menus (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  name text not null,
  description text,
  price int not null check (price >= 0),          -- JPY(税込)
  duration_minutes int not null check (duration_minutes > 0),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0), -- 施術後の片付け等
  -- 支払方式: any=客が選べる / prepaid=事前決済のみ / card_on_file=カード登録のみ+現地払い / on_site=現地払いのみ
  payment_mode text not null default 'any' check (payment_mode in ('any', 'prepaid', 'card_on_file', 'on_site')),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menus_salon_idx on menus (salon_id) where is_active;

-- スタッフが対応できるメニュー + 指名可否
create table staff_menus (
  staff_id uuid not null references staff(id) on delete cascade,
  menu_id uuid not null references menus(id) on delete cascade,
  nominable boolean not null default true,
  primary key (staff_id, menu_id)
);

-- ---------------------------------------------------------------------------
-- customers / appointments / karts
-- ---------------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null, -- 会員登録済みなら
  name text not null,
  name_kana text,
  email text,
  phone text,
  line_user_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_salon_idx on customers (salon_id);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  staff_id uuid not null references staff(id), -- フリー予約も確定時に担当者を割当てて非null
  customer_id uuid not null references customers(id),
  menu_id uuid not null references menus(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  -- 経路: direct=店舗URL/SNS等の自前導線 / mall=モール送客(将来) / manual=電話・HPB併用等の手入力
  channel text not null default 'direct' check (channel in ('direct', 'mall', 'manual')),
  payment_mode text not null check (payment_mode in ('prepaid', 'card_on_file', 'on_site')),
  -- ゲスト用の確認/キャンセルリンク(メール・LINEに載せる)
  manage_token uuid not null default gen_random_uuid(),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ダブルブッキング防止: 同一スタッフ・同一時間帯の予約は1件のみ
alter table appointments add constraint no_double_booking
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed');

create index appointments_salon_range_idx on appointments (salon_id, starts_at);
create index appointments_staff_range_idx on appointments (staff_id, starts_at);
create index appointments_customer_idx on appointments (customer_id);
create unique index appointments_manage_token_idx on appointments (manage_token);

-- カルテ(来店履歴)
create table karts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  visited_at timestamptz not null,
  memo text,
  photo_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index karts_customer_idx on karts (customer_id, visited_at desc);

-- ---------------------------------------------------------------------------
-- payments / invoices
-- ---------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  stripe_payment_intent_id text unique,
  amount int not null check (amount >= 0),                 -- 顧客支払額(JPY)
  application_fee_amount int not null default 0,           -- 手数料(Stripe Connect側で控除)
  currency text not null default 'jpy',
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'refunded', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 現地払い分の手数料 月次請求
create table invoices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  amount int not null default 0 check (amount >= 0),
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  stripe_invoice_id text unique,
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (salon_id, period_year, period_month)
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  appointment_id uuid not null references appointments(id),
  amount int not null check (amount >= 0), -- この予約に対する手数料
  created_at timestamptz not null default now(),
  unique (invoice_id, appointment_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- NOTE: 方針のみ先行。ポリシーは認証実装と合わせて整備すること。
alter table salons enable row level security;
alter table salon_users enable row level security;
alter table staff enable row level security;
alter table business_hours enable row level security;
alter table shifts enable row level security;
alter table time_off enable row level security;
alter table menus enable row level security;
alter table staff_menus enable row level security;
alter table customers enable row level security;
alter table appointments enable row level security;
alter table karts enable row level security;
alter table payments enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;

-- 公開読み取り(店舗ページ・予約ページ用): 店舗情報・スタッフ・メニュー・営業時間は誰でも読める
create policy salons_public_read on salons for select using (true);
create policy staff_public_read on staff for select using (is_active);
create policy business_hours_public_read on business_hours for select using (true);
create policy menus_public_read on menus for select using (is_active);
create policy staff_menus_public_read on staff_menus for select using (true);

-- サロンメンバー: 自サロンのデータを参照・更新できる
create or replace function is_salon_member(target_salon uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from salon_users where salon_id = target_salon and user_id = auth.uid()) $$;

create policy salons_member_read on salons for select using (is_salon_member(id));
create policy salons_member_update on salons for update using (is_salon_member(id));
create policy salon_users_member_read on salon_users for select using (is_salon_member(salon_id));
create policy staff_member_all on staff for all using (is_salon_member(salon_id));
create policy shifts_member_all on shifts for all using (is_salon_member((select salon_id from staff where id = shifts.staff_id)));
create policy time_off_member_all on time_off for all using (is_salon_member(salon_id));
create policy menus_member_all on menus for all using (is_salon_member(salon_id));
create policy customers_member_all on customers for all using (is_salon_member(salon_id));
create policy appointments_member_all on appointments for all using (is_salon_member(salon_id));
create policy karts_member_all on karts for all using (is_salon_member(salon_id));
create policy payments_member_read on payments for select using (
  is_salon_member((select salon_id from appointments where id = payments.appointment_id)));
create policy invoices_member_read on invoices for select using (is_salon_member(salon_id));
create policy invoice_items_member_read on invoice_items for select using (
  is_salon_member((select salon_id from invoices where id = invoice_items.invoice_id)));

-- 客側の予約作成・確認はサーバーサイド(service role)経由で行う想定のため
-- anon ロールへの insert ポリシーは意図的に作らない(スロット計算・決済・通知を一元化)
