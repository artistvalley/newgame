import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import {
  adminOverview,
  advanceTick,
  answerTreaty,
  cancelTreaty,
  counterattack,
  creditZetos,
  debitZetos,
  fight,
  foundCountry,
  getWorld,
  moveCapital,
  proposeTreaty,
  recruitUnit,
  refundZetos,
  rehabilitate,
  setBudget,
  startResearch,
} from "@/lib/wwc/api";
import { t, translateError, type CopyKey, type Lang } from "@/lib/wwc/i18n";

type Tile = {
  id: string;
  row: number;
  col: number;
  terrain: string;
  resources: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  capital: boolean;
};

type Country = {
  id: string;
  name: string;
  treasury: number;
  population: number;
  stability: number;
  economy: number;
  technology: number;
  logistics: number;
  goods: number;
  food: number;
  water: number;
  infraDamage: number;
  militaryDeaths: number;
  wounded: number;
  disabled: number;
  civilianDeaths: number;
  displaced: number;
  taxBp: number;
  agriBp: number;
  industryBp: number;
  infraBp: number;
  reservesBp: number;
  equipment?: number;
  readiness?: number;
};

type World = {
  ok: boolean;
  error?: string;
  day: number;
  role: string;
  wallet: number;
  country: Country | null;
  units: number;
  territories: Tile[];
  projects: { id: string; title: string; daysLeft: number; status: string; cost: number; category?: string }[];
  battles: { id: string; posture: string; outcome: string; target: string; spend: number; militaryDeaths: number; civilianDeaths: number; changed: boolean }[];
  training: { id: string; posture: string; outcome: string; militaryDeaths: number }[];
  agreements: { id: string; kind: string; status: string; proposer: string; target: string; targetId: string; proposerId: string }[];
  relations?: { countryId: string; kind: string; status: string }[];
  messages: { id: string; from: string; body: string; day: number }[];
  ledger: { id?: string; amount: number; reason: string; balanceAfter: number }[];
  notices?: { id: string; kind: string; body: string; day: number }[];
  books?: { day: number; amount: number; reason: string; balanceAfter: number }[];
  feed?: { id: string; posture: string; outcome: string; day: number; attacker?: string; defender?: string; target: string }[];
  researchBonusesEnabled?: boolean;
};

const COLORS: Record<string, string> = {
  Ocean: "#16343f",
  Plains: "#c6b07a",
  Forest: "#2c5a38",
  Hills: "#8d7344",
  Desert: "#c99555",
  Mountain: "#6d6258",
  Riverland: "#3c6f78",
};

function freshKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function connected(tiles: Tile[], ids: string[]) {
  if (ids.length <= 1) return true;
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  const chosen = new Set(ids);
  const seen = new Set<string>([ids[0]]);
  const queue = [ids[0]];
  while (queue.length) {
    const id = queue.shift();
    const tile = id ? byId.get(id) : undefined;
    if (!tile) return false;
    for (const other of tiles) {
      if (!chosen.has(other.id) || seen.has(other.id)) continue;
      if (Math.abs(tile.row - other.row) + Math.abs(tile.col - other.col) === 1) {
        seen.add(other.id);
        queue.push(other.id);
      }
    }
  }
  return seen.size === ids.length;
}

export function Command() {
  const [world, setWorld] = useState<World | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState(0);
  const [lang, setLang] = useState<Lang>("en");
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [government, setGovernment] = useState("democracy");
  const [busy, setBusy] = useState(false);
  const [research, setResearch] = useState("Improved field rations for the winter levy");
  const [posture, setPosture] = useState("probe");
  const [target, setTarget] = useState("");
  const [treatyTarget, setTreatyTarget] = useState("");
  const [treatyKind, setTreatyKind] = useState("ceasefire");
  const [admin, setAdmin] = useState<string>("");
  const [link, setLink] = useState<"linked" | "reconnecting">("linked");
  const [showGuide, setShowGuide] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const suppressClick = useRef(false);
  const label = (key: CopyKey) => t(lang, key);

  async function refresh() {
    try {
      const next = (await getWorld()) as World;
      setWorld(next);
      setLink("linked");
      return next;
    } catch (err) {
      setLink("reconnecting");
      throw err;
    }
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      if (!result.ok) setError(translateError(lang, result.error || "The server refused that order."));
      else setNotice(success ?? label("done"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The order failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem("wwc-next-steps-seen")) setShowNext(true);
    } catch {
      setShowNext(true);
    }
  }, []);

  function dismissNext() {
    setShowNext(false);
    try {
      window.localStorage.setItem("wwc-next-steps-seen", "1");
    } catch {
      /* private mode */
    }
  }

  function switchTab(index: number) {
    setTab(index);
    window.scrollTo({ top: 0 });
  }

  const labels = [label("map"), label("economy"), label("research"), label("military"), label("diplomacy"), label("human"), label("zetos")];
  const country = world?.country ?? null;
  const tiles = world?.territories ?? [];
  const allies = useMemo(() => {
    const ids = new Set<string>();
    for (const relation of world?.relations ?? []) {
      if (relation.status === "active") ids.add(relation.countryId);
    }
    return ids;
  }, [world?.relations]);
  const detail = tiles.find((tile) => tile.id === (target || selected[0]));
  const others = useMemo(() => {
    const names = new Map<string, string>();
    for (const tile of tiles) {
      if (tile.ownerId && tile.ownerId !== country?.id && tile.ownerName) names.set(tile.ownerId, tile.ownerName);
    }
    return [...names.entries()];
  }, [tiles, country?.id]);

  function onTile(tile: Tile) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!country) {
      if (tile.status !== "AVAILABLE") return;
      setSelected((current) => {
        if (current.includes(tile.id)) {
          const next = current.filter((id) => id !== tile.id);
          return connected(tiles, next) ? next : current;
        }
        if (current.length >= 6) return current;
        const next = [...current, tile.id];
        return connected(tiles, next) ? next : current;
      });
      setTarget("");
      return;
    }
    setTarget(tile.id);
  }

  function suggestRealm() {
    const land = tiles.filter((tile) => tile.status === "AVAILABLE");
    const start = land.find((tile) => tile.row === 3 && tile.col === 3) ?? land[0];
    if (!start) return;
    const chosen: string[] = [];
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length && chosen.length < 6) {
      const tile = queue.shift();
      if (!tile || seen.has(tile.id)) continue;
      seen.add(tile.id);
      chosen.push(tile.id);
      for (const next of land) {
        if (!seen.has(next.id) && Math.abs(tile.row - next.row) + Math.abs(tile.col - next.col) === 1) queue.push(next);
      }
    }
    setSelected(chosen);
  }

  function pickNeighbor() {
    if (!country) return;
    const mine = tiles.filter((tile) => tile.ownerId === country.id);
    const neighbor = tiles.find(
      (tile) =>
        tile.terrain !== "Ocean" &&
        tile.ownerId !== country.id &&
        mine.some((owned) => Math.abs(owned.row - tile.row) + Math.abs(owned.col - tile.col) === 1),
    );
    if (neighbor) setTarget(neighbor.id);
  }

  function onPress(tile: Tile) {
    if (country || !selected.includes(tile.id)) return;
    suppressClick.current = false;
    const timer = window.setTimeout(() => {
      suppressClick.current = true;
      setSelected((current) => [tile.id, ...current.filter((id) => id !== tile.id)]);
      setNotice(`${tile.id} is now your capital ★`);
    }, 500);
    const clear = () => window.clearTimeout(timer);
    window.addEventListener("pointerup", clear, { once: true });
    window.addEventListener("pointercancel", clear, { once: true });
  }

  const navItems: { icon: string; text: string }[] = [
    { icon: "🗺️", text: label("navMap") },
    { icon: "💰", text: label("navEconomy") },
    { icon: "🔬", text: label("navResearch") },
    { icon: "🪖", text: label("navMilitary") },
    { icon: "🤝", text: label("navDiplomacy") },
    { icon: "❤️‍🩹", text: label("navHuman") },
    { icon: "🪙", text: label("navZetos") },
  ];
  const nameOk = name.trim().length >= 3;
  const ownTiles = country ? tiles.filter((tile) => tile.ownerId === country.id) : [];
  const targetTile = tiles.find((tile) => tile.id === target);
  const targetText = targetTile
    ? `${targetTile.id} · ${targetTile.terrain}${targetTile.ownerName ? ` · ${targetTile.ownerName}` : ""}`
    : label("noTarget");

  if (!world && !error) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="space-y-3 text-center">
          <div className="wwc-spinner mx-auto" aria-hidden />
          <p className="kicker">{label("reading")}</p>
        </div>
      </main>
    );
  }

  if (!world && error) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="panel max-w-sm space-y-4 p-6 text-center">
          <p className="text-base">{label("loadFailed")}</p>
          <p className="text-sm text-[#e7b2a8]">{error}</p>
          <button
            className="btn w-full"
            type="button"
            onClick={() => {
              setError("");
              refresh().catch((err: Error) => setError(err.message));
            }}
          >
            {label("retry")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={country ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : "pb-10"}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4">
        <div className="min-w-0">
          <p className="kicker flex items-center gap-2">
            <span>{label("day")} {world?.day ?? "—"}</span>
            <span
              className={`inline-block h-2 w-2 rounded-full ${link === "linked" ? "bg-emerald-400" : "bg-amber-400"}`}
              aria-label={link === "linked" ? label("linked") : label("reconnecting")}
            />
            <span className="normal-case tracking-normal text-[#9fb0c6]">{link === "linked" ? label("linked") : label("reconnecting")}</span>
          </p>
          <h1 className="font-display truncate text-3xl leading-tight sm:text-4xl">{country?.name ?? label("welcomeTitle")}</h1>
          {world?.role && world.role !== "player" ? (
            <p className="text-sm text-[#cbbfa6]">{label("profile")}: {world.role}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="tab min-w-11" type="button" onClick={() => setShowGuide(true)} aria-label={label("help")}>
            ? <span className="ml-1 hidden sm:inline">{label("help")}</span>
          </button>
          <select
            className="field mt-0 w-auto py-2"
            value={lang}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "en" || next === "ta" || next === "hi") setLang(next);
            }}
            aria-label={label("language")}
          >
            <option value="en">English</option>
            <option value="ta">தமிழ்</option>
            <option value="hi">हिन्दी</option>
          </select>
          <UserButton />
        </div>
      </header>

      {world && !country ? (
        <section className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
          <form
            className="panel space-y-4 p-4 lg:order-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (selected.length < 1) {
                setError(label("needLand"));
                return;
              }
              if (!nameOk) {
                setError(label("needName"));
                return;
              }
              void run(
                () =>
                  foundCountry({
                    data: {
                      name,
                      government,
                      flagPrimary: "#8f4d4a",
                      flagSecondary: "#d4b483",
                      flagSymbol: name.slice(0, 2).toUpperCase() || "WW",
                      territories: selected,
                      idempotencyKey: freshKey("found"),
                    },
                  }),
                label("foundDone"),
              );
            }}
          >
            <div className="space-y-2">
              <h2 className="font-display text-2xl">{label("foundTitle")}</h2>
              <p className="text-sm text-[#cbd5e3]">{label("welcomeGoal")}</p>
            </div>
            <ol className="space-y-3">
              <Step n={1} done={selected.length > 0} text={label("step1")}>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button className="tab" type="button" onClick={suggestRealm}>
                    ✨ {label("pickForMe")}
                  </button>
                  {selected.length ? (
                    <button className="tab" type="button" onClick={() => setSelected([])}>
                      {label("clearPick")}
                    </button>
                  ) : null}
                  <span className="text-sm text-[#f5c85b]">
                    {selected.length}/6 {label("regionsChosen")}
                  </span>
                </div>
                {selected.length > 1 ? (
                  <label className="mt-2 block text-sm">
                    ★ {label("capitalLabel")}
                    <select
                      className="field"
                      value={selected[0]}
                      onChange={(event) => {
                        const id = event.target.value;
                        setSelected((current) => [id, ...current.filter((item) => item !== id)]);
                      }}
                    >
                      {selected.map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </Step>
              <Step n={2} done={nameOk} text={label("step2")}>
                <label className="mt-2 block text-sm">
                  {label("name")}
                  <input
                    className="field"
                    value={name}
                    maxLength={32}
                    autoComplete="off"
                    placeholder="e.g. Northland"
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="mt-2 block text-sm">
                  {label("government")}
                  <select className="field" value={government} onChange={(event) => setGovernment(event.target.value)}>
                    <option value="democracy">Democracy</option>
                    <option value="federation">Federation</option>
                    <option value="monarchy">Monarchy</option>
                    <option value="republic">Republic</option>
                  </select>
                </label>
              </Step>
              <Step n={3} done={false} text={label("step3")}>
                <button className="btn mt-2 w-full" disabled={busy} type="submit">
                  {busy ? label("working") : `🚩 ${label("foundCta")}`}
                </button>
              </Step>
            </ol>
            <p className="text-xs text-[#9fb0c6]">{label("watch")}</p>
          </form>
          <div className="min-w-0 space-y-2 lg:order-1">
            <p className="text-sm text-[#cbd5e3]">{label("mapHint")}</p>
            <MapBoard tiles={tiles} selected={selected} target={target} zoom={zoom} setZoom={setZoom} onTile={onTile} onPress={onPress} ownId={null} allies={new Set()} lang={lang} />
            <Zoom zoom={zoom} setZoom={setZoom} lang={lang} />
          </div>
        </section>
      ) : null}

      {country ? (
        <section className="mx-auto max-w-3xl px-4 pt-4">
          <h2 className="mb-3 font-display text-2xl">
            {navItems[tab]?.icon} {labels[tab]}
          </h2>
          {tab === 0 ? (
            <div className="space-y-3">
              {showNext ? (
                <div className="panel space-y-2 border-[#f5c85b]/60 p-4">
                  <h3 className="font-display text-xl">{label("nextTitle")}</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-[#cbd5e3]">
                    <li>{label("next1")}</li>
                    <li>{label("next2")}</li>
                    <li>{label("next3")}</li>
                  </ul>
                  <button className="btn" type="button" onClick={dismissNext}>
                    {label("gotIt")}
                  </button>
                </div>
              ) : null}
              <p className="text-sm text-[#cbd5e3]">{label("mapHint")}</p>
              <MapBoard tiles={tiles} selected={[]} target={target} zoom={zoom} setZoom={setZoom} onTile={onTile} onPress={onPress} ownId={country.id} allies={allies} lang={lang} />
              <Zoom zoom={zoom} setZoom={setZoom} lang={lang} />
              <div className="panel space-y-2 p-3 text-sm">
                <p>
                  <span className="text-[#9fb0c6]">{label("selected")}: </span>
                  {detail ? `${detail.id} · ${detail.terrain} · ${detail.resources || label("none")} · ${detail.ownerName || detail.status}` : label("none")}
                </p>
                <button className="tab w-full sm:w-auto" type="button" onClick={pickNeighbor}>
                  🎯 {label("aim")}
                </button>
              </div>
              <NoticeList title={label("notices")} rows={world?.notices ?? []} lang={lang} />
              <NoticeList title={label("feed")} rows={(world?.feed ?? []).map((row) => ({ id: row.id, body: `${row.attacker ?? ""} ${row.posture} ${row.target}: ${row.outcome}`, day: row.day }))} lang={lang} />
            </div>
          ) : null}
          {tab === 1 ? (
            <div className="panel space-y-3 p-4">
              <Intro text={label("economyIntro")} />
              <Stat label={label("treasury")} value={country.treasury} />
              <Stat label={label("population")} value={country.population} />
              <Stat label={label("stocks")} value={`${country.food} / ${country.water} / ${country.goods}`} />
              <Stat label={label("rates")} value={`${country.stability} / ${country.economy} / ${country.technology}`} />
              <p className="text-sm text-[#cbbfa6]">{label("budget")}</p>
              {country.stability < 66 ? <p className="rounded-lg bg-[#5a2320]/60 p-2 text-sm text-[#f3c4bb]">⚠️ {label("shortage")}</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="btn" disabled={busy} type="button" onClick={() => void run(() => setBudget({ data: { tax: 1000, agri: 4000, industry: 2000, infra: 2500, reserves: 1500, idempotencyKey: freshKey("budget") } }))}>
                  {label("confirmBudget")}
                </button>
                <button className="tab" disabled={busy} type="button" onClick={() => void run(() => advanceTick({ data: { idempotencyKey: freshKey("tick") } }))}>
                  ⏭️ {label("advance")}
                </button>
              </div>
              <h3 className="font-display text-xl">{label("books")}</h3>
              <ul className="space-y-1 text-sm">
                {(world?.books ?? []).map((row, index) => (
                  <li key={`${row.reason}-${index}`}>{label("day")} {row.day}: {row.reason} {row.amount} → {row.balanceAfter}</li>
                ))}
                {!(world?.books ?? []).length ? <li className="text-[#9fb0c6]">{label("noBooks")}</li> : null}
              </ul>
            </div>
          ) : null}
          {tab === 2 ? (
            <form
              className="panel space-y-3 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => startResearch({ data: { title: research, idempotencyKey: freshKey("research") } }));
              }}
            >
              <Intro text={label("researchIntro")} />
              <p className="text-sm text-[#cbbfa6]">{label("researchHelp")}</p>
              <p className="text-sm text-[#9fb0c6]">{world?.researchBonusesEnabled ? label("bonusOn") : label("bonusOff")}</p>
              <textarea className="field min-h-28" value={research} onChange={(event) => setResearch(event.target.value)} aria-label={label("research")} />
              <button className="btn w-full sm:w-auto" disabled={busy || !research.trim()} type="submit">{label("startResearch")}</button>
              <ul className="space-y-1 text-sm">
                {world?.projects.map((project) => (
                  <li key={project.id}>{project.status}: {project.title} · {project.category ?? "general"} · {project.daysLeft} days · {project.cost}</li>
                ))}
                {!world?.projects.length ? <li className="text-[#9fb0c6]">{label("noProjects")}</li> : null}
              </ul>
            </form>
          ) : null}
          {tab === 3 ? (
            <div className="panel space-y-3 p-4">
              <Intro text={label("militaryIntro")} />
              <p className="text-sm">{label("units")} {world?.units ?? 0} · {label("equipment")} {country.equipment ?? 0} · {label("readiness")} {country.readiness ?? 0}</p>
              <p className="text-sm text-[#cbbfa6]">{label("costs")}</p>
              <button className="btn w-full sm:w-auto" disabled={busy} type="button" onClick={() => void run(() => recruitUnit({ data: { name: "Company", idempotencyKey: freshKey("recruit") } }))}>
                {label("recruit")}
              </button>
              <label className="block text-sm">
                Posture
                <select className="field" value={posture} onChange={(event) => setPosture(event.target.value)}>
                  <option value="probe">Probe (small raid)</option>
                  <option value="assault">Assault (full attack)</option>
                  <option value="defend">Defend</option>
                </select>
              </label>
              <p className="text-sm"><span className="text-[#9fb0c6]">{label("target")}: </span>{targetText}</p>
              <button className="tab w-full sm:w-auto" type="button" onClick={pickNeighbor}>
                🎯 {label("aim")}
              </button>
              <div className="grid gap-2 sm:grid-cols-3">
                <button className="btn" disabled={busy || !target} type="button" onClick={() => void run(() => fight({ data: { target, posture, training: true, idempotencyKey: freshKey("train") } }))}>
                  {label("training")}
                </button>
                <button className="tab" disabled={busy || !target} type="button" onClick={() => void run(() => fight({ data: { target, posture, training: false, idempotencyKey: freshKey("battle") } }))}>
                  {label("real")}
                </button>
                <button className="tab" disabled={busy || !target} type="button" onClick={() => void run(() => counterattack({ data: { target, idempotencyKey: freshKey("counter") } }))}>
                  {label("counter")}
                </button>
              </div>
              <p className="text-sm text-[#9fb0c6]">{label("counterHelp")}</p>
              <h3 className="font-display text-xl">{label("reports")}</h3>
              <ul className="space-y-1 text-sm">
                {world?.battles.map((battle) => (
                  <li key={battle.id}>{battle.posture} {battle.target}: {battle.outcome}. Soldiers killed {battle.militaryDeaths}. Civilians {battle.civilianDeaths}. Land changed: {battle.changed ? "yes" : "no"}.</li>
                ))}
                {world?.training.map((battle) => (
                  <li key={battle.id}>Training {battle.posture}: {battle.outcome}. Not applied. Soldiers in the report {battle.militaryDeaths}.</li>
                ))}
                {!world?.battles.length && !world?.training.length ? <li className="text-[#9fb0c6]">{label("noReports")}</li> : null}
              </ul>
            </div>
          ) : null}
          {tab === 4 ? (
            <div className="panel space-y-3 p-4">
              <Intro text={label("diplomacyIntro")} />
              {others.length ? (
                <>
                  <label className="block text-sm">
                    {label("other")}
                    <select className="field" value={treatyTarget} onChange={(event) => setTreatyTarget(event.target.value)}>
                      <option value="">{label("none")}</option>
                      {others.map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    {label("kind")}
                    <select className="field" value={treatyKind} onChange={(event) => setTreatyKind(event.target.value)}>
                      <option value="ceasefire">{label("ceasefire")}</option>
                      <option value="alliance">{label("alliance")}</option>
                      <option value="peace">{label("peace")}</option>
                      <option value="nonaggression">{label("nonaggression")}</option>
                      <option value="surrender">{label("surrender")}</option>
                    </select>
                  </label>
                  <button className="btn w-full sm:w-auto" disabled={busy || !treatyTarget} type="button" onClick={() => void run(() => proposeTreaty({ data: { targetId: treatyTarget, kind: treatyKind, body: "Hold the border.", idempotencyKey: freshKey("treaty") } }))}>
                    {label("propose")}
                  </button>
                </>
              ) : (
                <p className="rounded-lg bg-black/20 p-3 text-sm text-[#9fb0c6]">{label("noOthers")}</p>
              )}
              <ul className="space-y-2 text-sm">
                {world?.agreements.map((deal) => (
                  <li key={deal.id} className="flex flex-wrap items-center gap-2 border-b border-[#284767] pb-2">
                    <span className="w-full sm:w-auto">{deal.kind} · {deal.proposer} → {deal.target} · {deal.status}</span>
                    {deal.status === "proposed" && deal.targetId === country.id ? (
                      <>
                        <button className="btn" type="button" disabled={busy} onClick={() => void run(() => answerTreaty({ data: { agreementId: deal.id, accept: true, idempotencyKey: freshKey("accept") } }))}>
                          {label("accept")}
                        </button>
                        <button className="tab" type="button" disabled={busy} onClick={() => void run(() => answerTreaty({ data: { agreementId: deal.id, accept: false, idempotencyKey: freshKey("reject") } }))}>
                          {label("reject")}
                        </button>
                      </>
                    ) : null}
                    {deal.status === "active" ? (
                      <button className="tab" type="button" disabled={busy} onClick={() => void run(() => cancelTreaty({ data: { agreementId: deal.id, idempotencyKey: freshKey("cancel") } }))}>
                        {label("cancel")}
                      </button>
                    ) : null}
                  </li>
                ))}
                {!world?.agreements.length && others.length ? <li className="text-[#9fb0c6]">{label("noDeals")}</li> : null}
              </ul>
              {world?.messages.length ? (
                <ul className="space-y-1 text-sm text-[#cbbfa6]">
                  {world.messages.map((message) => (
                    <li key={message.id}>{label("day")} {message.day}: {message.from} — {message.body}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {tab === 5 ? (
            <div className="panel space-y-3 p-4">
              <Intro text={label("humanIntro")} />
              <p className="text-sm text-[#9fb0c6]">{label("humanHelp")}</p>
              <Stat label={label("killed")} value={country.militaryDeaths} />
              <Stat label={label("wounded")} value={country.wounded} />
              <Stat label={label("disabled")} value={country.disabled} />
              <Stat label={label("civilians")} value={country.civilianDeaths} />
              <Stat label={label("displaced")} value={country.displaced} />
              <Stat label={label("damage")} value={country.infraDamage} />
              <button className="btn w-full sm:w-auto" disabled={busy} type="button" onClick={() => void run(() => rehabilitate({ data: { idempotencyKey: freshKey("rehab") } }))}>
                {label("rehab")}
              </button>
              <label className="block text-sm">
                ★ {label("moveCapital")}
                <select className="field" value={ownTiles.some((tile) => tile.id === target) ? target : ""} onChange={(event) => setTarget(event.target.value)}>
                  <option value="">{label("none")}</option>
                  {ownTiles.map((tile) => (
                    <option key={tile.id} value={tile.id}>{tile.id} · {tile.terrain}{tile.capital ? " ★" : ""}</option>
                  ))}
                </select>
              </label>
              <button className="tab w-full sm:w-auto" disabled={busy || !target} type="button" onClick={() => void run(() => moveCapital({ data: { target, idempotencyKey: freshKey("capital") } }))}>
                {label("moveCapital")}
              </button>
            </div>
          ) : null}
          {tab === 6 ? (
            <div className="panel space-y-3 p-4">
              <Intro text={label("zetosIntro")} />
              <Stat label={label("wallet")} value={world?.wallet ?? 0} />
              <p className="text-sm text-[#9fb0c6]">{label("walletHelp")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="btn" disabled={busy} type="button" onClick={() => void run(() => creditZetos({ data: { amount: 250, idempotencyKey: freshKey("zetos") } }))}>
                  {label("credit")}
                </button>
                <button className="tab" disabled={busy} type="button" onClick={() => void run(() => debitZetos({ data: { amount: 100, idempotencyKey: freshKey("spend") } }))}>
                  {label("spend")}
                </button>
              </div>
              <ul className="space-y-2 text-sm">
                {world?.ledger.map((row) => (
                  <li key={row.id ?? row.reason} className="flex flex-wrap items-center gap-2">
                    <span>{row.reason}: {row.amount} → {row.balanceAfter}</span>
                    {row.reason === "staging-spend" && row.id ? (
                      <button className="tab" type="button" disabled={busy} onClick={() => void run(() => refundZetos({ data: { ledgerId: row.id as string, idempotencyKey: freshKey("refund") } }))}>
                        {label("refund")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {world?.role === "admin" ? (
                <button
                  className="btn w-full sm:w-auto"
                  type="button"
                  onClick={() => {
                    setAdmin("…");
                    void adminOverview()
                      .then((result) => setAdmin(JSON.stringify(result, null, 2)))
                      .catch((err: unknown) => setAdmin(err instanceof Error ? err.message : "Could not load the admin overview."));
                  }}
                >
                  🛡️ {label("adminOverview")}
                </button>
              ) : null}
              {admin ? <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-xs">{admin}</pre> : null}
              <VoiceDeck />
            </div>
          ) : null}
        </section>
      ) : null}

      <div
        className={`wwc-toast ${country ? "with-nav" : ""}`}
        role={error ? "alert" : "status"}
        aria-live="polite"
      >
        {busy ? <div className="wwc-toast-card">⏳ {label("working")}</div> : null}
        {!busy && error ? (
          <div className="wwc-toast-card error">
            <span className="flex-1">⚠️ {error}</span>
            <button type="button" className="wwc-toast-close" onClick={() => setError("")} aria-label={label("dismiss")}>×</button>
          </div>
        ) : null}
        {!busy && !error && notice ? (
          <div className="wwc-toast-card ok">
            <span className="flex-1">{notice}</span>
            <button type="button" className="wwc-toast-close" onClick={() => setNotice("")} aria-label={label("dismiss")}>×</button>
          </div>
        ) : null}
      </div>

      {country ? (
        <nav className="mobile-bottom" aria-label="Sections">
          {navItems.map((item, index) => (
            <button
              key={index}
              type="button"
              className={tab === index ? "navbtn on" : "navbtn"}
              aria-current={tab === index ? "page" : undefined}
              aria-label={labels[index]}
              onClick={() => switchTab(index)}
            >
              <span className="text-lg leading-none" aria-hidden>{item.icon}</span>
              <span className="navtext">{lang === "en" ? item.text : labels[index]}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {showGuide ? (
        <div className="wwc-modal" role="dialog" aria-modal="true" aria-label={label("help")} onClick={() => setShowGuide(false)}>
          <div className="panel wwc-modal-card space-y-3 p-5" onClick={(event) => event.stopPropagation()}>
            <h2 className="font-display text-2xl">{label("help")}</h2>
            <p className="text-sm text-[#cbd5e3]">{label("welcomeGoal")}</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>{label("step1")}</li>
              <li>{label("step2")}</li>
              <li>{label("step3")}</li>
            </ol>
            <h3 className="font-display text-xl">{label("nextTitle")}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>{label("next1")}</li>
              <li>{label("next2")}</li>
              <li>{label("next3")}</li>
            </ul>
            <p className="text-sm text-[#9fb0c6]">{label("mapHint")}</p>
            <button className="btn w-full" type="button" onClick={() => setShowGuide(false)}>
              {label("gotIt")}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Step({ n, done, text, children }: { n: number; done: boolean; text: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? "bg-emerald-500 text-[#06231a]" : "bg-[#f5c85b] text-[#17233a]"}`}
        aria-hidden
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{text}</p>
        {children}
      </div>
    </li>
  );
}

function Intro({ text }: { text: string }) {
  return <p className="rounded-lg bg-black/20 p-3 text-sm text-[#dbe4f0]">ℹ️ {text}</p>;
}

function VoiceDeck() {
  const [mic, setMic] = useState("not checked");
  const [speaker, setSpeaker] = useState<"muted" | "on">("muted");

  async function checkMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMic("unavailable");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMic("allowed");
    } catch {
      setMic("blocked");
    }
  }

  return (
    <div className="space-y-2 border-t border-[#284767] pt-3">
      <p className="text-sm text-[#cbbfa6]">
        Microphone and speaker stay local. Checking the microphone never sends an order.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="tab" type="button" onClick={() => void checkMic()}>
          🎙️ Check microphone
        </button>
        <button className="tab" type="button" onClick={() => setSpeaker((current) => (current === "muted" ? "on" : "muted"))}>
          {speaker === "muted" ? "🔇" : "🔊"} Speaker {speaker}
        </button>
      </div>
      <p className="text-sm">Microphone {mic}. No audio is stored.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <p className="flex items-baseline justify-between gap-3 border-b border-[#284767] py-2">
      <span className="text-sm text-[#cbbfa6]">{label}</span>
      <span className="font-display text-xl sm:text-2xl">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</span>
    </p>
  );
}

function NoticeList({ title, rows, lang }: { title: string; rows: { id: string; body: string; day: number }[]; lang: Lang }) {
  if (!rows.length) return null;
  return (
    <div className="panel space-y-1 p-3 text-sm">
      <h3 className="font-display text-xl">{title}</h3>
      {rows.map((row) => (
        <p key={row.id}>{t(lang, "day")} {row.day}: {row.body}</p>
      ))}
    </div>
  );
}

const ZOOM_STEPS = [0.8, 1, 1.2, 1.4, 1.6, 1.8];

function Zoom({ zoom, setZoom, lang }: { zoom: number; setZoom: (zoom: number) => void; lang: Lang }) {
  const index = ZOOM_STEPS.findIndex((value) => value >= zoom - 0.001);
  const current = index === -1 ? ZOOM_STEPS.length - 1 : index;
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="tab w-12 text-xl" aria-label={t(lang, "zoomOut")} disabled={zoom <= ZOOM_STEPS[0]} onClick={() => setZoom(ZOOM_STEPS[Math.max(0, current - 1)])}>
        −
      </button>
      <span className="min-w-14 text-center text-sm text-[#cbd5e3]">{Math.round(zoom * 100)}%</span>
      <button type="button" className="tab w-12 text-xl" aria-label={t(lang, "zoomIn")} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoom >= ZOOM_STEPS[current] - 0.001 ? current + 1 : current)])}>
        +
      </button>
    </div>
  );
}

function clampZoom(value: number) {
  return Math.min(1.8, Math.max(0.8, Math.round(value * 100) / 100));
}

function MapBoard({
  tiles,
  selected,
  target,
  zoom,
  setZoom,
  onTile,
  onPress,
  ownId,
  allies,
  lang,
}: {
  tiles: Tile[];
  selected: string[];
  target: string;
  zoom: number;
  setZoom: (zoom: number) => void;
  onTile: (tile: Tile) => void;
  onPress: (tile: Tile) => void;
  ownId: string | null;
  allies: Set<string>;
  lang: Lang;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Mouse wheel zoom (desktop only).
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      setZoom(clampZoom(zoomRef.current + (event.deltaY < 0 ? 0.1 : -0.1)));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  // Two-finger pinch zoom on touch screens. One finger scrolls natively
  // (touch-action: pan-x pan-y) so the page and the map never trap a swipe.
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    let start: { distance: number; zoom: number } | null = null;
    const distance = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 2) start = { distance: distance(event), zoom: zoomRef.current };
    };
    const onMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !start) return;
      event.preventDefault();
      setZoom(clampZoom(start.zoom * (distance(event) / start.distance)));
    };
    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) start = null;
    };
    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    };
  }, [setZoom]);

  // Click-and-drag panning for mouse users only; touch uses native scrolling.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    moved.current = false;
    if (event.pointerType !== "mouse") return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: scroller.current?.scrollLeft ?? 0,
      top: scroller.current?.scrollTop ?? 0,
      moved: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const node = scroller.current;
    if (event.pointerType !== "mouse" || !current || !node) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) > 6) current.moved = true;
    if (current.moved) {
      node.scrollLeft = current.left - dx;
      node.scrollTop = current.top - dy;
    }
  }

  function onPointerUp() {
    if (drag.current?.moved) moved.current = true;
    drag.current = null;
  }

  const tileSize = Math.round(40 * zoom);

  return (
    <div className="panel min-w-0 p-3">
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#cbbfa6]">
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#16343f" }} /> {t(lang, "legendOcean")}</span>
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#c6b07a" }} /> {t(lang, "legendOpen")}</span>
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#8f3d3a" }} /> {t(lang, "legendMine")}</span>
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#3e6b58" }} /> {t(lang, "legendAlly")}</span>
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#6e5340" }} /> {t(lang, "legendEnemy")}</span>
        <span>★ capital</span>
      </div>
      <div
        ref={scroller}
        className="wwc-map max-h-[55vh] overflow-auto rounded-lg"
        data-zoom={zoom}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          data-map-grid
          className="grid gap-px"
          style={{ width: `${tileSize * 14 + 13}px`, gridTemplateColumns: `repeat(14, ${tileSize}px)` }}
        >
          {tiles.map((tile) => {
            const mine = ownId && tile.ownerId === ownId;
            const ally = Boolean(tile.ownerId && allies.has(tile.ownerId));
            const pickIndex = selected.indexOf(tile.id);
            const chosen = pickIndex !== -1 || target === tile.id;
            const isCapital = tile.capital || pickIndex === 0;
            return (
              <button
                key={tile.id}
                type="button"
                title={`${tile.id} ${tile.terrain}${tile.ownerName ? ` · ${tile.ownerName}` : ""}`}
                aria-label={`${tile.id} ${tile.terrain}${tile.ownerName ? ` · ${tile.ownerName}` : ""}`}
                aria-pressed={chosen}
                className="wwc-tile"
                style={{
                  width: `${tileSize}px`,
                  height: `${tileSize}px`,
                  background: mine ? "#8f3d3a" : ally ? "#3e6b58" : tile.ownerId ? "#6e5340" : COLORS[tile.terrain] || "#333",
                  outline: chosen ? "3px solid #ffffff" : tile.capital ? "2px solid #f5c85b" : "none",
                  outlineOffset: chosen ? "-3px" : "-2px",
                }}
                onClick={() => {
                  if (moved.current) {
                    moved.current = false;
                    return;
                  }
                  onTile(tile);
                }}
                onPointerDown={() => onPress(tile)}
                onContextMenu={(event) => event.preventDefault()}
              >
                {isCapital && (pickIndex === 0 || tile.capital) ? "★" : pickIndex > 0 ? "✓" : ""}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
