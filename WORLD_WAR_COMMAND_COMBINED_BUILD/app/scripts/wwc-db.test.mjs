import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const TERRAINS = ["Plains", "Forest", "Hills", "Desert", "Mountain", "Riverland"];
const RESOURCE_SETS = [["Food", "Wood"], ["Wood", "Ore"], ["Ore", "Stone"], ["Food"], ["Stone", "Ore"], ["Food", "Water"]];

function canonicalMap() {
  const tiles = [];
  for (let row = 0; row < 14; row += 1) {
    for (let col = 0; col < 14; col += 1) {
      const ring = Math.min(row, col, 13 - row, 13 - col);
      const ocean = ring === 0 || ((row * 7 + col * 11) % 23 === 0 && ring < 3);
      const id = `T-${String(row + 1).padStart(2, "0")}-${String(col + 1).padStart(2, "0")}`;
      if (ocean) tiles.push({ id, row, col, terrain: "Ocean", resources: "", census: 0, status: "OCEAN" });
      else {
        tiles.push({
          id, row, col,
          terrain: TERRAINS[(row * 3 + col * 5) % 6],
          resources: RESOURCE_SETS[(row + col * 2) % 6].join(","),
          census: 8000 + ((row * 31 + col * 17) % 42000),
          status: "AVAILABLE",
        });
      }
    }
  }
  return tiles;
}

function sampleLand(count) {
  const land = canonicalMap().filter((tile) => tile.status === "AVAILABLE");
  const start = land.find((tile) => tile.row === 3 && tile.col === 3) ?? land[0];
  const chosen = [];
  const seen = new Set();
  const queue = [start];
  while (queue.length && chosen.length < count) {
    const tile = queue.shift();
    if (!tile || seen.has(tile.id)) continue;
    seen.add(tile.id);
    chosen.push(tile);
    for (const next of land) {
      if (!seen.has(next.id) && Math.abs(tile.row - next.row) + Math.abs(tile.col - next.col) === 1) queue.push(next);
    }
  }
  return chosen;
}

const files = ["migrations/0002_wwc.sql", "migrations/0003_rules.sql", "migrations/0004_actions.sql", "migrations/0005_complete.sql", "migrations/0006_actions.sql", "migrations/0007_approved.sql", "migrations/0008_research_bonus.sql"];

async function db() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of files) {
    await pg.exec(await readFile(file, "utf8"));
  }
  return pg;
}

function one(result) {
  return result.rows[0];
}

test("canonical map matches the SQL seed", async () => {
  const pg = await db();
  const expected = canonicalMap();
  const rows = await pg.query("select id, row, col, terrain, resources, census, status from territories order by row, col");
  assert.equal(rows.rows.length, 196);
  assert.equal(expected.length, 196);
  for (let i = 0; i < 196; i += 1) {
    const got = rows.rows[i];
    const want = expected[i];
    assert.equal(got.id, want.id);
    assert.equal(got.terrain, want.terrain);
    assert.equal(got.resources, want.resources);
    assert.equal(Number(got.census), want.census);
    assert.equal(got.status, want.status);
  }
  const legacy = one(await pg.query("select payload->>'imported' as imported from legacy_neon_world where id = 'terra-nova'"));
  assert.equal(legacy.imported, "false");
  const pack = one(await pg.query("select active from zetos_packages"));
  assert.equal(pack.active, false);
  await pg.close();
});

test("founding, tick, research, battle, training, ceasefire and zetos", async () => {
  const pg = await db();
  const land = sampleLand(6).map((tile) => tile.id);
  const other = ["T-03-03", "T-03-02", "T-04-02"];
  assert.equal(new Set([...land, ...other]).size, 9);

  const founded = one(await pg.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-a", "Ashen Compact", "democracy", "#8f4d4a", "#d4b483", "AC", land, "found-user-a-01"],
  )).r;
  assert.equal(founded.ok, true);
  assert.equal(Number(founded.country.treasury), 1000000);
  assert.equal(Number(founded.country.population), 100000);
  assert.equal(founded.country.stability, 70);
  assert.equal(founded.country.technology, 1);
  assert.equal(founded.wallet, 0);

  const replay = one(await pg.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-a", "Ashen Compact", "democracy", "#8f4d4a", "#d4b483", "AC", land, "found-user-a-01"],
  )).r;
  assert.equal(replay.ok, true);
  assert.equal(Number(replay.country.treasury), 1000000);

  const clash = one(await pg.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-b", "Other Land", "federation", "#335544", "#eeeeee", "OL", [land[0]], "found-user-b-01"],
  )).r;
  assert.equal(clash.ok, false);

  const foundedB = one(await pg.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-b", "Velan Reach", "federation", "#335544", "#88aa99", "VR", other, "found-user-b-02"],
  )).r;
  assert.equal(foundedB.ok, true);

  const budget = one(await pg.query(
    "select wwc_set_budget($1,1000,4000,2000,2500,1500,$2) as r",
    ["user-a", "budget-user-a-1"],
  )).r;
  assert.equal(budget.ok, true);
  assert.equal(budget.country.agriBp + budget.country.industryBp + budget.country.infraBp + budget.country.reservesBp, 10000);

  const badBudget = one(await pg.query(
    "select wwc_set_budget($1,1000,4000,2000,2500,1400,$2) as r",
    ["user-a", "budget-user-a-bad"],
  )).r;
  assert.equal(badBudget.ok, false);

  const before = Number(founded.country.treasury);
  const tick = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-a", "tick-day-1"])).r;
  assert.equal(tick.ok, true);
  assert.equal(tick.already, false);
  assert.equal(tick.day, 2);
  assert.ok(Number(tick.country.treasury) !== before || Number(tick.country.food) >= 0);
  assert.ok(Number(tick.country.population) >= 100000);
  const replayTick = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-a", "tick-day-1"])).r;
  assert.equal(replayTick.day, 2);
  assert.equal(one(await pg.query("select count(*)::int as n from economy_ticks")).n, 1);
  const next = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-b", "tick-day-2-b"])).r;
  assert.equal(next.ok, true);
  assert.equal(next.already, false);
  assert.equal(next.day, 3);
  assert.equal(one(await pg.query("select count(*)::int as n from economy_ticks")).n, 2);

  const title = "Field rations kiln";
  const beforeResearch = Number(one(await pg.query("select treasury from countries where user_id = 'user-a'")).treasury);
  const research = one(await pg.query("select wwc_start_research($1,$2,$3) as r", ["user-a", title, "research-a-1"])).r;
  assert.equal(research.ok, true);
  const cost = Math.min(75000, 25000 + 40 * title.length);
  assert.equal(Number(research.country.treasury), beforeResearch - cost);
  const banned = one(await pg.query(
    "select wwc_start_research($1,$2,$3) as r",
    ["user-a", "a nuclear weapon primer", "research-a-bad"],
  )).r;
  assert.equal(banned.ok, false);

  const noFight = one(await pg.query(
    "select wwc_attack($1,$2,'probe',true,$3) as r",
    ["user-a", other[0], "train-too-soon"],
  )).r;
  assert.equal(noFight.ok, false);

  const recruited = one(await pg.query("select wwc_recruit($1,$2,$3) as r", ["user-a", "First Company", "recruit-a-1"])).r;
  assert.equal(recruited.ok, true);
  assert.equal(recruited.units, 1);
  const treasuryAfterRecruit = Number(recruited.country.treasury);
  const ownedBefore = one(await pg.query("select count(*)::int as n from country_territories where country_id = $1", [recruited.country.id])).n;

  const training = one(await pg.query(
    "select wwc_attack($1,$2,'probe',true,$3) as r",
    ["user-a", other[0], "train-a-1"],
  )).r;
  assert.equal(training.ok, true);
  assert.equal(training.training, true);
  assert.equal(Number(training.country.treasury), treasuryAfterRecruit);
  const ownedAfterTrain = one(await pg.query("select count(*)::int as n from country_territories where country_id = $1", [recruited.country.id])).n;
  assert.equal(ownedAfterTrain, ownedBefore);
  assert.equal(one(await pg.query("select count(*)::int as n from battles")).n, 0);
  assert.equal(one(await pg.query("select count(*)::int as n from training_battles")).n, 1);

  const battle = one(await pg.query(
    "select wwc_attack($1,$2,'assault',false,$3) as r",
    ["user-a", other[0], "battle-a-1"],
  )).r;
  assert.equal(battle.ok, true);
  assert.equal(battle.training, false);
  assert.equal(Number(battle.country.treasury), treasuryAfterRecruit - 80000);
  assert.ok(Number(battle.country.militaryDeaths) >= 4);
  assert.equal(one(await pg.query("select count(*)::int as n from human_cost_entries")).n, 1);
  assert.equal(one(await pg.query("select count(*)::int as n from battles")).n, 1);
  const double = one(await pg.query(
    "select wwc_attack($1,$2,'assault',false,$3) as r",
    ["user-a", other[0], "battle-a-1"],
  )).r;
  assert.equal(Number(double.country.treasury), Number(battle.country.treasury));
  assert.equal(one(await pg.query("select count(*)::int as n from battles")).n, 1);
  assert.equal(battle.projects === undefined || battle.country.equipment === 0, true);
  assert.equal(Number(battle.country.equipment), 0);
  assert.equal(research.projects[0].category, "agriculture");

  const recruitedB = one(await pg.query("select wwc_recruit($1,$2,$3) as r", ["user-b", "Second Company", "recruit-b-1"])).r;
  assert.equal(recruitedB.ok, true);
  assert.equal(recruitedB.country.equipment, 1);
  const counterTarget = one(await pg.query(
    `select a.territory_id as id
     from country_territories a
     join territories ta on ta.id = a.territory_id
     join country_territories b on b.country_id = $2
     join territories tb on tb.id = b.territory_id
     where a.country_id = $1
       and abs(ta.row - tb.row) + abs(ta.col - tb.col) = 1
     limit 1`,
    [battle.country.id, foundedB.country.id],
  )).id;
  const tooSoon = one(await pg.query(
    "select wwc_counterattack($1,$2,$3) as r",
    ["user-a", counterTarget, "counter-own-land"],
  )).r;
  assert.equal(tooSoon.ok, false);
  const counter = one(await pg.query(
    "select wwc_counterattack($1,$2,$3) as r",
    ["user-b", counterTarget, "counter-b-1"],
  )).r;
  assert.equal(counter.ok, true);
  assert.equal(counter.approval, "counterattack_cost_approved");
  assert.equal(Number(counter.country.treasury), Number(recruitedB.country.treasury) - 40000);
  const counterReplay = one(await pg.query(
    "select wwc_counterattack($1,$2,$3) as r",
    ["user-b", counterTarget, "counter-b-1"],
  )).r;
  assert.equal(Number(counterReplay.country.treasury), Number(counter.country.treasury));
  assert.equal(Number(counter.country.equipment), 0);

  const proposed = one(await pg.query(
    "select wwc_propose($1,$2,'ceasefire',$3,$4) as r",
    ["user-b", battle.country.id, "Hold the border.", "propose-b-1"],
  )).r;
  assert.equal(proposed.ok, true);
  const agreementId = proposed.agreements[0].id;
  const accepted = one(await pg.query(
    "select wwc_answer_treaty($1,$2,true,$3) as r",
    ["user-a", agreementId, "accept-a-1"],
  )).r;
  assert.equal(accepted.ok, true);
  const blocked = one(await pg.query(
    "select wwc_attack($1,$2,'probe',false,$3) as r",
    ["user-a", other[1], "battle-ceasefire"],
  )).r;
  assert.equal(blocked.ok, false);

  await pg.query("update agreements set expires_day = (select day from worlds where id = 'canon') where id = $1", [agreementId]);
  const expiredTick = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-a", "tick-expire-treaty"])).r;
  assert.equal(expiredTick.ok, true);
  const expired = one(await pg.query("select status from agreements where id = $1", [agreementId])).status;
  assert.equal(expired, "expired");
  assert.ok(expiredTick.notices.some((notice) => notice.kind === "treaty"));

  const alliance = one(await pg.query(
    "select wwc_propose($1,$2,'alliance',$3,$4) as r",
    ["user-b", battle.country.id, "Stand together.", "propose-alliance-1"],
  )).r;
  assert.equal(alliance.ok, true);
  const allianceId = alliance.agreements.find((deal) => deal.kind === "alliance").id;
  const allied = one(await pg.query(
    "select wwc_answer_treaty($1,$2,true,$3) as r",
    ["user-a", allianceId, "accept-alliance-1"],
  )).r;
  assert.equal(allied.ok, true);
  const alliedBlock = one(await pg.query(
    "select wwc_attack($1,$2,'probe',false,$3) as r",
    ["user-a", other[1], "battle-alliance"],
  )).r;
  assert.equal(alliedBlock.ok, false);
  assert.match(alliedBlock.error, /treaty/i);
  const cancelled = one(await pg.query(
    "select wwc_cancel_treaty($1,$2,$3) as r",
    ["user-a", allianceId, "cancel-alliance-1"],
  )).r;
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.agreements.find((deal) => deal.id === allianceId).status, "cancelled");

  const credit = one(await pg.query("select wwc_credit_zetos($1,250,$2) as r", ["user-a", "zetos-a-1"])).r;
  assert.equal(credit.ok, true);
  assert.equal(credit.wallet, 250);
  const creditReplay = one(await pg.query("select wwc_credit_zetos($1,250,$2) as r", ["user-a", "zetos-a-1"])).r;
  assert.equal(creditReplay.wallet, 250);
  const packs = await pg.query("select active from zetos_packages");
  assert.ok(packs.rows.length >= 1);
  assert.ok(packs.rows.every((row) => row.active === false));

  const debit = one(await pg.query("select wwc_debit_zetos($1,100,$2) as r", ["user-a", "zetos-debit-1"])).r;
  assert.equal(debit.ok, true);
  assert.equal(debit.wallet, 150);
  const debitReplay = one(await pg.query("select wwc_debit_zetos($1,100,$2) as r", ["user-a", "zetos-debit-1"])).r;
  assert.equal(debitReplay.wallet, 150);
  const short = one(await pg.query("select wwc_debit_zetos($1,1000,$2) as r", ["user-a", "zetos-debit-short"])).r;
  assert.equal(short.ok, false);
  const spendId = debit.ledger.find((row) => row.reason === "staging-spend").id;
  const refund = one(await pg.query("select wwc_refund_zetos($1,$2,$3) as r", ["user-a", spendId, "zetos-refund-1"])).r;
  assert.equal(refund.ok, true);
  assert.equal(refund.wallet, 250);
  const refundAgain = one(await pg.query("select wwc_refund_zetos($1,$2,$3) as r", ["user-a", spendId, "zetos-refund-2"])).r;
  assert.equal(refundAgain.ok, false);

  const issued = one(await pg.query("select wwc_issue_mail_token($1,'reset') as r", ["user-a"])).r;
  assert.equal(issued.ok, true);
  assert.equal(issued.delivered, false);
  assert.equal(issued.token, undefined);
  const captured = one(await pg.query("select token from mail_capture where user_id = 'user-a' and purpose = 'reset'")).token;
  const used = one(await pg.query("select wwc_consume_mail_token($1,'reset') as r", [captured])).r;
  assert.equal(used.ok, true);
  assert.equal(used.userId, "user-a");
  const reuse = one(await pg.query("select wwc_consume_mail_token($1,'reset') as r", [captured])).r;
  assert.equal(reuse.ok, false);
  const stale = one(await pg.query("select wwc_issue_mail_token($1,'verify') as r", ["user-a"])).r;
  assert.equal(stale.delivered, false);
  const verifyToken = one(await pg.query("select token from mail_capture where user_id = 'user-a' and purpose = 'verify'")).token;
  await pg.query("update auth_tokens set expires_at = now() - interval '1 minute' where purpose = 'verify' and used_at is null");
  const expiredToken = one(await pg.query("select wwc_consume_mail_token($1,'verify') as r", [verifyToken])).r;
  assert.equal(expiredToken.ok, false);

  const watching = one(await pg.query("select wwc_spectate($1) as r", ["user-a"])).r;
  assert.equal(watching.spectator, true);
  assert.equal(watching.territories.length, 196);
  assert.equal(watching.country, undefined);
  assert.equal(watching.purchasesEnabled, false);

  await pg.query("insert into action_rates (user_id, created_at) select 'user-a', now() from generate_series(1, 40)");
  const limited = one(await pg.query("select wwc_debit_zetos($1,1,$2) as r", ["user-a", "zetos-rate-1"])).r;
  assert.equal(limited.ok, false);

  const admin = one(await pg.query("select wwc_admin_overview($1) as r", ["user-a"])).r;
  assert.equal(admin.ok, false);
  await pg.query("update player_roles set role = 'admin' where user_id = 'user-a'");
  const desk = one(await pg.query("select wwc_admin_overview($1) as r", ["user-a"])).r;
  assert.equal(desk.ok, true);
  assert.equal(desk.purchasesEnabled, false);
  assert.equal(desk.aiEnabled, false);
  assert.ok(desk.countries >= 2);
  const creditId = one(await pg.query("select id from zetos_ledger where user_id = 'user-a' and reason = 'staging-credit'")).id;
  const reversed = one(await pg.query("select wwc_reverse_zetos($1,$2,$3) as r", ["user-a", creditId, "zetos-reverse-1"])).r;
  assert.equal(reversed.ok, true);
  assert.equal(reversed.wallet, 0);
  const reverseAgain = one(await pg.query("select wwc_reverse_zetos($1,$2,$3) as r", ["user-a", creditId, "zetos-reverse-2"])).r;
  assert.equal(reverseAgain.ok, false);

  await pg.close();
});

test("disposable postgres keeps rows after restart", async () => {
  const { rm } = await import("node:fs/promises");
  const dir = "/tmp/wwc-persist-2d";
  await rm(dir, { recursive: true, force: true });
  const first = new PGlite(dir);
  await first.waitReady;
  for (const file of files) await first.exec(await readFile(file, "utf8"));
  const land = sampleLand(1).map((tile) => tile.id);
  const founded = one(await first.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-keep", "Kept Realm", "republic", "#111111", "#222222", "KR", land, "found-keep-1"],
  )).r;
  assert.equal(founded.ok, true);
  await first.close();
  const second = new PGlite(dir);
  await second.waitReady;
  const again = one(await second.query("select name, treasury from countries where user_id = 'user-keep'"));
  assert.equal(again.name, "Kept Realm");
  assert.equal(Number(again.treasury), 1000000);
  assert.equal(one(await second.query("select count(*)::int as n from territories")).n, 196);
  await second.close();
});

test("approved counterattack cost and inactive research bonuses", async () => {
  const pg = await db();
  const preview = one(await pg.query(
    "select wwc_preview_research_bonus(100000,4000,2000,2500,1,1,1,1,40) as r",
  )).r;
  assert.equal(preview.enabled, false);
  assert.equal(Number(preview.baseline.food), 110000);
  assert.equal(Number(preview.proposed.food), 112200);
  assert.equal(Number(preview.baseline.water), 52500);
  assert.equal(Number(preview.proposed.water), 53550);
  assert.equal(Number(preview.baseline.goods), 2000);
  assert.equal(Number(preview.proposed.goods), 2040);
  assert.equal(Number(preview.proposed.defender), 42);
  const capped = one(await pg.query(
    "select wwc_preview_research_bonus(100000,4000,2000,2500,9,9,9,9,40) as r",
  )).r;
  assert.equal(Number(capped.proposed.agriPct), 8);
  assert.equal(Number(capped.proposed.defenseBonus), 8);

  const land = sampleLand(1).map((tile) => tile.id);
  const founded = one(await pg.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-rule", "Rule Realm", "republic", "#111111", "#222222", "RR", land, "found-rule-1"],
  )).r;
  assert.equal(founded.ok, true);
  const tick = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-rule", "tick-rule-1"])).r;
  assert.equal(Number(tick.country.food), 10000);
  assert.equal(Number(tick.country.water), 2500);
  assert.equal(Number(tick.country.goods), 2000);
  assert.equal(Number(tick.country.treasury), 1010000);
  assert.equal(Number(tick.country.population), 100100);
  const replay = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-rule", "tick-rule-1"])).r;
  assert.equal(Number(replay.country.treasury), 1010000);
  assert.equal(one(await pg.query("select count(*)::int as n from economy_ticks")).n, 1);

  const rule = one(await pg.query("select value from system_settings where key = 'counterattack_cost'")).value;
  assert.equal(rule.amount, 40000);
  assert.equal(rule.status, "approved");
  const bonuses = one(await pg.query("select value from system_settings where key = 'research_bonuses'")).value;
  assert.equal(bonuses.enabled, false);
  await pg.close();
});

test("simultaneous counterattacks cannot overspend", async () => {
  const pg = await db();
  const land = sampleLand(6).map((tile) => tile.id);
  const other = ["T-03-03", "T-03-02", "T-04-02"];
  const founded = one(await pg.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-a", "Ashen Compact", "democracy", "#8f4d4a", "#d4b483", "AC", land, "found-user-a-01"],
  )).r;
  const foundedB = one(await pg.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-b", "Velan Reach", "federation", "#335544", "#88aa99", "VR", other, "found-user-b-02"],
  )).r;
  assert.equal(founded.ok, true);
  assert.equal(foundedB.ok, true);
  await pg.query("select wwc_advance_tick($1,$2)", ["user-a", "tick-both-1"]);
  assert.equal(one(await pg.query("select wwc_recruit($1,$2,$3) as r", ["user-a", "Company", "recruit-a-1"])).r.ok, true);
  assert.equal(one(await pg.query("select wwc_recruit($1,$2,$3) as r", ["user-b", "Company", "recruit-b-1"])).r.ok, true);
  const battle = one(await pg.query(
    "select wwc_attack($1,$2,'probe',false,$3) as r",
    ["user-a", other[0], "battle-open-1"],
  )).r;
  assert.equal(battle.ok, true);
  await pg.query("update countries set treasury = 50000 where user_id = 'user-b'");
  const targets = (await pg.query(
    `select a.territory_id as id
     from country_territories a
     join territories ta on ta.id = a.territory_id
     join country_territories b on b.country_id = $2
     join territories tb on tb.id = b.territory_id
     where a.country_id = $1
       and abs(ta.row - tb.row) + abs(ta.col - tb.col) = 1
     limit 2`,
    [founded.country.id, foundedB.country.id],
  )).rows.map((row) => row.id);
  assert.ok(targets.length >= 1);
  const secondTarget = targets[1] ?? targets[0];
  const settled = await Promise.allSettled([
    pg.query("select wwc_counterattack($1,$2,$3) as r", ["user-b", targets[0], "counter-par-1"]),
    pg.query("select wwc_counterattack($1,$2,$3) as r", ["user-b", secondTarget, "counter-par-2"]),
  ]);
  const treasury = Number(one(await pg.query("select treasury from countries where user_id = 'user-b'")).treasury);
  const successes = settled.filter((item) => item.status === "fulfilled" && item.value.rows[0].r.ok).length;
  assert.ok(treasury >= 0);
  assert.equal(treasury, 50000 - successes * 40000);
  assert.ok(successes <= Math.floor(50000 / 40000));
  await pg.close();
});


test("backup and restore keep a founded country", async () => {
  const { rm } = await import("node:fs/promises");
  const { backupDir, restoreDir } = await import("./wwc-backup-restore.mjs");
  const dir = "/tmp/wwc-backup-live";
  const copy = "/tmp/wwc-backup-copy";
  await rm(dir, { recursive: true, force: true });
  await rm(copy, { recursive: true, force: true });
  const first = new PGlite(dir);
  await first.waitReady;
  for (const file of files) await first.exec(await readFile(file, "utf8"));
  const land = sampleLand(1).map((tile) => tile.id);
  const founded = one(await first.query(
    "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
    ["user-bak", "Backup Realm", "republic", "#111111", "#222222", "BR", land, "found-bak-1"],
  )).r;
  assert.equal(founded.ok, true);
  await first.close();
  await backupDir(dir, copy);
  const damaged = new PGlite(dir);
  await damaged.waitReady;
  await damaged.exec("update countries set name = 'Damaged Realm' where user_id = 'user-bak'");
  assert.equal(one(await damaged.query("select name from countries where user_id = 'user-bak'")).name, "Damaged Realm");
  await damaged.close();
  await restoreDir(copy, dir);
  const restored = new PGlite(dir);
  await restored.waitReady;
  const again = one(await restored.query("select name, treasury from countries where user_id = 'user-bak'"));
  assert.equal(again.name, "Backup Realm");
  assert.equal(Number(again.treasury), 1000000);
  await restored.close();
});

test("research production bonuses stay gated and match the approved preview formulas", async () => {
  const pg = await db();
  assert.equal(one(await pg.query("select wwc_research_production_enabled() as on")).on, false);
  assert.equal(Number(one(await pg.query("select wwc_production_with_bonus(110000, 0) as n")).n), 110000);
  assert.equal(Number(one(await pg.query("select wwc_production_with_bonus(110000, 1) as n")).n), 112200);
  assert.equal(Number(one(await pg.query("select wwc_production_with_bonus(110000, 2) as n")).n), 114400);
  assert.equal(Number(one(await pg.query("select wwc_production_with_bonus(110000, 3) as n")).n), 116600);
  assert.equal(Number(one(await pg.query("select wwc_production_with_bonus(110000, 4) as n")).n), 118800);
  assert.equal(Number(one(await pg.query("select wwc_production_with_bonus(110000, 5) as n")).n), 118800);
  assert.equal(Number(one(await pg.query("select wwc_production_with_bonus(2000, 1) as n")).n), 2040);
  assert.equal(Number(one(await pg.query("select wwc_production_with_bonus(52500, 1) as n")).n), 53550);

  const land = canonicalMap().filter((tile) => tile.status === "AVAILABLE");
  const taken = new Set();
  async function found(user, name, tile) {
    taken.add(tile);
    const row = one(await pg.query(
      "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
      [user, name, "republic", "#111111", "#222222", name.slice(0, 2), [tile], `found-${user}`],
    )).r;
    assert.equal(row.ok, true, row.error);
    return row.country.id;
  }
  async function addProject(id, countryId, title, status) {
    await pg.query(
      `insert into research_projects (id, country_id, title, cost, days_total, days_left, status, created_day)
       values ($1, $2, $3, 25000, 2, 0, $4, 1)`,
      [id, countryId, title, status],
    );
  }

  const defenderId = await found("user-def", "Defence Hold", land[0].id);
  const attackerId = await found("user-atk", "Assault Line", land.find((tile) => Math.abs(tile.row - land[0].row) + Math.abs(tile.col - land[0].col) === 1).id);
  await pg.query("select wwc_advance_tick($1,$2)", ["user-atk", "tick-goods"]);
  assert.equal(one(await pg.query("select wwc_recruit($1,$2,$3) as r", ["user-atk", "Company", "recruit-atk"])).r.ok, true);
  const plain = one(await pg.query("select wwc_attack($1,$2,'probe',true,$3) as r", ["user-atk", land[0].id, "battle-plain"])).r;
  assert.equal(plain.ok, true);
  const plainDefender = Number(plain.battle.defender);
  const plainStrength = Number(plain.battle.strength);
  await addProject("RD1", defenderId, "fort wall plan", "complete");
  await addProject("RD2", defenderId, "shield rampart plan", "complete");
  const stillPlain = one(await pg.query("select wwc_attack($1,$2,'probe',true,$3) as r", ["user-atk", land[0].id, "battle-still-off"])).r;
  assert.equal(Number(stillPlain.battle.defender), plainDefender);
  assert.equal(Number(stillPlain.battle.strength), plainStrength);

  await pg.query("update system_settings set value = '{\"enabled\": true, \"scope\": \"preview-test\"}'::jsonb where key = 'research_production_bonuses'");
  const boosted = one(await pg.query("select wwc_attack($1,$2,'probe',true,$3) as r", ["user-atk", land[0].id, "battle-boost"])).r;
  assert.equal(Number(boosted.battle.defender), plainDefender + 4);
  assert.equal(Number(boosted.battle.strength), plainStrength);
  const attackerTile = land.find((tile) => Math.abs(tile.row - land[0].row) + Math.abs(tile.col - land[0].col) === 1);
  const open = land.find((tile) => !taken.has(tile.id) && Math.abs(tile.row - attackerTile.row) + Math.abs(tile.col - attackerTile.col) === 1);
  assert.ok(open, "need an empty neighbour for the training check");
  const beforeTrain = Number(one(await pg.query("select treasury from countries where user_id = 'user-atk'")).treasury);
  const training = one(await pg.query("select wwc_attack($1,$2,'probe',true,$3) as r", ["user-atk", open.id, "train-bonus"])).r;
  assert.equal(training.ok, true);
  assert.equal(training.training, true);
  assert.equal(Number(training.country.treasury), beforeTrain);
  assert.equal(Number(one(await pg.query("select count(*)::int as n from battles")).n), 0);

  const economy = [];
  for (let count = 0; count <= 5; count += 1) {
    const tile = land.find((item) => !taken.has(item.id));
    const id = await found(`user-n${count}`, `Farm ${count} Realm`, tile.id);
    for (let n = 0; n < count; n += 1) await addProject(`RA-${count}-${n}`, id, `grain harvest plan ${count}-${n}`, "complete");
    economy.push(id);
  }
  const mixTile = land.find((item) => !taken.has(item.id));
  const mix = await found("user-mix", "Mixed Realm", mixTile.id);
  await addProject("RM-A", mix, "grain harvest plan mix", "complete");
  await addProject("RM-I", mix, "factory forge plan", "complete");
  await addProject("RM-W", mix, "road and bridge plan", "complete");
  const pendingTile = land.find((item) => !taken.has(item.id));
  const pending = await found("user-pend", "Pending Realm", pendingTile.id);
  await addProject("RP1", pending, "grain harvest plan pending", "active");
  const rejectedTile = land.find((item) => !taken.has(item.id));
  const rejected = await found("user-rej", "Rejected Realm", rejectedTile.id);
  await addProject("RR1", rejected, "grain harvest plan rejected", "rejected");
  const cancelTile = land.find((item) => !taken.has(item.id));
  const cancelled = await found("user-can", "Cancelled Realm", cancelTile.id);
  await addProject("RC1", cancelled, "grain harvest plan cancel", "complete");
  const cancelledResult = one(await pg.query("select wwc_cancel_research($1,$2,$3) as r", ["user-can", "RC1", "cancel-research-1"])).r;
  assert.equal(cancelledResult.ok, true);
  assert.equal(one(await pg.query("select status from research_projects where id = 'RC1'")).status, "cancelled");

  const tick = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-n0", "tick-bonus-1"])).r;
  assert.equal(tick.ok, true);
  const foodOf = async (user) => Number(one(await pg.query("select food from countries where user_id = $1", [user])).food);
  const expectedFood = [10000, 12200, 14400, 16600, 18800, 18800];
  for (let count = 0; count <= 5; count += 1) assert.equal(await foodOf(`user-n${count}`), expectedFood[count], `agriculture ${count}`);
  assert.equal(await foodOf("user-mix"), 12200);
  assert.equal(Number(one(await pg.query("select goods from countries where user_id = 'user-mix'")).goods), 2040);
  assert.equal(Number(one(await pg.query("select water from countries where user_id = 'user-mix'")).water), 3550);
  assert.equal(await foodOf("user-pend"), 10000);
  assert.equal(await foodOf("user-rej"), 10000);
  assert.equal(await foodOf("user-can"), 10000);
  const replay = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-n0", "tick-bonus-1"])).r;
  assert.equal(await foodOf("user-n1"), 12200);
  assert.equal(Number(replay.country.food), await foodOf("user-n0"));
  assert.equal(one(await pg.query("select count(*)::int as n from economy_ticks")).n, 2);
  const setters = one(await pg.query("select count(*)::int as n from pg_proc where proname in ('wwc_enable_research', 'wwc_set_research_bonus')")).n;
  assert.equal(setters, 0);
  await pg.query("update system_settings set value = '{\"enabled\": false}'::jsonb where key = 'research_production_bonuses'");
  await pg.query("select wwc_set_budget($1,1000,4000,2000,2500,1500,$2)", ["user-n0", "budget-cannot-enable"]);
  assert.equal(one(await pg.query("select wwc_research_production_enabled() as on")).on, false);
  await pg.close();
});

test("three commanders share one world and keep it after restart", async () => {
  const { rm } = await import("node:fs/promises");
  const dir = "/tmp/wwc-three-commanders";
  await rm(dir, { recursive: true, force: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  for (const file of files) await pg.exec(await readFile(file, "utf8"));
  const land = canonicalMap().filter((tile) => tile.status === "AVAILABLE");
  const cluster = sampleLand(2);
  const neighbour = land.find((tile) => !cluster.some((owned) => owned.id === tile.id) && cluster.some((owned) => Math.abs(owned.row - tile.row) + Math.abs(owned.col - tile.col) === 1));
  const distant = land.find((tile) => tile.id !== neighbour?.id && !cluster.some((owned) => Math.abs(owned.row - tile.row) + Math.abs(owned.col - tile.col) <= 1));
  assert.ok(neighbour && distant);
  const commanders = [
    ["user-north", "North Realm", cluster.map((tile) => tile.id)],
    ["user-south", "South Realm", [neighbour.id]],
    ["user-east", "East Realm", [distant.id]],
  ];
  const countries = {};
  for (const [user, name, tiles] of commanders) {
    const founded = one(await pg.query(
      "select wwc_found_country($1,$2,$3,$4,$5,$6,$7,$8) as r",
      [user, name, "republic", "#203040", "#c0a060", name.slice(0, 2), tiles, `found-${user}`],
    )).r;
    assert.equal(founded.ok, true, founded.error);
    countries[user] = founded.country.id;
    assert.equal(Number(founded.country.treasury), 1000000);
    assert.equal(Number(founded.country.population), 100000);
  }
  assert.equal(one(await pg.query("select count(*)::int as n from territories")).n, 196);
  assert.equal(one(await pg.query("select count(*)::int as n from (select territory_id from country_territories group by territory_id having count(*) > 1) d")).n, 0);

  const firstDay = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-north", "day-1-north"])).r;
  assert.equal(firstDay.ok, true, firstDay.error);
  assert.equal(Number(firstDay.country.food), 10000);
  const replay = one(await pg.query("select wwc_advance_tick($1,$2) as r", ["user-north", "day-1-north"])).r;
  assert.equal(Number(replay.country.treasury), 1010000);
  assert.equal(one(await pg.query("select count(*)::int as n from economy_ticks")).n, 1);
  assert.equal(Number(one(await pg.query("select food from countries where user_id = 'user-south'")).food), 10000);

  assert.equal(one(await pg.query("select wwc_recruit($1,$2,$3) as r", ["user-north", "North Company", "recruit-north"])).r.ok, true);
  const beforeTraining = Number(one(await pg.query("select treasury from countries where user_id = 'user-north'")).treasury);
  const battle = one(await pg.query("select wwc_attack($1,$2,'probe',true,$3) as r", ["user-north", neighbour.id, "train-three"])).r;
  assert.equal(battle.ok, true, battle.error);
  assert.equal(battle.training, true);
  assert.equal(Number(one(await pg.query("select treasury from countries where user_id = 'user-north'")).treasury), beforeTraining);

  const proposal = one(await pg.query(
    "select wwc_propose($1,$2,'alliance','A staging alliance',$3) as r",
    ["user-east", countries["user-south"], "ally-1"],
  )).r;
  assert.equal(proposal.ok, true);
  const agreement = one(await pg.query("select id from agreements where proposer_id = $1", [countries["user-east"]])).id;
  const accepted = one(await pg.query("select wwc_answer_treaty($1,$2,true,$3) as r", ["user-south", agreement, "ally-accept"])).r;
  assert.equal(accepted.ok, true);
  const before = one(await pg.query("select count(*)::int as n from country_territories where country_id = $1", [countries["user-east"]])).n;
  const surrender = one(await pg.query(
    "select wwc_propose($1,$2,'surrender','No land changes',$3) as r",
    ["user-east", countries["user-north"], "surrender-1"],
  )).r;
  assert.equal(surrender.ok, true);
  const surrenderId = one(await pg.query("select id from agreements where kind = 'surrender'")).id;
  assert.equal(one(await pg.query("select wwc_answer_treaty($1,$2,true,$3) as r", ["user-north", surrenderId, "surrender-accept"])).r.ok, true);
  assert.equal(one(await pg.query("select count(*)::int as n from country_territories where country_id = $1", [countries["user-east"]])).n, before);
  assert.equal(one(await pg.query("select wwc_admin_overview($1) as r", ["user-east"])).r.ok, false);

  const seen = one(await pg.query("select wwc_state($1) as r", ["user-east"])).r;
  assert.equal(seen.day, 2);
  assert.equal(seen.territories.length, 196);
  await pg.close();

  const reopened = new PGlite(dir);
  await reopened.waitReady;
  const kept = one(await reopened.query("select name, treasury from countries where user_id = 'user-east'"));
  assert.equal(kept.name, "East Realm");
  assert.equal(Number(kept.treasury), 1010000);
  assert.equal(one(await reopened.query("select count(*)::int as n from countries")).n, 3);
  assert.equal(one(await reopened.query("select status from agreements where kind = 'alliance'")).status, "active");
  await reopened.close();
});


