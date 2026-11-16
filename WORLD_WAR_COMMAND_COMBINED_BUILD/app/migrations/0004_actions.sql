-- State-changing actions. Each one runs in the caller's single statement transaction.

create or replace function wwc_set_budget(
  p_user text, p_tax int, p_agri int, p_industry int, p_infra int, p_reserves int, p_key text
) returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if p_key is null or char_length(p_key) < 8 then
    return jsonb_build_object('ok', false, 'error', 'A new request key is required.');
  end if;
  select * into c from countries where user_id = p_user for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Found a country first.'); end if;
  if p_tax < 0 or p_tax > 3000 or p_agri < 0 or p_industry < 0 or p_infra < 0 or p_reserves < 0
     or p_agri + p_industry + p_infra + p_reserves <> 10000 then
    return jsonb_build_object('ok', false, 'error', 'The four budget shares must add to 100%.');
  end if;
  update countries set tax_bp = p_tax, agri_bp = p_agri, industry_bp = p_industry,
    infra_bp = p_infra, reserves_bp = p_reserves, version = version + 1
  where id = c.id;
  insert into audit_log (user_id, action, details) values (p_user, 'set_budget', jsonb_build_object('tax', p_tax));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'set_budget', v_prev);
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

  insert into economy_ticks (world_id, day) values ('canon', v_day);
  update worlds set day = day + 1 where id = 'canon';
  insert into audit_log (user_id, action, details) values (p_user, 'advance_tick', jsonb_build_object('day', v_day));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true, 'already', false);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'advance_tick', v_prev);
  return v_prev;
end $$;

create or replace function wwc_start_research(p_user text, p_title text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  v_title text := trim(p_title);
  v_cost int;
  v_days int;
  v_active int;
  v_day int;
  v_id text;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  select * into c from countries where user_id = p_user for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Found a country first.'); end if;
  if v_title is null or char_length(v_title) < 8 or char_length(v_title) > 240 then
    return jsonb_build_object('ok', false, 'error', 'Describe the project in 8 to 240 characters.');
  end if;
  if v_title ~* '(nuclear weapon|nuclear bomb|chemical weapon|biological weapon|nerve agent|poison gas|anthrax)' then
    return jsonb_build_object('ok', false, 'error', 'Nuclear, chemical and biological weapons are not researched.');
  end if;
  select count(*) into v_active from research_projects where country_id = c.id and status = 'active';
  if v_active >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Three projects are already running.');
  end if;
  v_cost := least(75000, 25000 + 40 * char_length(v_title));
  v_days := 2 + least(5, floor(char_length(v_title) / 48.0)::int);
  if c.treasury < v_cost then
    return jsonb_build_object('ok', false, 'error', 'The treasury cannot fund this project.');
  end if;
  select day into v_day from worlds where id = 'canon';
  v_id := 'R-' || substr(md5(p_user || p_key), 1, 16);
  update countries set treasury = treasury - v_cost, version = version + 1 where id = c.id;
  insert into research_projects (id, country_id, title, cost, days_total, days_left, status, created_day)
  values (v_id, c.id, v_title, v_cost, v_days, v_days, 'active', v_day);
  insert into treasury_ledger (country_id, day, amount, reason, balance_after)
  values (c.id, v_day, -v_cost, 'research', c.treasury - v_cost);
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'start_research', v_prev);
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
  update countries set treasury = treasury - 15000, goods = goods - 100, version = version + 1 where id = c.id;
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
      where a.kind = 'ceasefire' and a.status = 'active' and a.expires_day >= (select day from worlds where id = 'canon')
        and ((a.proposer_id = c.id and a.target_id = d.id) or (a.proposer_id = d.id and a.target_id = c.id))
    ) then
      return jsonb_build_object('ok', false, 'error', 'A ceasefire forbids this attack.');
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
    insert into treasury_ledger (country_id, day, amount, reason, balance_after)
    values (c.id, v_day, -v_spend, 'battle', c.treasury - v_spend);
  end if;

  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true, 'battle', v_math, 'training', p_training, 'territoryChanged', v_change);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'attack', v_prev);
  return v_prev;
end $$;

create or replace function wwc_rehabilitate(p_user text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  v_day int;
  v_infra int;
  v_displaced bigint;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  select * into c from countries where user_id = p_user for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Found a country first.'); end if;
  if c.treasury < 20000 or c.goods < 500 then
    return jsonb_build_object('ok', false, 'error', 'Rehabilitation costs 20,000 treasury and 500 goods.');
  end if;
  if c.infra_damage = 0 and c.displaced = 0 then
    return jsonb_build_object('ok', false, 'error', 'There is nothing to rehabilitate.');
  end if;
  v_infra := greatest(0, c.infra_damage - 8);
  v_displaced := floor(c.displaced * 0.9);
  select day into v_day from worlds where id = 'canon';
  update countries set treasury = treasury - 20000, goods = goods - 500,
    infra_damage = v_infra, displaced = v_displaced, version = version + 1
  where id = c.id;
  update infrastructure set damage = v_infra where country_id = c.id;
  insert into rehabilitation_projects (id, country_id, cost, day, infra_after, displaced_after)
  values ('H-' || substr(md5(p_key), 1, 12), c.id, 20000, v_day, v_infra, v_displaced);
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'rehabilitate', v_prev);
  return v_prev;
end $$;

create or replace function wwc_move_capital(p_user text, p_target text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  select * into c from countries where user_id = p_user for update;
  if not exists (select 1 from country_territories where country_id = c.id and territory_id = p_target) then
    return jsonb_build_object('ok', false, 'error', 'The capital must be a region you own.');
  end if;
  update country_territories set is_capital = (territory_id = p_target) where country_id = c.id;
  insert into capitals (country_id, territory_id) values (c.id, p_target)
  on conflict (country_id) do update set territory_id = excluded.territory_id;
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'move_capital', v_prev);
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
  if p_kind not in ('peace', 'alliance', 'ceasefire', 'surrender') then
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

create or replace function wwc_answer_treaty(p_user text, p_agreement text, p_accept boolean, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  c countries%rowtype;
  a agreements%rowtype;
  v_day int;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  select * into c from countries where user_id = p_user;
  select * into a from agreements where id = p_agreement for update;
  if a.id is null or a.target_id <> c.id or a.status <> 'proposed' then
    return jsonb_build_object('ok', false, 'error', 'That proposal is not yours to answer.');
  end if;
  select day into v_day from worlds where id = 'canon';
  if p_accept then
    update agreements set status = 'active', expires_day = v_day + 7 where id = a.id;
  else
    update agreements set status = 'rejected' where id = a.id;
  end if;
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'answer_treaty', v_prev);
  return v_prev;
end $$;

create or replace function wwc_credit_zetos(p_user text, p_amount int, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  v_balance bigint;
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if p_amount < 1 or p_amount > 1000 then
    return jsonb_build_object('ok', false, 'error', 'Staging credits are 1 to 1,000. Purchases are off.');
  end if;
  insert into zetos_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  select balance into v_balance from zetos_wallets where user_id = p_user for update;
  if v_balance + p_amount > 5000 then
    return jsonb_build_object('ok', false, 'error', 'The staging wallet cap is 5,000.');
  end if;
  update zetos_wallets set balance = balance + p_amount where user_id = p_user;
  insert into zetos_ledger (id, user_id, amount, reason, balance_after, idempotency_key)
  values ('Z-' || substr(md5(p_user || p_key), 1, 16), p_user, p_amount, 'staging-credit', v_balance + p_amount, p_key);
  insert into audit_log (user_id, action, details) values (p_user, 'zetos_credit', jsonb_build_object('amount', p_amount));
  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'credit_zetos', v_prev);
  return v_prev;
end $$;

create or replace function wwc_admin_overview(p_user text)
returns jsonb
language plpgsql
stable
as $$
begin
  if not exists (select 1 from player_roles where user_id = p_user and role = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Admin role required.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'countries', (select count(*) from countries),
    'owned', (select count(*) from territories where status = 'OWNED'),
    'available', (select count(*) from territories where status = 'AVAILABLE'),
    'battles', (select count(*) from battles),
    'training', (select count(*) from training_battles),
    'ticks', (select count(*) from economy_ticks),
    'zetos', (select coalesce(sum(balance), 0) from zetos_wallets),
    'purchasesEnabled', false,
    'aiEnabled', false
  );
end $$;
