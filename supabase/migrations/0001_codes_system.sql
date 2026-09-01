-- ============================================================
-- SISTEMA CODICI MONOUSO — PUNTI E CONSUMAZIONI
-- Tutta la logica di valore/validazione vive nel database:
-- il client può solo dire "voglio usare il codice XYZ".
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Profili / ruoli ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'student' check (role in ('student','admin')),
  level       int  not null default 1,
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Obiettivi / premi ----------
-- counter_key: 'points' oppure il nome di un prodotto (es. 'CAFFE')
create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  counter_key  text not null default 'points',
  target       int  not null check (target > 0),
  reward       text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------- Lotti ----------
create table if not exists public.code_lots (
  id                     uuid primary key default gen_random_uuid(),
  lot_number             text not null unique,
  name                   text not null,
  value_type             text not null check (value_type in ('points','quantity','bonus','product','promotion')),
  value_amount           int  not null default 1 check (value_amount >= 0),
  product_key            text,                 -- per quantity/product (es. 'CAFFE')
  promotion_id           uuid,                 -- per promotion
  code_format            text not null check (code_format in ('numeric','alphanumeric','qr','numeric_qr')),
  code_length            int  not null default 6 check (code_length between 6 and 32),
  total_codes            int  not null default 0,
  valid_from             timestamptz,
  expires_at             timestamptz,
  status                 text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED')),
  max_codes_per_student_per_day int,
  max_points_per_student_per_day int,
  max_total_uses         int,
  min_level              int,
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now()
);

-- ---------- Codici ----------
create table if not exists public.codes (
  id              uuid primary key default gen_random_uuid(),
  lot_id          uuid not null references public.code_lots(id) on delete cascade,
  code            text not null unique,                       -- vincolo di univocità
  status          text not null default 'ACTIVE' check (status in ('ACTIVE','USED','EXPIRED','CANCELLED')),
  used_by         uuid references auth.users(id),
  used_at         timestamptz,
  transaction_id  bigint,
  created_at      timestamptz not null default now()
);
create index if not exists codes_lot_status_idx on public.codes(lot_id, status);
create index if not exists codes_used_by_idx on public.codes(used_by, used_at);

-- ---------- Storico transazioni ----------
create table if not exists public.code_transactions (
  id             bigint generated always as identity primary key,
  code_id        uuid not null references public.codes(id),
  code_value     text not null,
  student_id     uuid not null references auth.users(id),
  lot_id         uuid not null references public.code_lots(id),
  promotion_id   uuid,
  product_key    text,
  value_type     text not null,
  points         int  not null default 0,
  quantity       int  not null default 0,
  device_id      text,
  status         text not null default 'OK',
  created_at     timestamptz not null default now()
);
create index if not exists code_tx_student_idx on public.code_transactions(student_id, created_at);
-- un codice può comparire una sola volta nello storico
create unique index if not exists code_tx_code_unique on public.code_transactions(code_id);

-- ---------- Contatori studente ----------
create table if not exists public.student_counters (
  student_id   uuid not null references auth.users(id) on delete cascade,
  counter_key  text not null,       -- 'points' | product_key
  value        int  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (student_id, counter_key)
);

-- ---------- Premi sbloccati ----------
create table if not exists public.unlocked_rewards (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references auth.users(id) on delete cascade,
  goal_id      uuid not null references public.goals(id),
  reward       text not null,
  unlocked_at  timestamptz not null default now(),
  redeemed_at  timestamptz
);

-- ---------- Notifiche admin ----------
create table if not exists public.admin_notifications (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  title        text not null,
  body         jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- Statistiche lotto in tempo reale
-- ============================================================
create or replace view public.lot_stats as
select
  l.*,
  count(c.id) filter (where c.status = 'USED')      as used_count,
  count(c.id) filter (where c.status = 'ACTIVE'
      and (l.expires_at is null or l.expires_at > now())) as available_count,
  count(c.id) filter (where c.status = 'EXPIRED'
      or (c.status = 'ACTIVE' and l.expires_at is not null and l.expires_at <= now())) as expired_count,
  count(c.id) filter (where c.status = 'CANCELLED')  as cancelled_count,
  case when count(c.id) = 0 then 0
       else round(100.0 * count(c.id) filter (where c.status = 'USED') / count(c.id), 2) end as usage_percent
from public.code_lots l
left join public.codes c on c.lot_id = l.id
group by l.id;

-- ============================================================
-- Generazione codici casuali (CSPRNG) — solo admin
-- ============================================================
create or replace function public.random_code(p_format text, p_len int)
returns text language plpgsql volatile as $$
declare
  alphabet text;
  bytes    bytea;
  out_code text := '';
  i        int;
begin
  if p_format = 'alphanumeric' then
    alphabet := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- senza caratteri ambigui
  else
    alphabet := '0123456789';
  end if;
  bytes := gen_random_bytes(p_len);
  for i in 0 .. p_len - 1 loop
    out_code := out_code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return out_code;
end;
$$;

create or replace function public.generate_code_lot(
  p_name          text,
  p_value_type    text,
  p_value_amount  int,
  p_quantity      int,
  p_code_format   text default 'numeric_qr',
  p_code_length   int  default 6,
  p_product_key   text default null,
  p_promotion_id  uuid default null,
  p_valid_from    timestamptz default null,
  p_expires_at    timestamptz default null,
  p_max_codes_per_student_per_day int default null,
  p_max_points_per_student_per_day int default null,
  p_max_total_uses int default null,
  p_min_level     int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lot_id   uuid;
  v_lot_no   text;
  v_seq      int;
  v_inserted int := 0;
  v_code     text;
  v_len      int := greatest(p_code_length, case when p_quantity > 100000 then 8 else 6 end);
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_quantity < 1 or p_quantity > 500000 then
    raise exception 'INVALID_QUANTITY';
  end if;

  select count(*) + 1 into v_seq from public.code_lots
   where created_at >= date_trunc('year', now());
  v_lot_no := to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.code_lots(lot_number, name, value_type, value_amount, product_key, promotion_id,
    code_format, code_length, total_codes, valid_from, expires_at,
    max_codes_per_student_per_day, max_points_per_student_per_day, max_total_uses, min_level, created_by)
  values (v_lot_no, p_name, p_value_type, p_value_amount, upper(p_product_key), p_promotion_id,
    p_code_format, v_len, p_quantity, p_valid_from, p_expires_at,
    p_max_codes_per_student_per_day, p_max_points_per_student_per_day, p_max_total_uses, p_min_level, auth.uid())
  returning id into v_lot_id;

  -- inserisce finché non raggiunge la quantità, ignorando le rare collisioni
  while v_inserted < p_quantity loop
    v_code := public.random_code(p_code_format, v_len);
    begin
      insert into public.codes(lot_id, code) values (v_lot_id, v_code);
      v_inserted := v_inserted + 1;
    exception when unique_violation then
      null;
    end;
  end loop;

  return v_lot_id;
end;
$$;

-- ============================================================
-- Disattivazione: singolo codice / lotto / promozione
-- ============================================================
create or replace function public.cancel_code(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.codes set status = 'CANCELLED' where code = upper(p_code) and status = 'ACTIVE';
end; $$;

create or replace function public.cancel_lot(p_lot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.code_lots set status = 'CANCELLED' where id = p_lot_id;
  update public.codes set status = 'CANCELLED' where lot_id = p_lot_id and status = 'ACTIVE';
end; $$;

create or replace function public.cancel_promotion(p_promotion_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.code_lots set status = 'CANCELLED' where promotion_id = p_promotion_id;
  update public.codes c set status = 'CANCELLED'
    from public.code_lots l where c.lot_id = l.id and l.promotion_id = p_promotion_id and c.status = 'ACTIVE';
end; $$;

-- ============================================================
-- RISCATTO ATOMICO — cuore del sistema
-- Un solo UPDATE condizionato (status = 'ACTIVE') garantisce che, con
-- due richieste simultanee, una sola ottenga la riga: la seconda vede
-- 0 righe aggiornate e riceve ALREADY_USED.
-- ============================================================
create or replace function public.redeem_code(p_code text, p_device_id text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_code_in   text := upper(regexp_replace(coalesce(p_code,''), '\s', '', 'g'));
  v_code      public.codes%rowtype;
  v_lot       public.code_lots%rowtype;
  v_level     int;
  v_key       text;
  v_points    int := 0;
  v_qty       int := 0;
  v_new_val   int;
  v_old_val   int;
  v_tx_id     bigint;
  v_goal      record;
  v_unlocked  jsonb := '[]'::jsonb;
  v_today_uses int;
  v_today_pts  int;
  v_total_uses int;
  v_name       text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  if length(v_code_in) < 4 then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  -- blocca la riga del codice (FOR UPDATE) per serializzare le verifiche
  select * into v_code from public.codes where code = v_code_in for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  select * into v_lot from public.code_lots where id = v_code.lot_id;

  if v_code.status = 'USED' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_USED');
  end if;
  if v_code.status = 'CANCELLED' or v_lot.status = 'CANCELLED' then
    return jsonb_build_object('ok', false, 'error', 'CANCELLED');
  end if;
  if v_code.status = 'EXPIRED' or (v_lot.expires_at is not null and v_lot.expires_at <= now()) then
    update public.codes set status = 'EXPIRED' where id = v_code.id and status = 'ACTIVE';
    return jsonb_build_object('ok', false, 'error', 'EXPIRED');
  end if;
  if v_lot.valid_from is not null and v_lot.valid_from > now() then
    return jsonb_build_object('ok', false, 'error', 'NOT_YET_VALID');
  end if;

  select level into v_level from public.profiles where id = v_uid;
  if v_lot.min_level is not null and coalesce(v_level,1) < v_lot.min_level then
    return jsonb_build_object('ok', false, 'error', 'LEVEL_TOO_LOW');
  end if;

  if v_lot.max_total_uses is not null then
    select count(*) into v_total_uses from public.codes where lot_id = v_lot.id and status = 'USED';
    if v_total_uses >= v_lot.max_total_uses then
      return jsonb_build_object('ok', false, 'error', 'PROMOTION_EXHAUSTED');
    end if;
  end if;

  if v_lot.max_codes_per_student_per_day is not null then
    select count(*) into v_today_uses from public.code_transactions
     where student_id = v_uid and lot_id = v_lot.id and created_at >= date_trunc('day', now());
    if v_today_uses >= v_lot.max_codes_per_student_per_day then
      return jsonb_build_object('ok', false, 'error', 'DAILY_LIMIT');
    end if;
  end if;

  if v_lot.value_type in ('points','bonus') then
    v_points := v_lot.value_amount;  v_key := 'points';
  elsif v_lot.value_type in ('quantity','product') then
    v_qty := v_lot.value_amount;     v_key := coalesce(v_lot.product_key, upper(v_lot.name));
  else
    v_key := 'promo:' || coalesce(v_lot.promotion_id::text, v_lot.id::text); v_qty := 1;
  end if;

  if v_lot.max_points_per_student_per_day is not null and v_points > 0 then
    select coalesce(sum(points),0) into v_today_pts from public.code_transactions
     where student_id = v_uid and created_at >= date_trunc('day', now());
    if v_today_pts + v_points > v_lot.max_points_per_student_per_day then
      return jsonb_build_object('ok', false, 'error', 'DAILY_POINTS_LIMIT');
    end if;
  end if;

  -- === cambio stato atomico: solo se ancora ACTIVE ===
  update public.codes
     set status = 'USED', used_by = v_uid, used_at = now()
   where id = v_code.id and status = 'ACTIVE';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_USED');
  end if;

  insert into public.code_transactions(code_id, code_value, student_id, lot_id, promotion_id, product_key,
      value_type, points, quantity, device_id, status)
  values (v_code.id, v_code.code, v_uid, v_lot.id, v_lot.promotion_id, v_lot.product_key,
      v_lot.value_type, v_points, v_qty, p_device_id, 'OK')
  returning id into v_tx_id;

  update public.codes set transaction_id = v_tx_id where id = v_code.id;

  -- aggiorna contatore
  insert into public.student_counters(student_id, counter_key, value)
  values (v_uid, v_key, case when v_key = 'points' then v_points else v_qty end)
  on conflict (student_id, counter_key) do update
    set value = public.student_counters.value + excluded.value, updated_at = now()
  returning value into v_new_val;
  v_old_val := v_new_val - (case when v_key = 'points' then v_points else v_qty end);

  -- obiettivi raggiunti: ogni multiplo del target sblocca un premio
  select full_name into v_name from public.profiles where id = v_uid;
  for v_goal in select * from public.goals where active and counter_key = v_key loop
    if (v_new_val / v_goal.target) > (v_old_val / v_goal.target) then
      insert into public.unlocked_rewards(student_id, goal_id, reward) values (v_uid, v_goal.id, v_goal.reward);
      insert into public.admin_notifications(type, title, body)
      values ('GOAL_REACHED', 'OBIETTIVO RAGGIUNTO', jsonb_build_object(
        'student_id', v_uid, 'student_name', coalesce(v_name, v_uid::text),
        'goal', v_goal.name, 'target', v_goal.target, 'reward', v_goal.reward,
        'date', now()));
      v_unlocked := v_unlocked || jsonb_build_object('goal', v_goal.name, 'reward', v_goal.reward, 'target', v_goal.target);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx_id,
    'lot_name', v_lot.name,
    'value_type', v_lot.value_type,
    'counter_key', v_key,
    'points', v_points,
    'quantity', v_qty,
    'new_balance', v_new_val,
    'next_goal', (select jsonb_build_object('name', g.name, 'target', g.target, 'reward', g.reward)
                    from public.goals g where g.active and g.counter_key = v_key
                   order by g.target limit 1),
    'unlocked', v_unlocked
  );
end;
$$;

-- ============================================================
-- Stato studente (saldo, contatori, premi)
-- ============================================================
create or replace function public.my_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'counters', coalesce((select jsonb_object_agg(counter_key, value) from public.student_counters where student_id = auth.uid()), '{}'::jsonb),
    'goals', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'counter_key', counter_key, 'target', target, 'reward', reward) order by counter_key, target) from public.goals where active), '[]'::jsonb),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reward', reward, 'unlocked_at', unlocked_at, 'redeemed_at', redeemed_at) order by unlocked_at desc) from public.unlocked_rewards where student_id = auth.uid()), '[]'::jsonb)
  );
$$;

create or replace function public.redeem_reward(p_reward_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.unlocked_rewards set redeemed_at = now()
   where id = p_reward_id and student_id = auth.uid() and redeemed_at is null;
$$;

-- ============================================================
-- RLS: gli studenti non leggono mai la tabella codici
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.goals               enable row level security;
alter table public.code_lots           enable row level security;
alter table public.codes               enable row level security;
alter table public.code_transactions   enable row level security;
alter table public.student_counters    enable row level security;
alter table public.unlocked_rewards    enable row level security;
alter table public.admin_notifications enable row level security;

create policy profiles_self   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy goals_read      on public.goals for select using (true);
create policy goals_admin     on public.goals for all using (public.is_admin()) with check (public.is_admin());
create policy lots_admin      on public.code_lots for all using (public.is_admin()) with check (public.is_admin());
create policy codes_admin     on public.codes for all using (public.is_admin()) with check (public.is_admin());
create policy tx_read         on public.code_transactions for select using (student_id = auth.uid() or public.is_admin());
create policy counters_read   on public.student_counters for select using (student_id = auth.uid() or public.is_admin());
create policy rewards_read    on public.unlocked_rewards for select using (student_id = auth.uid() or public.is_admin());
create policy notif_admin     on public.admin_notifications for all using (public.is_admin()) with check (public.is_admin());

-- profilo automatico alla registrazione
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

grant execute on function public.redeem_code(text, text) to authenticated;
grant execute on function public.my_status() to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;
grant execute on function public.generate_code_lot(text,text,int,int,text,int,text,uuid,timestamptz,timestamptz,int,int,int,int) to authenticated;
grant execute on function public.cancel_code(text) to authenticated;
grant execute on function public.cancel_lot(uuid) to authenticated;
grant execute on function public.cancel_promotion(uuid) to authenticated;

-- obiettivi di esempio
insert into public.goals(name, counter_key, target, reward) values
  ('300 punti', 'points', 300, 'Caffè gratis'),
  ('5 caffè', 'CAFFE', 5, 'Caffè gratis')
on conflict do nothing;
