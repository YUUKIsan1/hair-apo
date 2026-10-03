import type {
  Appointment,
  BusinessHours,
  Menu,
  Shift,
  TimeOff,
} from "@/lib/types";

const SLOT_STEP_MIN = 30;
const LEAD_MINUTES = 60; // 直前予約は60分前まで

export interface Slot {
  /** ISO 8601 (+09:00) */
  start: string;
  /** "HH:mm" 表示用 */
  label: string;
  /** この枠で施術可能なスタッフID */
  staffIds: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** JSTの日付文字列+時刻("HH:mm" or "HH:mm:ss")からDateを作る */
function jst(date: string, time: string): Date {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}+09:00`);
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function fmtLabel(d: Date): string {
  // JST時刻を取り出す
  const j = new Date(d.getTime() + 9 * 3600_000);
  return `${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`;
}

function fmtIso(d: Date): string {
  const j = new Date(d.getTime() + 9 * 3600_000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(
    j.getUTCDate()
  )}T${fmtLabel(d)}:00+09:00`;
}

/** date("YYYY-MM-DD")の曜日(ホストTZに依存しないようUTCで計算) */
export function jstDayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

interface Args {
  date: string;
  staffId: string;
  menu: Menu;
  shifts: Shift[];
  businessHours: BusinessHours[];
  timeOffs: TimeOff[];
  appointments: Appointment[];
  now?: Date;
}

/**
 * あるスタッフの、ある日の予約可能枠を返す。
 * 公開枠 = シフト ∩ 営業時間 − time_off − 確定済み予約 − 施術+バッファが収まる30分グリッド
 * appointment.ends_at には「施術時間+バッファ」まで含めて保存する前提。
 */
export function slotsForStaff({
  date,
  staffId,
  menu,
  shifts,
  businessHours,
  timeOffs,
  appointments,
  now = new Date(),
}: Args): { start: number; end: number }[] {
  const dow = jstDayOfWeek(date);
  const bh = businessHours.find((b) => b.day_of_week === dow);
  if (!bh) return [];

  const bhStart = jst(date, bh.start_time).getTime();
  const bhEnd = jst(date, bh.end_time).getTime();

  const staffShifts = shifts.filter(
    (s) =>
      s.staff_id === staffId &&
      (s.date === date || (s.date === null && s.day_of_week === dow))
  );
  if (staffShifts.length === 0) return [];

  const busy: [number, number][] = [
    ...appointments
      .filter((a) => a.staff_id === staffId)
      .map(
        (a) =>
          [new Date(a.starts_at).getTime(), new Date(a.ends_at).getTime()] as [
            number,
            number
          ]
      ),
    ...timeOffs
      .filter((t) => t.staff_id === null || t.staff_id === staffId)
      .map(
        (t) =>
          [new Date(t.starts_at).getTime(), new Date(t.ends_at).getTime()] as [
            number,
            number
          ]
      ),
  ];

  const needMin = menu.duration_minutes + menu.buffer_minutes;
  const minStart = now.getTime() + LEAD_MINUTES * 60_000;
  const stepMs = SLOT_STEP_MIN * 60_000;
  const slots: { start: number; end: number }[] = [];

  for (const sh of staffShifts) {
    const wStart = Math.max(jst(date, sh.start_time).getTime(), bhStart);
    const wEnd = Math.min(jst(date, sh.end_time).getTime(), bhEnd);
    // 30分グリッドに揃える(切り上げ)
    let s = Math.ceil(wStart / stepMs) * stepMs;
    for (; s + needMin * 60_000 <= wEnd; s += stepMs) {
      const e = s + needMin * 60_000;
      if (s < minStart) continue;
      if (busy.some(([bs, be]) => overlaps(s, e, bs, be))) continue;
      slots.push({ start: s, end: e });
    }
  }
  return slots;
}

/** 複数スタッフの枠を start でマージ(フリー予約用) */
export function mergeSlots(
  perStaff: Map<string, { start: number; end: number }[]>
): Slot[] {
  const map = new Map<number, string[]>();
  for (const [staffId, slots] of perStaff) {
    for (const s of slots) {
      const arr = map.get(s.start) ?? [];
      arr.push(staffId);
      map.set(s.start, arr);
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, staffIds]) => ({
      start: fmtIso(new Date(start)),
      label: fmtLabel(new Date(start)),
      staffIds: staffIds.sort(),
    }));
}

export const slotLabel = (d: Date) => fmtLabel(d);
export const slotIso = (d: Date) => fmtIso(d);
