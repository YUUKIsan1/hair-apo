-- 予約時点のメニュー価格をスナップショットする列。
-- メニュー価格の変更で過去の売上・手数料集計が書き変わるのを防ぐ
alter table appointments add column price int;

-- 既存行は現在のメニュー価格で埋める(当時の価格は残っていないため近似)
update appointments set price = menus.price
from menus where menus.id = appointments.menu_id;
