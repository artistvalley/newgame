-- Canonical 14×14 staging schema. Not applied to production Neon or PlanetScale.
-- Terra Nova is recorded only as an unread legacy note.

create table if not exists worlds (
  id text primary key,
  name text not null,
  rows int not null default 14 check (rows = 14),
  cols int not null default 14 check (cols = 14),
  day int not null default 1 check (day >= 1),
  rules_version text not null default 'canon-14-1'
);

create table if not exists territories (
  id text primary key,
  world_id text not null references worlds (id),
  row int not null check (row between 0 and 13),
  col int not null check (col between 0 and 13),
  terrain text not null,
  resources text not null default '',
  census int not null default 0,
  status text not null check (status in ('OCEAN', 'AVAILABLE', 'OWNED')),
  unique (world_id, row, col)
);
create index if not exists territories_status_idx on territories (status);

create table if not exists countries (
  id text primary key,
  world_id text not null references worlds (id),
  user_id text not null unique,
  name text not null,
  government text not null,
  flag_primary text not null,
  flag_secondary text not null,
  flag_symbol text not null,
  treasury bigint not null default 1000000 check (treasury >= 0),
  population bigint not null default 100000 check (population >= 0),
  stability int not null default 70 check (stability between 0 and 100),
  economy int not null default 50 check (economy between 0 and 100),
  technology int not null default 1 check (technology between 1 and 12),
  logistics int not null default 0 check (logistics >= 0),
  tax_bp int not null default 1000 check (tax_bp between 0 and 3000),
  agri_bp int not null default 4000,
  industry_bp int not null default 2000,
  infra_bp int not null default 2500,
  reserves_bp int not null default 1500,
  food bigint not null default 0 check (food >= 0),
  water bigint not null default 0 check (water >= 0),
  wood bigint not null default 0 check (wood >= 0),
  ore bigint not null default 0 check (ore >= 0),
  stone bigint not null default 0 check (stone >= 0),
  energy bigint not null default 0 check (energy >= 0),
  goods bigint not null default 0 check (goods >= 0),
  infra_damage int not null default 0 check (infra_damage between 0 and 40),
  military_deaths bigint not null default 0,
  wounded bigint not null default 0,
  disabled_count bigint not null default 0,
  civilian_deaths bigint not null default 0,
  displaced bigint not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  check (agri_bp + industry_bp + infra_bp + reserves_bp = 10000),
  check (agri_bp >= 0 and industry_bp >= 0 and infra_bp >= 0 and reserves_bp >= 0)
);
create unique index if not exists countries_name_lower_idx on countries (lower(name));

create table if not exists country_territories (
  territory_id text primary key references territories (id),
  country_id text not null references countries (id) on delete cascade,
  is_capital boolean not null default false
);
create index if not exists country_territories_country_idx on country_territories (country_id);

create table if not exists capitals (
  country_id text primary key references countries (id) on delete cascade,
  territory_id text not null unique references territories (id)
);

create table if not exists player_roles (
  user_id text primary key,
  role text not null check (role in ('player', 'admin'))
);

create table if not exists player_bans (
  user_id text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists idempotency_keys (
  user_id text not null,
  key text not null,
  action text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists audit_log (
  id bigserial primary key,
  user_id text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists game_actions (
  id bigserial primary key,
  user_id text not null,
  country_id text,
  action text not null,
  day int not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists economy_ticks (
  world_id text not null references worlds (id),
  day int not null,
  applied_at timestamptz not null default now(),
  primary key (world_id, day)
);

create table if not exists treasury_ledger (
  id bigserial primary key,
  country_id text not null references countries (id),
  day int not null,
  amount bigint not null,
  reason text not null,
  balance_after bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists research_projects (
  id text primary key,
  country_id text not null references countries (id),
  title text not null,
  cost bigint not null check (cost >= 0),
  days_total int not null check (days_total between 2 and 7),
  days_left int not null check (days_left >= 0),
  status text not null check (status in ('active', 'complete', 'rejected')),
  created_day int not null,
  completed_day int
);
create index if not exists research_active_idx on research_projects (country_id, status);

create table if not exists military_units (
  id text primary key,
  country_id text not null references countries (id),
  name text not null,
  strength int not null default 10 check (strength > 0),
  created_day int not null
);

create table if not exists battles (
  id text primary key,
  attacker_id text not null references countries (id),
  defender_id text references countries (id),
  target_territory_id text not null references territories (id),
  posture text not null check (posture in ('probe', 'assault', 'defend')),
  spend bigint not null,
  strength int not null,
  defender_strength int not null,
  probability numeric not null,
  outcome text not null,
  military_deaths int not null,
  wounded int not null,
  disabled_count int not null,
  civilian_deaths int not null,
  displaced int not null,
  territory_changed boolean not null,
  day int not null,
  created_at timestamptz not null default now()
);

create table if not exists training_battles (
  id text primary key,
  country_id text not null references countries (id),
  target_territory_id text not null,
  posture text not null,
  spend bigint not null,
  outcome text not null,
  military_deaths int not null,
  wounded int not null,
  disabled_count int not null,
  civilian_deaths int not null,
  displaced int not null,
  day int not null,
  created_at timestamptz not null default now()
);

create table if not exists human_cost_entries (
  id bigserial primary key,
  battle_id text,
  country_id text not null references countries (id),
  military_deaths int not null,
  wounded int not null,
  disabled_count int not null,
  civilian_deaths int not null,
  displaced int not null,
  day int not null
);

create table if not exists population_effects (
  id bigserial primary key,
  country_id text not null references countries (id),
  day int not null,
  kind text not null,
  population_delta bigint not null,
  stability_delta int not null
);

create table if not exists rehabilitation_projects (
  id text primary key,
  country_id text not null references countries (id),
  cost bigint not null,
  day int not null,
  infra_after int not null,
  displaced_after bigint not null
);

create table if not exists infrastructure (
  country_id text primary key references countries (id),
  damage int not null default 0 check (damage between 0 and 40)
);

create table if not exists agreements (
  id text primary key,
  world_id text not null references worlds (id),
  kind text not null check (kind in ('peace', 'alliance', 'ceasefire', 'surrender')),
  proposer_id text not null references countries (id),
  target_id text not null references countries (id),
  status text not null check (status in ('proposed', 'active', 'rejected', 'expired')),
  expires_day int,
  created_day int not null
);

create table if not exists diplomatic_messages (
  id text primary key,
  from_country text not null references countries (id),
  to_country text not null references countries (id),
  body text not null,
  day int not null,
  created_at timestamptz not null default now()
);

create table if not exists zetos_wallets (
  user_id text primary key,
  balance bigint not null default 0 check (balance >= 0)
);

create table if not exists zetos_ledger (
  id text primary key,
  user_id text not null references zetos_wallets (user_id),
  amount bigint not null,
  reason text not null,
  balance_after bigint not null check (balance_after >= 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists zetos_packages (
  id text primary key,
  name text not null,
  active boolean not null default false,
  note text not null
);

create table if not exists legacy_neon_world (
  id text primary key,
  note text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists legacy_live_saves (
  id text primary key,
  note text not null
);

create table if not exists system_settings (
  key text primary key,
  value jsonb not null
);

insert into worlds (id, name) values ('canon', 'Canonical World')
on conflict (id) do nothing;

insert into system_settings (key, value) values
  ('purchases_enabled', 'false'::jsonb),
  ('ai_providers_enabled', 'false'::jsonb),
  ('rules_version', '"canon-14-1"'::jsonb)
on conflict (key) do nothing;

insert into zetos_packages (id, name, active, note) values
  ('staging-display-only', 'Display only', false, 'Real-money purchases are disabled. This row cannot be activated by the client.')
on conflict (id) do nothing;

insert into legacy_neon_world (id, note, payload) values (
  'terra-nova',
  'The 24×14 Terra Nova world is a separate read-only legacy archive. It was not imported, converted, or merged. Production Neon was not contacted because its credentials had not been rotated.',
  '{"imported":false,"width":24,"height":14}'::jsonb
) on conflict (id) do nothing;

insert into legacy_live_saves (id, note) values (
  'grok-01a1b1f5',
  'Live Grok commander JSON was not exported. Server-function reads returned 403 without a player session. Those saves were not overwritten.'
) on conflict (id) do nothing;

do $$
declare
  r int;
  c int;
  ring int;
  ocean boolean;
  terrains text[] := array['Plains','Forest','Hills','Desert','Mountain','Riverland'];
  res text[] := array['Food,Wood','Wood,Ore','Ore,Stone','Food','Stone,Ore','Food,Water'];
  terrain text;
  resources text;
  census int;
  status text;
  tid text;
begin
  for r in 0..13 loop
    for c in 0..13 loop
      ring := least(r, c, 13 - r, 13 - c);
      ocean := ring = 0 or ((r * 7 + c * 11) % 23 = 0 and ring < 3);
      tid := 'T-' || lpad((r + 1)::text, 2, '0') || '-' || lpad((c + 1)::text, 2, '0');
      if ocean then
        terrain := 'Ocean';
        resources := '';
        census := 0;
        status := 'OCEAN';
      else
        terrain := terrains[1 + ((r * 3 + c * 5) % 6)];
        resources := res[1 + ((r + c * 2) % 6)];
        census := 8000 + ((r * 31 + c * 17) % 42000);
        status := 'AVAILABLE';
      end if;
      insert into territories (id, world_id, row, col, terrain, resources, census, status)
      values (tid, 'canon', r, c, terrain, resources, census, status)
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;
