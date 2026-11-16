-- Owner approved the 40,000 counterattack cost for the development preview.
-- Research bonus formulas are preview-only and are not applied by the world-day or battle functions.


insert into system_settings (key, value) values
  ('counterattack_cost', '{"amount":40000,"status":"approved","scope":"development_preview_only"}'::jsonb),
  ('research_bonuses', '{"enabled":false,"status":"proposal","note":"Formulas are preview-only. The world-day and battle functions do not read this flag."}'::jsonb)
on conflict (key) do update set value = excluded.value;

update system_settings
set value = '{"status":"proposal","enabled":false,"note":"Categories are stored. Extra bonuses stay off until a separate approval."}'::jsonb
where key = 'research_effects';

create or replace function wwc_preview_research_bonus(
  p_population bigint,
  p_agri int,
  p_industry int,
  p_infra int,
  p_agri_n int,
  p_industry_n int,
  p_infra_n int,
  p_defense_n int,
  p_defender int
) returns jsonb
language plpgsql
stable
as $$
declare
  food bigint := floor(p_population * (7000 + p_agri) / 10000.0);
  water bigint := floor(p_population * (4000 + floor(p_infra / 2.0)) / 10000.0);
  goods bigint := floor(p_population * p_industry / 100000.0);
  agri_pct int := least(8, greatest(0, p_agri_n) * 2);
  industry_pct int := least(8, greatest(0, p_industry_n) * 2);
  infra_pct int := least(8, greatest(0, p_infra_n) * 2);
  defense_bonus int := least(8, greatest(0, p_defense_n) * 2);
  enabled boolean := coalesce((select (value->>'enabled')::boolean from system_settings where key = 'research_bonuses'), false);
begin
  return jsonb_build_object(
    'enabled', enabled,
    'baseline', jsonb_build_object('food', food, 'water', water, 'goods', goods, 'defender', p_defender),
    'proposed', jsonb_build_object(
      'food', floor(food * (100 + agri_pct) / 100.0),
      'water', floor(water * (100 + infra_pct) / 100.0),
      'goods', floor(goods * (100 + industry_pct) / 100.0),
      'defender', p_defender + defense_bonus,
      'agriPct', agri_pct,
      'industryPct', industry_pct,
      'infraPct', infra_pct,
      'defenseBonus', defense_bonus
    )
  );
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

