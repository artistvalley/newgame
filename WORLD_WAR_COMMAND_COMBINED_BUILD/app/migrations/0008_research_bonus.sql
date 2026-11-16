-- Preview-only research production bonuses. The flag defaults to false.
-- Staging and production stay off unless an operator sets the database flag.
-- Ordinary player actions cannot change it.

alter table research_projects drop constraint if exists research_projects_status_check;
alter table research_projects add constraint research_projects_status_check
  check (status in ('active', 'complete', 'rejected', 'cancelled'));

insert into system_settings (key, value) values
  ('research_production_bonuses', '{"enabled": false, "env": "RESEARCH_PRODUCTION_BONUSES_ENABLED"}'::jsonb)
on conflict (key) do nothing;

create or replace function wwc_research_production_enabled()
returns boolean
language sql
stable
as $$
  select coalesce((select (value->>'enabled')::boolean from system_settings where key = 'research_production_bonuses'), false)
$$;

create or replace function wwc_completed_research(p_country text, p_category text)
returns int
language sql
stable
as $$
  select count(*)::int from research_projects
  where country_id = p_country and status = 'complete' and category = p_category
$$;

create or replace function wwc_production_with_bonus(p_base bigint, p_projects int)
returns bigint
language sql
immutable
as $$
  select floor(p_base * (100 + least(8, greatest(p_projects, 0) * 2)) / 100.0)::bigint
$$;

create or replace function wwc_defence_research_bonus(p_country text)
returns int
language sql
stable
as $$
  select least(8, wwc_completed_research(p_country, 'defense') * 2)
$$;

create or replace function wwc_cancel_research(p_user text, p_project text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  r research_projects%rowtype;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  select * into c from countries where user_id = p_user;
  select * into r from research_projects where id = p_project and country_id = c.id for update;
  if r.id is null or r.status not in ('active', 'complete') then
    return jsonb_build_object('ok', false, 'error', 'That project cannot be cancelled.');
  end if;
  update research_projects set status = 'cancelled' where id = r.id;
  insert into audit_log (user_id, action, details) values (p_user, 'cancel_research', jsonb_build_object('project', r.id));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'cancel_research', v_prev);
  return v_prev;
end $$;


create or replace function wwc_advance_tick(p_user text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  v_day int;
  c record;
  food_produced bigint;
  water_produced bigint;
  goods_produced bigint;
  shortage boolean;
  new_pop bigint;
  new_stab int;
  income bigint;
  net bigint;
  new_treasury bigint;
  finished int;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if p_key is null or char_length(p_key) < 8 then
    return jsonb_build_object('ok', false, 'error', 'A new request key is required.');
  end if;
  if not exists (select 1 from countries where user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'Found a country first.');
  end if;
  select day into v_day from worlds where id = 'canon' for update;
  if exists (select 1 from economy_ticks where world_id = 'canon' and day = v_day) then
    v_prev := wwc_state(p_user) || jsonb_build_object('ok', true, 'already', true);
    insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'advance_tick', v_prev);
    return v_prev;
  end if;

  for c in select * from countries where world_id = 'canon' for update loop
    food_produced := floor(c.population * (7000 + c.agri_bp) / 10000.0);
    water_produced := floor(c.population * (4000 + floor(c.infra_bp / 2.0)) / 10000.0);
    goods_produced := floor(c.population * c.industry_bp / 100000.0);
    if wwc_research_production_enabled() then
      food_produced := wwc_production_with_bonus(food_produced, wwc_completed_research(c.id, 'agriculture'));
      water_produced := wwc_production_with_bonus(water_produced, wwc_completed_research(c.id, 'infrastructure'));
      goods_produced := wwc_production_with_bonus(goods_produced, wwc_completed_research(c.id, 'industry'));
    end if;
    shortage := (c.food + food_produced) < c.population
      or (c.water + water_produced) < floor(c.population / 2.0);
    if shortage then
      new_pop := c.population;
      new_stab := greatest(0, c.stability - 4);
    else
      new_pop := c.population + greatest(1, floor(c.population / 1000.0)::int);
      new_stab := least(100, c.stability + 1);
    end if;
    income := floor(c.population * c.tax_bp / 10000.0 * c.economy / 50.0);
    net := income - (c.infra_damage * 500);
    new_treasury := greatest(0, c.treasury + net);
    if c.treasury + net < 0 then
      new_stab := greatest(0, new_stab - 2);
    end if;

    update research_projects
    set days_left = days_left - 1
    where country_id = c.id and status = 'active' and days_left > 0;
    select count(*) into finished
    from research_projects
    where country_id = c.id and status = 'active' and days_left = 0;
    update research_projects
    set status = 'complete', completed_day = v_day
    where country_id = c.id and status = 'active' and days_left = 0;

    insert into player_notices (id, user_id, kind, body, day)
    select 'N-' || substr(md5(p.id), 1, 16), c.user_id, 'research',
      'Research complete: ' || left(p.title, 120), v_day
    from research_projects p
    where p.country_id = c.id and p.status = 'complete' and p.completed_day = v_day
    on conflict (id) do nothing;

    update countries set
      food = greatest(0, c.food + food_produced - c.population),
      water = greatest(0, c.water + water_produced - floor(c.population / 2.0)),
      goods = c.goods + goods_produced,
      wood = c.wood + greatest(1, floor(c.population / 5000.0)::int),
      ore = c.ore + greatest(0, floor(c.population / 8000.0)::int),
      stone = c.stone + greatest(0, floor(c.population / 8000.0)::int),
      energy = c.energy + greatest(1, floor(c.population / 4000.0)::int),
      population = new_pop,
      stability = new_stab,
      treasury = new_treasury,
      technology = least(12, c.technology + finished),
      logistics = c.logistics + finished * 5,
      version = version + 1
    where id = c.id;

    insert into treasury_ledger (country_id, day, amount, reason, balance_after)
    values (c.id, v_day, net, 'economy_tick', new_treasury);
    insert into population_effects (country_id, day, kind, population_delta, stability_delta)
    values (c.id, v_day, case when shortage then 'shortage' else 'growth' end, new_pop - c.population, new_stab - c.stability);
  end loop;

  with gone as (
    update agreements
    set status = 'expired'
    where world_id = 'canon' and status = 'active' and expires_day is not null and expires_day <= v_day
    returning id, kind, proposer_id, target_id
  )
  insert into player_notices (id, user_id, kind, body, day)
  select 'NX-' || substr(md5(g.id || side.user_id), 1, 16), side.user_id, 'treaty',
    g.kind || ' expired', v_day
  from gone g
  join countries side on side.id = g.proposer_id or side.id = g.target_id
  on conflict (id) do nothing;

  insert into economy_ticks (world_id, day) values ('canon', v_day);
  update worlds set day = day + 1 where id = 'canon';
  insert into audit_log (user_id, action, details) values (p_user, 'advance_tick', jsonb_build_object('day', v_day));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true, 'already', false);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'advance_tick', v_prev);
  return v_prev;
end $$;


create or replace function wwc_attack(
  p_user text, p_target text, p_posture text, p_training boolean, p_key text
) returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  t territories%rowtype;
  d countries%rowtype;
  v_units int;
  v_regions int;
  v_spend int;
  v_defender int := 40;
  v_math jsonb;
  v_day int;
  v_change boolean := false;
  v_id text;
  v_deaths int;
  v_civ int;
  v_stab int;
  v_infra int;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if p_posture not in ('probe', 'assault', 'defend') then
    return jsonb_build_object('ok', false, 'error', 'Choose probe, assault or defend.');
  end if;
  select * into c from countries where user_id = p_user for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Found a country first.'); end if;
  select count(*) into v_units from military_units where country_id = c.id;
  if v_units < 1 then
    return jsonb_build_object('ok', false, 'error', 'Recruit a unit before fighting.');
  end if;
  select * into t from territories where id = p_target and world_id = 'canon' for update;
  if t.id is null or t.terrain = 'Ocean' then
    return jsonb_build_object('ok', false, 'error', 'That region cannot be fought over.');
  end if;
  if exists (select 1 from country_territories where territory_id = t.id and country_id = c.id) then
    return jsonb_build_object('ok', false, 'error', 'That region is already yours.');
  end if;
  if not exists (
    select 1
    from country_territories mine
    join territories mine_t on mine_t.id = mine.territory_id
    where mine.country_id = c.id
      and abs(mine_t.row - t.row) + abs(mine_t.col - t.col) = 1
  ) then
    return jsonb_build_object('ok', false, 'error', 'The region must touch your land.');
  end if;

  select oc.* into d
  from country_territories ct
  join countries oc on oc.id = ct.country_id
  where ct.territory_id = t.id;
  if d.id is not null then
    perform 1 from countries where id = d.id for update;
    if exists (
      select 1 from agreements a
      where a.status = 'active'
        and a.kind in ('ceasefire', 'alliance', 'peace', 'nonaggression', 'surrender')
        and (a.expires_day is null or a.expires_day >= (select day from worlds where id = 'canon'))
        and ((a.proposer_id = c.id and a.target_id = d.id) or (a.proposer_id = d.id and a.target_id = c.id))
    ) then
      return jsonb_build_object('ok', false, 'error', 'A treaty forbids this attack.');
    end if;
    select count(*) into v_regions from country_territories where country_id = d.id;
    v_defender := floor(d.stability / 2.0)::int + d.technology * 12 + v_regions * 3 + d.logistics + 18;
    if wwc_research_production_enabled() then
      v_defender := v_defender + wwc_defence_research_bonus(d.id);
    end if;
  end if;

  v_spend := case p_posture when 'probe' then 25000 when 'assault' then 80000 else 12000 end;
  if not p_training and c.treasury < v_spend then
    return jsonb_build_object('ok', false, 'error', 'The treasury cannot fund this posture.');
  end if;
  select count(*) into v_regions from country_territories where country_id = c.id;
  v_math := wwc_resolve_battle(p_posture, v_spend, c.logistics, c.stability, c.technology, v_regions, v_defender);
  select day into v_day from worlds where id = 'canon';
  v_id := case when p_training then 'TR-' else 'B-' end || substr(md5(p_user || p_key), 1, 16);
  v_deaths := (v_math->>'militaryDeaths')::int;
  v_civ := (v_math->>'civilianDeaths')::int;

  if p_training then
    insert into training_battles (
      id, country_id, target_territory_id, posture, spend, outcome,
      military_deaths, wounded, disabled_count, civilian_deaths, displaced, day
    ) values (
      v_id, c.id, t.id, p_posture, v_spend, v_math->>'outcome',
      v_deaths, (v_math->>'wounded')::int, (v_math->>'disabled')::int,
      v_civ, (v_math->>'displaced')::int, v_day
    );
    insert into audit_log (user_id, action, details)
    values (p_user, 'training_battle', jsonb_build_object('outcome', v_math->>'outcome'));
  else
    v_change := (v_math->>'outcome') = 'advance' and p_posture <> 'defend';
    v_stab := greatest(0, least(100, c.stability + case v_math->>'outcome'
      when 'advance' then -1 when 'held' then -2 when 'costly' then -4 else -6 end));
    v_infra := least(40, c.infra_damage + case p_posture when 'assault' then 6 when 'probe' then 2 else 1 end);
    update countries set
      treasury = treasury - v_spend,
      equipment = equipment - case when p_posture = 'assault' and equipment > 0 then 1 else 0 end,
      population = greatest(0, population - v_deaths - v_civ),
      stability = v_stab,
      infra_damage = v_infra,
      military_deaths = military_deaths + v_deaths,
      wounded = wounded + (v_math->>'wounded')::int,
      disabled_count = disabled_count + (v_math->>'disabled')::int,
      civilian_deaths = civilian_deaths + v_civ,
      displaced = displaced + (v_math->>'displaced')::int,
      version = version + 1
    where id = c.id;
    update infrastructure set damage = v_infra where country_id = c.id;
    if v_change then
      delete from capitals where territory_id = t.id;
      delete from country_territories where territory_id = t.id;
      insert into country_territories (territory_id, country_id, is_capital) values (t.id, c.id, false);
      update territories set status = 'OWNED' where id = t.id;
      if d.id is not null and not exists (select 1 from capitals where country_id = d.id) then
        insert into capitals (country_id, territory_id)
        select d.id, ct.territory_id from country_territories ct
        where ct.country_id = d.id
        order by ct.territory_id
        limit 1
        on conflict (country_id) do nothing;
      end if;
    end if;
    insert into battles (
      id, attacker_id, defender_id, target_territory_id, posture, spend, strength, defender_strength,
      probability, outcome, military_deaths, wounded, disabled_count, civilian_deaths, displaced,
      territory_changed, day
    ) values (
      v_id, c.id, d.id, t.id, p_posture, v_spend,
      (v_math->>'strength')::int, (v_math->>'defender')::int, (v_math->>'probability')::numeric,
      v_math->>'outcome', v_deaths, (v_math->>'wounded')::int, (v_math->>'disabled')::int,
      v_civ, (v_math->>'displaced')::int, v_change, v_day
    );
    insert into human_cost_entries (
      battle_id, country_id, military_deaths, wounded, disabled_count, civilian_deaths, displaced, day
    ) values (
      v_id, c.id, v_deaths, (v_math->>'wounded')::int, (v_math->>'disabled')::int,
      v_civ, (v_math->>'displaced')::int, v_day
    );
    update battles set equipment_lost = case when p_posture = 'assault' and c.equipment > 0 then 1 else 0 end where id = v_id;
    insert into treasury_ledger (country_id, day, amount, reason, balance_after)
    values (c.id, v_day, -v_spend, 'battle', c.treasury - v_spend);
  end if;

  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true, 'battle', v_math, 'training', p_training, 'territoryChanged', v_change);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'attack', v_prev);
  return v_prev;
end $$;


create or replace function wwc_counterattack(p_user text, p_target text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  t territories%rowtype;
  d countries%rowtype;
  v_units int;
  v_regions int;
  v_spend int := 40000; -- owner-approved counterattack cost
  v_defender int := 40;
  v_math jsonb;
  v_day int;
  v_change boolean := false;
  v_id text;
  v_deaths int;
  v_civ int;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if not wwc_rate_allow(p_user) then
    return jsonb_build_object('ok', false, 'error', 'Too many orders. Wait a moment.');
  end if;
  select * into c from countries where user_id = p_user for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Found a country first.'); end if;
  select count(*) into v_units from military_units where country_id = c.id;
  if v_units < 1 then
    return jsonb_build_object('ok', false, 'error', 'Recruit a unit before fighting.');
  end if;
  select * into t from territories where id = p_target and world_id = 'canon' for update;
  if t.id is null or t.terrain = 'Ocean' then
    return jsonb_build_object('ok', false, 'error', 'That region cannot be fought over.');
  end if;
  if exists (select 1 from country_territories where territory_id = t.id and country_id = c.id) then
    return jsonb_build_object('ok', false, 'error', 'That region is already yours.');
  end if;
  if not exists (
    select 1 from country_territories mine
    join territories mine_t on mine_t.id = mine.territory_id
    where mine.country_id = c.id
      and abs(mine_t.row - t.row) + abs(mine_t.col - t.col) = 1
  ) then
    return jsonb_build_object('ok', false, 'error', 'The region must touch your land.');
  end if;
  select oc.* into d
  from country_territories ct
  join countries oc on oc.id = ct.country_id
  where ct.territory_id = t.id;
  if d.id is null then
    return jsonb_build_object('ok', false, 'error', 'A counterattack needs an enemy region.');
  end if;
  perform 1 from countries where id = d.id for update;
  if not exists (
    select 1 from battles b
    where b.attacker_id = d.id and b.defender_id = c.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'They have not attacked you.');
  end if;
  select day into v_day from worlds where id = 'canon';
  if exists (
    select 1 from battles b
    where b.attacker_id = c.id and b.target_territory_id = t.id and b.posture = 'counter'
      and b.day > v_day - 3
  ) then
    return jsonb_build_object('ok', false, 'error', 'A counterattack on that region is cooling down.');
  end if;
  if exists (
    select 1 from agreements a
    where a.status = 'active'
      and a.kind in ('ceasefire', 'alliance', 'peace', 'nonaggression', 'surrender')
      and (a.expires_day is null or a.expires_day >= v_day)
      and ((a.proposer_id = c.id and a.target_id = d.id) or (a.proposer_id = d.id and a.target_id = c.id))
  ) then
    return jsonb_build_object('ok', false, 'error', 'A treaty forbids this attack.');
  end if;
  if c.treasury < v_spend then
    return jsonb_build_object('ok', false, 'error', 'The treasury cannot fund a counterattack.');
  end if;
  select count(*) into v_regions from country_territories where country_id = d.id;
  v_defender := floor(d.stability / 2.0)::int + d.technology * 12 + v_regions * 3 + d.logistics + 18;
  if wwc_research_production_enabled() then
    v_defender := v_defender + wwc_defence_research_bonus(d.id);
  end if;
  select count(*) into v_regions from country_territories where country_id = c.id;
  v_math := wwc_resolve_battle('assault', v_spend, c.logistics, c.stability, c.technology, v_regions, v_defender);
  v_id := 'CB-' || substr(md5(p_user || p_key), 1, 16);
  v_deaths := (v_math->>'militaryDeaths')::int;
  v_civ := (v_math->>'civilianDeaths')::int;
  v_change := (v_math->>'outcome') = 'advance';
  update countries set
    treasury = treasury - v_spend,
    equipment = case when equipment > 0 then equipment - 1 else 0 end,
    population = greatest(0, population - v_deaths - v_civ),
    stability = greatest(0, least(100, stability - 2)),
    military_deaths = military_deaths + v_deaths,
    wounded = wounded + (v_math->>'wounded')::int,
    disabled_count = disabled_count + (v_math->>'disabled')::int,
    civilian_deaths = civilian_deaths + v_civ,
    displaced = displaced + (v_math->>'displaced')::int,
    version = version + 1
  where id = c.id;
  if v_change then
    delete from capitals where territory_id = t.id;
    delete from country_territories where territory_id = t.id;
    insert into country_territories (territory_id, country_id, is_capital) values (t.id, c.id, false);
    update territories set status = 'OWNED' where id = t.id;
  end if;
  insert into battles (
    id, attacker_id, defender_id, target_territory_id, posture, spend, strength, defender_strength,
    probability, outcome, military_deaths, wounded, disabled_count, civilian_deaths, displaced,
    territory_changed, day, equipment_lost
  ) values (
    v_id, c.id, d.id, t.id, 'counter', v_spend,
    (v_math->>'strength')::int, (v_math->>'defender')::int, (v_math->>'probability')::numeric,
    v_math->>'outcome', v_deaths, (v_math->>'wounded')::int, (v_math->>'disabled')::int,
    v_civ, (v_math->>'displaced')::int, v_change, v_day,
    case when c.equipment > 0 then 1 else 0 end
  );
  insert into human_cost_entries (
    battle_id, country_id, military_deaths, wounded, disabled_count, civilian_deaths, displaced, day
  ) values (
    v_id, c.id, v_deaths, (v_math->>'wounded')::int, (v_math->>'disabled')::int,
    v_civ, (v_math->>'displaced')::int, v_day
  );
  insert into treasury_ledger (country_id, day, amount, reason, balance_after)
  values (c.id, v_day, -v_spend, 'counterattack', c.treasury - v_spend);
  insert into audit_log (user_id, action, details)
  values (p_user, 'counterattack', jsonb_build_object('target', t.id, 'costStatus', 'approved', 'spend', v_spend));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true, 'battle', v_math, 'training', false, 'territoryChanged', v_change, 'approval', 'counterattack_cost_approved');
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'counterattack', v_prev);
  return v_prev;
end $$;


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
    'link', 'database',
    'researchBonusesEnabled', wwc_research_production_enabled()
  );
end $$;
