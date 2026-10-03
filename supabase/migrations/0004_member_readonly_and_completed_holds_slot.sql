-- 0004: メンバーの直接書き込みを止める + completed も枠を占有
--
-- 1) サロンメンバーのRLSをselect専用にする。
--    認証済みメンバーがブラウザのSupabaseクライアントから直接書き込むと、
--    ステータス遷移や予約ロジック等のAPI側検証を回避できてしまうため。
--    書き込みはすべて service role 経由のAPI/server actionに一本化する。
drop policy staff_member_all on staff;
create policy staff_member_read on staff for select using (is_salon_member(salon_id));

drop policy shifts_member_all on shifts;
create policy shifts_member_read on shifts for select using (
  is_salon_member((select salon_id from staff where id = shifts.staff_id)));

drop policy time_off_member_all on time_off;
create policy time_off_member_read on time_off for select using (is_salon_member(salon_id));

drop policy menus_member_all on menus;
create policy menus_member_read on menus for select using (is_salon_member(salon_id));

drop policy customers_member_all on customers;
create policy customers_member_read on customers for select using (is_salon_member(salon_id));

drop policy appointments_member_all on appointments;
create policy appointments_member_read on appointments for select using (is_salon_member(salon_id));

drop policy karts_member_all on karts;
create policy karts_member_read on karts for select using (is_salon_member(salon_id));

drop policy salons_member_update on salons;

-- 2) completed の予約も枠を占有し続ける。
--    confirmed のみだと、未来の予約を「完了」にした途端に枠が再販される。
alter table appointments drop constraint no_double_booking;
alter table appointments add constraint no_double_booking
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmed', 'completed'));
