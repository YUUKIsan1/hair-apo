alter table salons
  add column cancel_deadline_hours int not null default 0,
  add column cancel_fee_rate_bps int not null default 0;

alter table payments add column cancel_fee_amount int not null default 0;
