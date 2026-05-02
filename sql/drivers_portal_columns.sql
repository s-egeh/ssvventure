-- Phase 23: Driver portal fields (license expiry + optional truck assignment).
-- Run in Supabase SQL Editor after public.trucks exists.

alter table public.drivers
    add column if not exists license_expiry date;

alter table public.drivers
    add column if not exists assigned_truck_id bigint references public.trucks (id) on delete set null;

create index if not exists idx_drivers_assigned_truck_id on public.drivers (assigned_truck_id);
