-- Additive staging rules. Approved battle costs and economy formulas are unchanged.
-- Counterattack spend, equipment tracking and extra research effects are marked
-- awaiting owner approval and do not alter probe, assault or defend costs.

alter table countries add column if not exists equipment int not null default 0 check (equipment >= 0);
alter table battles add column if not exists equipment_lost int not null default 0;
alter table research_projects add column if not exists category text not null default 'general';
alter table zetos_ledger add column if not exists source_id text;

alter table agreements drop constraint if exists agreements_kind_check;
alter table agreements add constraint agreements_kind_check
  check (kind in ('peace', 'alliance', 'ceasefire', 'surrender', 'nonaggression'));
alter table agreements drop constraint if exists agreements_status_check;
alter table agreements add constraint agreements_status_check
  check (status in ('proposed', 'active', 'rejected', 'expired', 'cancelled'));
alter table battles drop constraint if exists battles_posture_check;
alter table battles add constraint battles_posture_check
  check (posture in ('probe', 'assault', 'defend', 'counter'));
alter table player_roles drop constraint if exists player_roles_role_check;
alter table player_roles add constraint player_roles_role_check
  check (role in ('player', 'admin', 'spectator'));

create table if not exists player_notices (
  id text primary key,
  user_id text not null,
  kind text not null,
  body text not null,
  day int not null,
  created_at timestamptz not null default now()
);

create table if not exists action_rates (
  id bigserial primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists action_rates_user_idx on action_rates (user_id, created_at);

create table if not exists auth_tokens (
  id text primary key,
  user_id text not null,
  purpose text not null check (purpose in ('verify', 'reset')),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists mail_capture (
  id text primary key,
  user_id text not null,
  purpose text not null,
  token text not null,
  created_at timestamptz not null default now()
);

insert into system_settings (key, value) values
  ('counterattack_cost', '{"amount":40000,"status":"awaiting_owner_approval"}'::jsonb),
  ('research_effects', '{"status":"awaiting_owner_approval","note":"Categories are stored. Extra production, industry, defence and agriculture bonuses are not applied."}'::jsonb)
on conflict (key) do nothing;

create or replace function wwc_rate_allow(p_user text)
returns boolean
language plpgsql
as $$
declare
  n int;
begin
  delete from action_rates where created_at < now() - interval '1 day';
  select count(*) into n from action_rates
  where user_id = p_user and created_at > now() - interval '1 minute';
  if n >= 40 then
    return false;
  end if;
  insert into action_rates (user_id) values (p_user);
  return true;
end $$;

create or replace function wwc_research_category(p_title text)
returns text
language sql
immutable
as $$
  select case
    when p_title ~* '(ration|field|farm|grain|harvest|crop)' then 'agriculture'
    when p_title ~* '(mill|factory|forge|industry|foundry)' then 'industry'
    when p_title ~* '(road|bridge|port|canal|infra)' then 'infrastructure'
    when p_title ~* '(armor|armour|shield|fort|wall|rampart)' then 'defense'
    when p_title ~* '(supply|wagon|logistic)' then 'logistics'
    else 'general'
  end
$$;

create or replace function wwc_tag_research()
returns trigger
language plpgsql
as $$
begin
  new.category := wwc_research_category(new.title);
  return new;
end $$;

drop trigger if exists research_category_tag on research_projects;
create trigger research_category_tag
before insert on research_projects
for each row execute function wwc_tag_research();

create or replace function wwc_state(p_user text)
returns jsonb
language plpgsql
stable
as $$
declare
  c countries%rowtype;
  v_day int;
  v_role text;
  v_balance bigint;
  v_country jsonb;
  v_map jsonb;
  v_projects jsonb;
  v_units int;
  v_battles jsonb;
  v_training jsonb;
  v_deals jsonb;
  v_mail jsonb;
  v_ledger jsonb;
  v_notices jsonb;
  v_books jsonb;
  v_feed jsonb;
  v_relations jsonb;
begin
  select day into v_day from worlds where id = 'canon';
  select role into v_role from player_roles where user_id = p_user;
  select balance into v_balance from zetos_wallets where user_id = p_user;
  select * into c from countries where user_id = p_user;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'row', t.row, 'col', t.col, 'terrain', t.terrain,
    'resources', t.resources, 'status', t.status,
    'ownerId', ct.country_id,
    'ownerName', oc.name,
    'capital', exists (select 1 from capitals cap where cap.territory_id = t.id)
  ) order by t.row, t.col), '[]'::jsonb)
  into v_map
  from territories t
  left join country_territories ct on ct.territory_id = t.id
  left join countries oc on oc.id = ct.country_id
  where t.world_id = 'canon';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'posture', q.posture, 'outcome', q.outcome, 'day', q.day,
    'target', q.target_territory_id, 'changed', q.territory_changed,
    'attacker', q.attacker, 'defender', q.defender
  ) order by q.created_at desc), '[]'::jsonb)
  into v_feed
  from (
    select b.id, b.posture, b.outcome, b.day, b.target_territory_id, b.territory_changed, b.created_at,
      ac.name as attacker, dc.name as defender
    from battles b
    join countries ac on ac.id = b.attacker_id
    left join countries dc on dc.id = b.defender_id
    order by b.created_at desc
    limit 8
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'body', n.body, 'day', n.day
  ) order by n.created_at desc), '[]'::jsonb)
  into v_notices
  from (select * from player_notices where user_id = p_user order by created_at desc limit 12) n;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'amount', l.amount, 'reason', l.reason, 'balanceAfter', l.balance_after
  ) order by l.created_at desc), '[]'::jsonb)
  into v_ledger from (select * from zetos_ledger where user_id = p_user order by created_at desc limit 12) l;

  if c.id is null then
    v_country := null;
    v_projects := '[]'::jsonb;
    v_units := 0;
    v_battles := '[]'::jsonb;
    v_training := '[]'::jsonb;
    v_deals := '[]'::jsonb;
    v_mail := '[]'::jsonb;
    v_books := '[]'::jsonb;
    v_relations := '[]'::jsonb;
  else
    v_country := jsonb_build_object(
      'id', c.id, 'name', c.name, 'government', c.government,
      'flagPrimary', c.flag_primary, 'flagSecondary', c.flag_secondary, 'flagSymbol', c.flag_symbol,
      'treasury', c.treasury, 'population', c.population, 'stability', c.stability,
      'economy', c.economy, 'technology', c.technology, 'logistics', c.logistics,
      'taxBp', c.tax_bp, 'agriBp', c.agri_bp, 'industryBp', c.industry_bp,
      'infraBp', c.infra_bp, 'reservesBp', c.reserves_bp,
      'food', c.food, 'water', c.water, 'wood', c.wood, 'ore', c.ore,
      'stone', c.stone, 'energy', c.energy, 'goods', c.goods,
      'infraDamage', c.infra_damage,
      'militaryDeaths', c.military_deaths, 'wounded', c.wounded,
      'disabled', c.disabled_count, 'civilianDeaths', c.civilian_deaths,
      'displaced', c.displaced, 'version', c.version,
      'equipment', c.equipment,
      'readiness', least(100, (select count(*) from military_units u where u.country_id = c.id) * 8 + c.logistics)
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'cost', p.cost, 'daysLeft', p.days_left,
      'daysTotal', p.days_total, 'status', p.status, 'category', p.category
    ) order by p.created_day desc), '[]'::jsonb)
    into v_projects from research_projects p where p.country_id = c.id;
    select count(*) into v_units from military_units u where u.country_id = c.id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'posture', b.posture, 'outcome', b.outcome, 'target', b.target_territory_id,
      'spend', b.spend, 'changed', b.territory_changed, 'day', b.day,
      'militaryDeaths', b.military_deaths, 'civilianDeaths', b.civilian_deaths,
      'wounded', b.wounded, 'disabled', b.disabled_count, 'displaced', b.displaced,
      'equipmentLost', b.equipment_lost
    ) order by b.created_at desc), '[]'::jsonb)
    into v_battles from (select * from battles where attacker_id = c.id or defender_id = c.id order by created_at desc limit 12) b;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', tb.id, 'posture', tb.posture, 'outcome', tb.outcome, 'day', tb.day,
      'militaryDeaths', tb.military_deaths
    ) order by tb.created_at desc), '[]'::jsonb)
    into v_training from (select * from training_battles where country_id = c.id order by created_at desc limit 8) tb;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'kind', a.kind, 'status', a.status, 'expiresDay', a.expires_day,
      'proposer', pc.name, 'target', tc.name, 'proposerId', a.proposer_id, 'targetId', a.target_id
    ) order by a.created_day desc), '[]'::jsonb)
    into v_deals
    from agreements a
    join countries pc on pc.id = a.proposer_id
    join countries tc on tc.id = a.target_id
    where a.proposer_id = c.id or a.target_id = c.id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'countryId', case when a.proposer_id = c.id then a.target_id else a.proposer_id end,
      'kind', a.kind, 'status', a.status
    )), '[]'::jsonb)
    into v_relations
    from agreements a
    where a.status = 'active'
      and (a.expires_day is null or a.expires_day >= v_day)
      and (a.proposer_id = c.id or a.target_id = c.id);
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'from', fc.name, 'to', tc.name, 'body', m.body, 'day', m.day
    ) order by m.created_at desc), '[]'::jsonb)
    into v_mail
    from (select * from diplomatic_messages where from_country = c.id or to_country = c.id order by created_at desc limit 20) m
    join countries fc on fc.id = m.from_country
    join countries tc on tc.id = m.to_country;
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', t.day, 'amount', t.amount, 'reason', t.reason, 'balanceAfter', t.balance_after
    ) order by t.id desc), '[]'::jsonb)
    into v_books
    from (select * from treasury_ledger where country_id = c.id order by id desc limit 8) t;
  end if;

  return jsonb_build_object(
    'ok', true,
    'day', v_day,
    'role', coalesce(v_role, 'player'),
    'rulesVersion', 'canon-14-1',
    'purchasesEnabled', false,
    'aiEnabled', false,
    'wallet', coalesce(v_balance, 0),
    'ledger', coalesce(v_ledger, '[]'::jsonb),
    'country', v_country,
    'units', v_units,
    'territories', v_map,
    'projects', v_projects,
    'battles', v_battles,
    'training', v_training,
    'agreements', v_deals,
    'relations', coalesce(v_relations, '[]'::jsonb),
    'messages', v_mail,
    'notices', coalesce(v_notices, '[]'::jsonb),
    'books', coalesce(v_books, '[]'::jsonb),
    'feed', coalesce(v_feed, '[]'::jsonb),
    'link', 'database'
  );
end $$;
