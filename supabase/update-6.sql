-- DRK OV Loppersum – Update 6: Getränkepauschale wahlweise pro Monat oder pro Jahr
-- Einmal im Supabase „SQL Editor“ ausführen (neue Abfrage → einfügen → Run).
-- Voraussetzung: update-5.sql wurde ausgeführt. Bestehende Daten bleiben erhalten, alle bisherigen
-- Pauschalen gelten weiter „pro Jahr“. Das Skript kann gefahrlos mehrfach ausgeführt werden.

alter table public.vw_settings add column if not exists drinks_period text not null default 'jahr';
alter table public.vw_members  add column if not exists drinks_period text not null default 'jahr';

alter table public.vw_settings drop constraint if exists vw_settings_drinks_period_check;
alter table public.vw_settings add constraint vw_settings_drinks_period_check check (drinks_period in ('monat', 'jahr'));
alter table public.vw_members drop constraint if exists vw_members_drinks_period_check;
alter table public.vw_members add constraint vw_members_drinks_period_check check (drinks_period in ('monat', 'jahr'));
