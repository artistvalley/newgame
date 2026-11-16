-- Server-side rules for the canonical 14×14 world.
-- Battle costs and outcome thresholds are the approved baseline.
-- Empty-land defender strength is the documented staging constant 40.
-- Occupied-land defence uses the defender's own stats plus the defend bonus 18,
-- and does not spend the defender's treasury. Units gate an attack; they do not
-- add a second strength modifier.

create or replace function wwc_resolve_battle(
  p_posture text,
  p_spend int,
  p_logistics int,
  p_stability int,
  p_technology int,
  p_regions int,
  p_defender int
) returns jsonb
language plpgsql
immutable
as $$
declare
  bonus int := case p_posture when 'defend' then 18 when 'assault' then 8 else 0 end;
  strength int;
  defender int := greatest(p_defender, 1);
  probability numeric;
  outcome text;
  scale numeric;
  deaths int;
  wounded int;
  disabled_count int;
  factor numeric;
  civilians int;
  displaced int;
begin
  strength := floor(p_spend / 800.0)::int + p_logistics + floor(p_stability / 2.0)::int
    + p_technology * 12 + p_regions * 3 + bonus;
  strength := greatest(strength, 1);
  probability := strength::numeric / (strength + defender);
  if p_posture = 'defend' then
    outcome := case
      when probability >= 0.48 then 'held'
      when probability >= 0.46 then 'costly'
      else 'repulsed'
    end;
  else
    outcome := case
      when probability >= 0.58 then 'advance'
      when probability >= 0.46 then 'costly'
      else 'repulsed'
    end;
  end if;
  scale := case p_posture when 'probe' then 0.45 when 'defend' then 0.32 else 1 end;
  deaths := greatest(4, floor((1.08 - probability) * 140 * scale)::int);
  wounded := deaths * 3;
  disabled_count := floor(wounded * 0.12)::int;
  factor := case when p_posture = 'assault' then 0.4 else 0.16 end;
  civilians := greatest(0, floor(deaths * factor * (1.2 - p_stability / 200.0))::int);
  displaced := civilians * 4 + floor(80 * scale)::int;
  return jsonb_build_object(
    'strength', strength,
    'defender', defender,
    'probability', probability,
    'outcome', outcome,
    'militaryDeaths', deaths,
    'wounded', wounded,
    'disabled', disabled_count,
    'civilianDeaths', civilians,
    'displaced', displaced
  );
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

  if c.id is null then
    v_country := null;
    v_projects := '[]'::jsonb;
    v_units := 0;
    v_battles := '[]'::jsonb;
    v_training := '[]'::jsonb;
    v_deals := '[]'::jsonb;
    v_mail := '[]'::jsonb;
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
      'displaced', c.displaced, 'version', c.version
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'cost', p.cost, 'daysLeft', p.days_left,
      'daysTotal', p.days_total, 'status', p.status
    ) order by p.created_day desc), '[]'::jsonb)
    into v_projects from research_projects p where p.country_id = c.id;
    select count(*) into v_units from military_units u where u.country_id = c.id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'posture', b.posture, 'outcome', b.outcome, 'target', b.target_territory_id,
      'spend', b.spend, 'changed', b.territory_changed, 'day', b.day,
      'militaryDeaths', b.military_deaths, 'civilianDeaths', b.civilian_deaths,
      'wounded', b.wounded, 'disabled', b.disabled_count, 'displaced', b.displaced
    ) order by b.created_at desc), '[]'::jsonb)
    into v_battles from (select * from battles where attacker_id = c.id order by created_at desc limit 12) b;
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
      'id', m.id, 'from', fc.name, 'to', tc.name, 'body', m.body, 'day', m.day
    ) order by m.created_at desc), '[]'::jsonb)
    into v_mail
    from (select * from diplomatic_messages where from_country = c.id or to_country = c.id order by created_at desc limit 20) m
    join countries fc on fc.id = m.from_country
    join countries tc on tc.id = m.to_country;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'amount', l.amount, 'reason', l.reason, 'balanceAfter', l.balance_after
  ) order by l.created_at desc), '[]'::jsonb)
  into v_ledger from (select * from zetos_ledger where user_id = p_user order by created_at desc limit 12) l;

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
    'messages', v_mail
  );
end $$;

create or replace function wwc_found_country(
  p_user text, p_name text, p_government text,
  p_primary text, p_secondary text, p_symbol text,
  p_territories text[], p_key text
) returns jsonb
language plpgsql
as $$
declare
  v_prev jsonb;
  v_id text;
  v_count int;
  v_linked int;
  v_name text := trim(p_name);
begin
  select response into v_prev from idempotency_keys where user_id = p_user and key = p_key;
  if found then return v_prev; end if;
  if p_key is null or char_length(p_key) < 8 then
    return jsonb_build_object('ok', false, 'error', 'A new request key is required.');
  end if;
  if exists (select 1 from player_bans where user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'This account is suspended.');
  end if;
  if exists (select 1 from countries where user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'You already founded a country.');
  end if;
  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 32 then
    return jsonb_build_object('ok', false, 'error', 'The country name must be 3 to 32 characters.');
  end if;
  if p_government not in ('democracy', 'federation', 'monarchy', 'republic') then
    return jsonb_build_object('ok', false, 'error', 'Choose a government.');
  end if;
  if p_primary !~ '^#[0-9A-Fa-f]{6}$' or p_secondary !~ '^#[0-9A-Fa-f]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'Flag colours must be hex values.');
  end if;
  if p_symbol is null or char_length(trim(p_symbol)) < 1 or char_length(trim(p_symbol)) > 4 then
    return jsonb_build_object('ok', false, 'error', 'The flag symbol is 1 to 4 characters.');
  end if;
  if p_territories is null or cardinality(p_territories) < 1 or cardinality(p_territories) > 6 then
    return jsonb_build_object('ok', false, 'error', 'Choose 1 to 6 connected regions.');
  end if;
  select count(distinct x) into v_count from unnest(p_territories) as x;
  if v_count <> cardinality(p_territories) then
    return jsonb_build_object('ok', false, 'error', 'Each region can be chosen once.');
  end if;
  perform 1 from territories where id = any(p_territories) for update;
  if (select count(*) from territories where id = any(p_territories) and world_id = 'canon') <> v_count then
    return jsonb_build_object('ok', false, 'error', 'One of those regions is not on the map.');
  end if;
  if exists (
    select 1 from territories
    where id = any(p_territories) and (status <> 'AVAILABLE' or terrain = 'Ocean')
  ) then
    return jsonb_build_object('ok', false, 'error', 'One of those regions is ocean or already taken.');
  end if;
  with recursive walk as (
    select p_territories[1] as id
    union
    select n.id
    from walk w
    join territories a on a.id = w.id
    join territories n on n.id = any(p_territories)
      and abs(a.row - n.row) + abs(a.col - n.col) = 1
  )
  select count(distinct id) into v_linked from walk;
  if v_linked <> v_count then
    return jsonb_build_object('ok', false, 'error', 'The regions must be connected by land edges.');
  end if;
  if exists (select 1 from countries where lower(name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'error', 'That name is already taken.');
  end if;

  v_id := 'C-' || substr(md5(p_user || v_name), 1, 16);
  insert into countries (
    id, world_id, user_id, name, government, flag_primary, flag_secondary, flag_symbol
  ) values (
    v_id, 'canon', p_user, v_name, p_government, p_primary, p_secondary, trim(p_symbol)
  );
  insert into country_territories (territory_id, country_id, is_capital)
  select t.id, v_id, t.id = p_territories[1]
  from unnest(p_territories) with ordinality as picked(id, ord)
  join territories t on t.id = picked.id;
  insert into capitals (country_id, territory_id) values (v_id, p_territories[1]);
  update territories set status = 'OWNED' where id = any(p_territories);
  insert into infrastructure (country_id, damage) values (v_id, 0);
  insert into zetos_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  insert into player_roles (user_id, role) values (p_user, 'player') on conflict (user_id) do nothing;
  insert into game_actions (user_id, country_id, action, day, details)
  select p_user, v_id, 'found_country', day, jsonb_build_object('territories', p_territories) from worlds where id = 'canon';
  insert into audit_log (user_id, action, details) values (p_user, 'found_country', jsonb_build_object('country', v_id));

  v_prev := wwc_state(p_user) || jsonb_build_object('ok', true);
  insert into idempotency_keys (user_id, key, action, response) values (p_user, p_key, 'found_country', v_prev);
  return v_prev;
end $$;
