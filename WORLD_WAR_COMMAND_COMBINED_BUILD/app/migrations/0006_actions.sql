-- Replacements and new actions. Loaded after 0005.

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

create or replace function wwc_recruit(p_user text, p_name text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  v_units int;
  v_day int;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  select * into c from countries where user_id = p_user for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Found a country first.'); end if;
  if c.treasury < 15000 or c.goods < 100 then
    return jsonb_build_object('ok', false, 'error', 'Recruiting costs 15,000 treasury and 100 goods.');
  end if;
  select count(*) into v_units from military_units where country_id = c.id;
  if v_units >= 12 then
    return jsonb_build_object('ok', false, 'error', 'The army is at its staging cap of 12 units.');
  end if;
  select day into v_day from worlds where id = 'canon';
  update countries set treasury = treasury - 15000, goods = goods - 100, equipment = equipment + 1, version = version + 1 where id = c.id;
  insert into military_units (id, country_id, name, created_day)
  values ('U-' || substr(md5(p_user || p_key), 1, 16), c.id, left(coalesce(nullif(trim(p_name), ''), 'Company'), 24), v_day);
  insert into treasury_ledger (country_id, day, amount, reason, balance_after)
  values (c.id, v_day, -15000, 'recruit', c.treasury - 15000);
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'recruit', v_prev);
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

create or replace function wwc_propose(
  p_user text, p_target_country text, p_kind text, p_body text, p_key text
) returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  v_day int;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if p_kind not in ('peace', 'alliance', 'ceasefire', 'surrender', 'nonaggression') then
    return jsonb_build_object('ok', false, 'error', 'Unknown treaty.');
  end if;
  select * into c from countries where user_id = p_user;
  if c.id is null or c.id = p_target_country then
    return jsonb_build_object('ok', false, 'error', 'Choose another country.');
  end if;
  if not exists (select 1 from countries where id = p_target_country) then
    return jsonb_build_object('ok', false, 'error', 'That country does not exist.');
  end if;
  select day into v_day from worlds where id = 'canon';
  insert into agreements (id, world_id, kind, proposer_id, target_id, status, created_day)
  values ('A-' || substr(md5(p_key), 1, 16), 'canon', p_kind, c.id, p_target_country, 'proposed', v_day);
  if p_body is not null and char_length(trim(p_body)) > 0 then
    insert into diplomatic_messages (id, from_country, to_country, body, day)
    values ('M-' || substr(md5(p_key), 1, 16), c.id, p_target_country, left(trim(p_body), 280), v_day);
  end if;
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'propose', v_prev);
  return v_prev;
end $$;


create or replace function wwc_cancel_treaty(p_user text, p_agreement text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  a agreements%rowtype;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if not wwc_rate_allow(p_user) then
    return jsonb_build_object('ok', false, 'error', 'Too many orders. Wait a moment.');
  end if;
  select * into c from countries where user_id = p_user;
  select * into a from agreements where id = p_agreement for update;
  if a.id is null or a.status <> 'active' or (a.proposer_id <> c.id and a.target_id <> c.id) then
    return jsonb_build_object('ok', false, 'error', 'That treaty cannot be cancelled.');
  end if;
  update agreements set status = 'cancelled' where id = a.id;
  insert into player_notices (id, user_id, kind, body, day)
  select 'NC-' || substr(md5(a.id || side.user_id || p_key), 1, 16), side.user_id, 'treaty',
    a.kind || ' cancelled', (select day from worlds where id = 'canon')
  from countries side
  where side.id = a.proposer_id or side.id = a.target_id;
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'cancel_treaty', v_prev);
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
  v_spend int := 40000;
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
  values (p_user, 'counterattack', jsonb_build_object('target', t.id, 'costStatus', 'awaiting_owner_approval', 'spend', v_spend));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true, 'battle', v_math, 'training', false, 'territoryChanged', v_change, 'approval', 'counterattack_cost_awaiting_owner');
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'counterattack', v_prev);
  return v_prev;
end $$;

create or replace function wwc_debit_zetos(p_user text, p_amount int, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  v_balance bigint;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if not wwc_rate_allow(p_user) then
    return jsonb_build_object('ok', false, 'error', 'Too many orders. Wait a moment.');
  end if;
  if p_amount < 1 or p_amount > 1000 then
    return jsonb_build_object('ok', false, 'error', 'Staging spends are 1 to 1,000. Purchases are off.');
  end if;
  insert into zetos_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  select balance into v_balance from zetos_wallets where user_id = p_user for update;
  if v_balance < p_amount then
    return jsonb_build_object('ok', false, 'error', 'The wallet does not have enough.');
  end if;
  update zetos_wallets set balance = balance - p_amount where user_id = p_user;
  insert into zetos_ledger (id, user_id, amount, reason, balance_after, idempotency_key)
  values ('Z-' || substr(md5(p_user || p_key), 1, 16), p_user, -p_amount, 'staging-spend', v_balance - p_amount, p_key);
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'debit_zetos', v_prev);
  return v_prev;
end $$;

create or replace function wwc_refund_zetos(p_user text, p_ledger text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  row zetos_ledger%rowtype;
  v_balance bigint;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if not wwc_rate_allow(p_user) then
    return jsonb_build_object('ok', false, 'error', 'Too many orders. Wait a moment.');
  end if;
  select * into row from zetos_ledger where id = p_ledger and user_id = p_user for update;
  if row.id is null or row.reason <> 'staging-spend' or row.amount >= 0 then
    return jsonb_build_object('ok', false, 'error', 'That spend cannot be refunded.');
  end if;
  if exists (select 1 from zetos_ledger where source_id = row.id and reason = 'refund') then
    return jsonb_build_object('ok', false, 'error', 'That spend was already refunded.');
  end if;
  select balance into v_balance from zetos_wallets where user_id = p_user for update;
  update zetos_wallets set balance = balance + (-row.amount) where user_id = p_user;
  insert into zetos_ledger (id, user_id, amount, reason, balance_after, idempotency_key, source_id)
  values ('Z-' || substr(md5(p_user || p_key), 1, 16), p_user, -row.amount, 'refund', v_balance + (-row.amount), p_key, row.id);
  insert into audit_log (user_id, action, details) values (p_user, 'zetos_refund', jsonb_build_object('source', row.id));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'refund_zetos', v_prev);
  return v_prev;
end $$;

create or replace function wwc_reverse_zetos(p_user text, p_ledger text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  row zetos_ledger%rowtype;
  v_balance bigint;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if not exists (select 1 from player_roles where user_id = p_user and role = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Admin role required.');
  end if;
  select * into row from zetos_ledger where id = p_ledger for update;
  if row.id is null or row.reason <> 'staging-credit' or row.amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'That credit cannot be reversed.');
  end if;
  if exists (select 1 from zetos_ledger where source_id = row.id and reason = 'reversal') then
    return jsonb_build_object('ok', false, 'error', 'That credit was already reversed.');
  end if;
  select balance into v_balance from zetos_wallets where user_id = row.user_id for update;
  if v_balance < row.amount then
    return jsonb_build_object('ok', false, 'error', 'The wallet no longer holds that credit.');
  end if;
  update zetos_wallets set balance = balance - row.amount where user_id = row.user_id;
  insert into zetos_ledger (id, user_id, amount, reason, balance_after, idempotency_key, source_id)
  values ('Z-' || substr(md5(p_user || p_key), 1, 16), row.user_id, -row.amount, 'reversal', v_balance - row.amount, p_key, row.id);
  insert into audit_log (user_id, action, details) values (p_user, 'zetos_reversal', jsonb_build_object('source', row.id, 'owner', row.user_id));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'reverse_zetos', v_prev);
  return v_prev;
end $$;

create or replace function wwc_issue_mail_token(p_user text, p_purpose text)
returns jsonb
language plpgsql
as $$
declare
  v_token text;
  v_recent int;
begin
  if p_purpose not in ('verify', 'reset') then
    return jsonb_build_object('ok', false, 'error', 'Unknown letter.');
  end if;
  select count(*) into v_recent from auth_tokens
  where user_id = p_user and purpose = p_purpose and created_at > now() - interval '1 hour';
  if p_purpose = 'verify' and v_recent >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Verification letters are limited to three an hour.');
  end if;
  if p_purpose = 'reset' and v_recent >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Reset letters are limited to three an hour.');
  end if;
  v_token := md5(random()::text || clock_timestamp()::text || p_user) || md5(random()::text);
  insert into auth_tokens (id, user_id, purpose, token_hash, expires_at)
  values (
    'AT-' || substr(md5(p_user || v_token), 1, 16),
    p_user,
    p_purpose,
    md5(v_token),
    now() + case when p_purpose = 'reset' then interval '30 minutes' else interval '1 day' end
  );
  insert into mail_capture (id, user_id, purpose, token)
  values ('MC-' || substr(md5(v_token), 1, 16), p_user, p_purpose, v_token);
  insert into audit_log (user_id, action, details)
  values (p_user, 'mail_token', jsonb_build_object('purpose', p_purpose, 'delivered', false));
  return jsonb_build_object('ok', true, 'delivered', false);
end $$;

create or replace function wwc_consume_mail_token(p_token text, p_purpose text)
returns jsonb
language plpgsql
as $$
declare
  row auth_tokens%rowtype;
begin
  select * into row from auth_tokens
  where purpose = p_purpose and token_hash = md5(p_token)
  for update;
  if row.id is null then
    return jsonb_build_object('ok', false, 'error', 'That letter is not valid.');
  end if;
  if row.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'That letter was already used.');
  end if;
  if row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'That letter has expired.');
  end if;
  update auth_tokens set used_at = now() where id = row.id;
  return jsonb_build_object('ok', true, 'userId', row.user_id);
end $$;

create or replace function wwc_spectate(p_user text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_state jsonb;
begin
  if exists (select 1 from player_bans where user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'This account cannot watch.');
  end if;
  v_state := wwc_state(p_user);
  return jsonb_build_object(
    'ok', true,
    'spectator', true,
    'day', v_state->'day',
    'territories', v_state->'territories',
    'feed', v_state->'feed',
    'purchasesEnabled', false
  );
end $$;
