export type SalonTemplate = "photo" | "card" | "simple";

export interface Salon {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  fee_rate_direct_bps: number;
  fee_rate_mall_bps: number;
  template: SalonTemplate;
  theme_color: string;
  hero_image_url: string | null;
  notify_email: string | null;
  stripe_account_id: string | null;
  stripe_onboarded: boolean;
}

export interface Staff {
  id: string;
  salon_id: string;
  name: string;
  role: "owner" | "stylist" | "assistant";
  photo_url: string | null;
  bio: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Menu {
  id: string;
  salon_id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  buffer_minutes: number;
  payment_mode: "any" | "prepaid" | "card_on_file" | "on_site";
  is_active: boolean;
  sort_order: number;
}

export interface BusinessHours {
  salon_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface Shift {
  id: string;
  staff_id: string;
  day_of_week: number | null;
  date: string | null;
  start_time: string;
  end_time: string;
}

export interface TimeOff {
  id: string;
  salon_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface Customer {
  id: string;
  salon_id: string;
  name: string;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export interface Kart {
  id: string;
  salon_id: string;
  customer_id: string;
  appointment_id: string | null;
  staff_id: string | null;
  visited_at: string;
  memo: string | null;
  photo_urls: string[];
}

export interface Payment {
  id: string;
  appointment_id: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  amount: number;
  application_fee_amount: number;
  currency: string;
  status: "pending" | "succeeded" | "refunded" | "failed";
  paid_at: string | null;
}

export interface Appointment {
  id: string;
  salon_id: string;
  staff_id: string;
  customer_id: string;
  menu_id: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  channel: "direct" | "mall" | "manual";
  payment_mode: "prepaid" | "card_on_file" | "on_site";
  customer_note: string | null;
  manage_token: string;
  reminder_sent_at: string | null;
  created_at: string;
}
