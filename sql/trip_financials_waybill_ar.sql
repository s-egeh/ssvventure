-- Waybill tracking and accounts receivable (trip profitability). Run in Supabase SQL Editor.

alter table public.trip_financials
    add column if not exists waybill_number text;

alter table public.trip_financials
    add column if not exists is_paid boolean not null default false;

alter table public.trip_financials
    add column if not exists payment_date timestamptz;
