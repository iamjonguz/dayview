-- New accounts start with compact cards (better on phones). Existing profiles keep whatever they chose.
alter table public.profiles alter column default_density set default 'compact';
