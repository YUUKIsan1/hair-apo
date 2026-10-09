"use client";

import Link from "next/link";
import { useState } from "react";
import {
  saveBusinessHours,
  updateSalon,
  upsertMenu,
  upsertStaff,
} from "../settings/actions";
import { getActiveStaff, seedStaffShifts } from "./actions";
import type { BusinessHours, Staff } from "@/lib/types";

const input =
  "w-full rounded-lg border hairline bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-mute";
const btn =
  "rounded-lg bg-ink px-5 py-2.5 text-sm text-paper disabled:opacity-40";
const btnSub =
  "rounded-lg border hairline bg-card px-4 py-2 text-sm hover:bg-accent-soft";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const STEPS = ["店舗情報", "営業時間", "スタッフ", "メニュー"];
const ROLE_LABEL: Record<Staff["role"], string> = {
  owner: "オーナー",
  stylist: "スタイリスト",
  assistant: "アシスタント",
};

interface SalonFields {
  name: string;
  description: string;
  phone: string;
  postal_code: string;
  address: string;
  notify_email: string;
  cancel_deadline_hours: string;
  cancel_fee_rate_percent: string;
}

export default function SetupWizard({
  slug,
  salon,
  initialHours,
  initialStaff,
  initialMenus,
}: {
  slug: string;
  salon: SalonFields;
  initialHours: BusinessHours[];
  initialStaff: {
    id: string;
    name: string;
    role: Staff["role"];
    shifts_configured: boolean;
  }[];
  initialMenus: { id: string; name: string; price: number }[];
}) {
  const [hoursDone, setHoursDone] = useState(initialHours.length > 0);
  const [staffList, setStaffList] = useState(initialStaff);
  const [menus, setMenus] = useState(initialMenus);
  // シフトを一度も設定していないスタッフ(予約枠が0件になる)
  const [unshifted, setUnshifted] = useState(
    () =>
      new Set(
        initialStaff.filter((s) => !s.shifts_configured).map((s) => s.id)
      )
  );
  // 最初の未完了ステップから始める(全部済みなら完了画面)
  const [step, setStep] = useState(() => {
    if (initialHours.length === 0) return 1;
    if (
      initialStaff.length === 0 ||
      initialStaff.some((s) => !s.shifts_configured)
    )
      return 2;
    if (initialMenus.length === 0) return 3;
    return 4;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error?: string }>, next: number) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) setError(res.error);
    else setStep(next);
  }

  // ---- 店舗情報 ----
  const [salonForm, setSalonForm] = useState(salon);
  const setSalon =
    (k: keyof SalonFields) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) =>
      setSalonForm({ ...salonForm, [k]: e.target.value });

  // ---- 営業時間 ----
  const [hours, setHours] = useState(() =>
    DOW.map((_, dow) => {
      const h = initialHours.find((r) => r.day_of_week === dow);
      return {
        day_of_week: dow,
        open: !!h,
        start_time: h?.start_time.slice(0, 5) ?? "10:00",
        end_time: h?.end_time.slice(0, 5) ?? "20:00",
      };
    })
  );
  const patchHours = (dow: number, p: Partial<(typeof hours)[number]>) =>
    setHours(hours.map((r) => (r.day_of_week === dow ? { ...r, ...p } : r)));

  // ---- スタッフ ----
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState<Staff["role"]>("stylist");

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await upsertStaff({
      name: staffName,
      role: staffRole,
      bio: "",
      sort_order: staffList.length,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    // 一覧表示用(メニューの担当割当は保存時に有効スタッフを取り直す)
    // 営業時間があれば初期シフト込みで作成される。無ければ未設定として数える
    const pid = `new-${staffList.length}`;
    setStaffList([
      ...staffList,
      {
        id: pid,
        name: staffName,
        role: staffRole,
        shifts_configured: hoursDone,
      },
    ]);
    if (!hoursDone) setUnshifted(new Set(unshifted).add(pid));
    setStaffName("");
  }

  async function seedShifts() {
    setBusy(true);
    setError(null);
    const res = await seedStaffShifts();
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setUnshifted(new Set());
    setStaffList(
      staffList.map((s) => ({ ...s, shifts_configured: true }))
    );
  }

  // ---- メニュー ----
  const [menuName, setMenuName] = useState("");
  const [menuPrice, setMenuPrice] = useState("6000");
  const [menuMinutes, setMenuMinutes] = useState("60");
  const [menuPay, setMenuPay] = useState<
    "on_site" | "prepaid" | "card_on_file"
  >("on_site");

  async function addMenu(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // 担当は有効スタッフ全員に割り当てる(細かい調整はメニュー設定で)
    const active = await getActiveStaff();
    const res = await upsertMenu({
      name: menuName,
      description: "",
      price: Number(menuPrice),
      duration_minutes: Number(menuMinutes),
      buffer_minutes: 0,
      sort_order: menus.length,
      payment_mode: menuPay,
      staff: active.map((s) => ({ staff_id: s.id, nominable: true })),
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMenus([
      ...menus,
      { id: `new-${menus.length}`, name: menuName, price: Number(menuPrice) },
    ]);
    setMenuName("");
  }

  const allDone =
    hoursDone &&
    staffList.length > 0 &&
    unshifted.size === 0 &&
    menus.length > 0;

  return (
    <div>
      <h1 className="text-xl font-bold">初期設定</h1>
      <p className="mt-1 text-sm text-mute">
        予約を受け付けるために必要な項目を順に設定します。
      </p>

      <div className="mt-4 flex items-center gap-1 text-xs">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStep(i)}
              className={`rounded-full px-2.5 py-1 ${
                step === i
                  ? "bg-ink text-paper"
                  : "bg-card text-mute border hairline"
              }`}
            >
              {i + 1}. {s}
            </button>
            {i < STEPS.length - 1 && <span className="text-mute">›</span>}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border hairline bg-card p-6">
        {step === 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateSalon(salonForm), 1);
            }}
            className="space-y-4"
          >
            <div>
              <label className={label}>店舗名 *</label>
              <input
                required
                value={salonForm.name}
                onChange={setSalon("name")}
                className={input}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>電話番号</label>
                <input
                  value={salonForm.phone}
                  onChange={setSalon("phone")}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>郵便番号</label>
                <input
                  value={salonForm.postal_code}
                  onChange={setSalon("postal_code")}
                  className={input}
                />
              </div>
            </div>
            <div>
              <label className={label}>住所</label>
              <input
                value={salonForm.address}
                onChange={setSalon("address")}
                className={input}
              />
            </div>
            <div>
              <label className={label}>
                予約通知メール(新規予約・キャンセルを受け取る)
              </label>
              <input
                type="email"
                value={salonForm.notify_email}
                onChange={setSalon("notify_email")}
                className={input}
              />
            </div>
            <WizardNav busy={busy} error={error} next="保存して次へ" />
          </form>
        )}

        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const open = hours.filter((r) => r.open);
              // 全曜日休みで保存しても成功するが予約枠は0件になるので
              // ウィザードでは1日以上の営業日を必須にする
              if (open.length === 0) {
                setError("最低1日の営業日を設定してください");
                return;
              }
              run(async () => {
                const res = await saveBusinessHours(
                  open.map((r) => ({
                    day_of_week: r.day_of_week,
                    start_time: r.start_time,
                    end_time: r.end_time,
                  }))
                );
                if (!res.error) setHoursDone(true);
                return res;
              }, 2);
            }}
          >
            <div className="space-y-3">
              {hours.map((r) => (
                <div key={r.day_of_week} className="flex items-center gap-3">
                  <span className="w-8 text-sm font-medium">
                    {DOW[r.day_of_week]}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-mute">
                    <input
                      type="checkbox"
                      checked={!r.open}
                      onChange={(e) =>
                        patchHours(r.day_of_week, { open: !e.target.checked })
                      }
                      className="accent-neutral-700"
                    />
                    休み
                  </label>
                  <input
                    type="time"
                    value={r.start_time}
                    disabled={!r.open}
                    onChange={(e) =>
                      patchHours(r.day_of_week, {
                        start_time: e.target.value,
                      })
                    }
                    className={`${input} w-auto disabled:opacity-40`}
                  />
                  <span className="text-mute">〜</span>
                  <input
                    type="time"
                    value={r.end_time}
                    disabled={!r.open}
                    onChange={(e) =>
                      patchHours(r.day_of_week, { end_time: e.target.value })
                    }
                    className={`${input} w-auto disabled:opacity-40`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-mute">
              営業時間外は予約枠が出ません。祝日・臨時休業はあとから「シフト・休み」で設定できます。
            </p>
            <WizardNav busy={busy} error={error} next="保存して次へ" />
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {unshifted.size > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                <p>
                  シフトが未設定のスタッフがいます —
                  このままではそのスタッフの予約枠が出ません。
                </p>
                {hoursDone ? (
                  <button
                    type="button"
                    onClick={seedShifts}
                    disabled={busy}
                    className={`${btnSub} mt-2`}
                  >
                    {busy ? "設定中…" : "営業時間と同じシフトを自動設定"}
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-mute">
                    先に営業時間のステップで営業時間を保存してください。
                  </p>
                )}
              </div>
            )}
            {staffList.length > 0 && (
              <ul className="divide-y hairline rounded-lg border hairline">
                {staffList.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-mute">
                      {ROLE_LABEL[s.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addStaff} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>スタッフ名 *</label>
                  <input
                    required
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className={input}
                    placeholder="例: 山田 太郎"
                  />
                </div>
                <div>
                  <label className={label}>役職</label>
                  <select
                    value={staffRole}
                    onChange={(e) =>
                      setStaffRole(e.target.value as Staff["role"])
                    }
                    className={input}
                  >
                    <option value="owner">オーナー</option>
                    <option value="stylist">スタイリスト</option>
                    <option value="assistant">アシスタント</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={busy} className={btnSub}>
                {busy ? "追加中…" : "スタッフを追加"}
              </button>
            </form>
            <WizardNav
              busy={busy}
              error={error}
              next="次へ"
              onNext={() => setStep(3)}
              nextDisabled={
                staffList.length === 0 || unshifted.size > 0
              }
              hint={
                staffList.length === 0
                  ? "1人以上追加してください"
                  : unshifted.size > 0
                    ? "上のボタンでシフトを設定するか、あとからシフト設定で登録してください"
                    : undefined
              }
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {menus.length > 0 && (
              <ul className="divide-y hairline rounded-lg border hairline">
                {menus.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="text-xs text-mute tabular-nums">
                      ¥{m.price.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addMenu} className="space-y-3">
              <div>
                <label className={label}>メニュー名 *</label>
                <input
                  required
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  className={input}
                  placeholder="例: カット"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={label}>価格(円) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={menuPrice}
                    onChange={(e) => setMenuPrice(e.target.value)}
                    className={input}
                  />
                </div>
                <div>
                  <label className={label}>所要時間(分) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={menuMinutes}
                    onChange={(e) => setMenuMinutes(e.target.value)}
                    className={input}
                  />
                </div>
                <div>
                  <label className={label}>決済方法</label>
                  <select
                    value={menuPay}
                    onChange={(e) =>
                      setMenuPay(
                        e.target.value as
                          | "on_site"
                          | "prepaid"
                          | "card_on_file"
                      )
                    }
                    className={input}
                  >
                    <option value="on_site">現地払い</option>
                    <option value="prepaid">事前決済(カード)</option>
                    <option value="card_on_file">
                      カード登録(当日払い・キャンセル料あり)
                    </option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-mute">
                担当は全スタッフに割り当てられます。担当者の絞り込み・説明文・表示順はあとからメニュー設定で変更できます。
              </p>
              <button type="submit" disabled={busy} className={btnSub}>
                {busy ? "追加中…" : "メニューを追加"}
              </button>
            </form>
            <WizardNav
              busy={busy}
              error={error}
              next="完了へ"
              onNext={() => setStep(4)}
              nextDisabled={menus.length === 0}
              hint={
                menus.length === 0 ? "1件以上追加してください" : undefined
              }
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 text-sm">
            <p className="font-medium">
              {allDone
                ? "初期設定が完了しました。予約を受け付けられます。"
                : "未設定の項目があります。"}
            </p>
            {!hoursDone && (
              <p className="text-red-700">
                営業時間が未設定です — このままでは予約枠が出ません。
              </p>
            )}
            {staffList.length === 0 && (
              <p className="text-red-700">スタッフが未登録です。</p>
            )}
            {unshifted.size > 0 && (
              <p className="text-red-700">
                シフトが未設定のスタッフがいます —
                スタッフのステップで自動設定できます。
              </p>
            )}
            {menus.length === 0 && (
              <p className="text-red-700">メニューが未登録です。</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/s/${slug}`}
                target="_blank"
                className={btn}
              >
                予約ページを開く
              </a>
              <Link href="/admin" className={btnSub}>
                管理画面へ
              </Link>
            </div>
            <p className="text-xs text-mute">
              シフト・定休日・デザイン・決済連携などの詳細設定は「設定」メニューから行えます。
            </p>
          </div>
        )}
      </div>

      {step < 4 && (
        <p className="mt-3 text-xs text-mute">
          あとで設定する場合は
          <Link href="/admin" className="underline underline-offset-2">
            管理画面へ戻る
          </Link>
          (設定は途中まで保存されます)
        </p>
      )}
    </div>
  );
}

function WizardNav({
  busy,
  error,
  next,
  onNext,
  nextDisabled,
  hint,
}: {
  busy: boolean;
  error: string | null;
  next: string;
  onNext?: () => void;
  nextDisabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="mt-5 flex items-center gap-3">
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          disabled={busy || nextDisabled}
          className={btn}
        >
          {next}
        </button>
      ) : (
        <button type="submit" disabled={busy} className={btn}>
          {busy ? "保存中…" : next}
        </button>
      )}
      {hint && <span className="text-xs text-mute">{hint}</span>}
      {error && <span className="text-sm text-red-700">{error}</span>}
    </div>
  );
}
