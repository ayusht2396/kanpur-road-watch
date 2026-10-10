-- Paste this whole file into Supabase > SQL Editor > Run.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null check (lat between 26.30 and 26.60),
  lng double precision not null check (lng between 80.15 and 80.55),
  severity text not null check (severity in ('minor','moderate','severe','dangerous')),
  type text not null check (type in ('pothole','broken','waterlogging','manhole','other')),
  description text not null default '' check (char_length(description) <= 400),
  photo_path text check (photo_path ~ '^[0-9a-f-]{36}\.jpg$'),
  created_at timestamptz not null default now(),
  confirm_votes int not null default 1,
  fixed_votes int not null default 0,
  ip text not null default ''
);
create table if not exists vote_log (ip text not null, created_at timestamptz not null default now());
alter table reports enable row level security;
alter table vote_log enable row level security;

create or replace function client_ip() returns text language sql stable as $$
  select coalesce(trim(split_part(coalesce(nullif(current_setting('request.headers', true),'')::json->>'x-forwarded-for',''), ',', 1)), '')
$$;

-- Visitors may read (hiding the ip column) and add reports, nothing else.
revoke all on reports from anon, authenticated;
grant select (id,lat,lng,severity,type,description,photo_path,created_at,confirm_votes,fixed_votes) on reports to anon, authenticated;
grant insert (lat,lng,severity,type,description,photo_path) on reports to anon, authenticated;
drop policy if exists "read open reports" on reports;
create policy "read open reports" on reports for select using (fixed_votes < 3);
drop policy if exists "add reports" on reports;
create policy "add reports" on reports for insert with check (true);

-- Limit: 15 new reports per hour per IP address.
create or replace function reports_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_ip text := client_ip();
begin
  new.ip := v_ip; new.confirm_votes := 1; new.fixed_votes := 0;
  if v_ip <> '' and (select count(*) from reports where ip = v_ip and created_at > now() - interval '1 hour') >= 15 then
    raise exception 'Too many reports. Try again later.';
  end if;
  return new;
end $$;
drop trigger if exists reports_guard_trg on reports;
create trigger reports_guard_trg before insert on reports for each row execute function reports_guard();

-- Voting ("Still bad" / "It's fixed"): 30 per hour per IP.
create or replace function vote_report(report_id uuid, kind text) returns void language plpgsql security definer set search_path = public as $$
declare v_ip text := client_ip(); v_report_id uuid;
begin
  if kind is null or kind not in ('confirm','fixed') then raise exception 'Bad vote'; end if;
  if v_ip <> '' and (select count(*) from vote_log where ip = v_ip and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many votes. Try again later.';
  end if;
  update reports set confirm_votes = confirm_votes + (kind = 'confirm')::int,
                     fixed_votes = fixed_votes + (kind = 'fixed')::int
  where id = report_id returning id into v_report_id;
  if not found then raise exception 'Report not found'; end if;
  insert into vote_log(ip) values (v_ip);
end $$;
revoke all on function vote_report(uuid, text) from public;
grant execute on function vote_report(uuid, text) to anon, authenticated;

-- Photo storage: public bucket, JPEG only, 3 MB max.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('road-photos', 'road-photos', true, 3145728, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];
drop policy if exists "anyone uploads photos" on storage.objects;
create policy "anyone uploads photos" on storage.objects for insert to anon, authenticated with check (bucket_id = 'road-photos');
