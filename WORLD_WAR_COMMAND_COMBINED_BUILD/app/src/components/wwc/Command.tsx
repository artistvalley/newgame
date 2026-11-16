import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
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

  async function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      if (!result.ok) setError(translateError(lang, result.error || "The server refused that order."));
      else setNotice("Recorded.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The order failed.");
    } finally {
      setBusy(false);
    }
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
      setNotice("That region is now the capital.");
    }, 500);
    const clear = () => window.clearTimeout(timer);
    window.addEventListener("pointerup", clear, { once: true });
    window.addEventListener("pointercancel", clear, { once: true });
  }

  if (!world && !error) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <p className="kicker">{label("reading")}</p>
      </main>
    );
  }

  return (
    <main className="pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
        <div>
          <p className="kicker">{label("day")} {world?.day ?? "—"} · {label("staging")} · {link === "linked" ? label("linked") : label("reconnecting")}</p>
          <h1 className="font-display text-4xl leading-none">{country?.name ?? label("unfounded")}</h1>
          <p className="text-sm text-[#cbbfa6]">{label("profile")}: {world?.role ?? "player"}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="field w-auto" value={lang} onChange={(event) => {
            const next = event.target.value;
            if (next === "en" || next === "ta" || next === "hi") setLang(next);
          }} aria-label={label("language")}>
            <option value="en">English</option>
            <option value="ta">தமிழ்</option>
            <option value="hi">हिन्दी</option>
          </select>
          <UserButton />
        </div>
      </header>
      {error ? <p className="mx-4 mt-3 text-sm text-[#e7b2a8]">{error}</p> : null}
      {notice ? <p className="mx-4 mt-3 text-sm text-[#d4b483]">{notice}</p> : null}

      {world && !country ? (
        <section className="grid gap-4 px-4 pt-4 lg:grid-cols-[1.4fr_0.8fr]">
          <MapBoard tiles={tiles} selected={selected} target={target} zoom={zoom} setZoom={setZoom} onTile={onTile} onPress={onPress} ownId={null} allies={new Set()} lang={lang} />
          <form
            className="panel space-y-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() =>
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
              );
            }}
          >
            <h2 className="font-display text-3xl">{label("foundTitle")}</h2>
            <p className="text-sm text-[#cbbfa6]">{label("foundHelp")}</p>
            <p className="text-sm text-[#cbbfa6]">{label("watch")}</p>
            <label className="block text-sm">
              {label("name")}
              <input className="field" value={name} minLength={3} maxLength={32} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="block text-sm">
              {label("government")}
              <select className="field" value={government} onChange={(event) => setGovernment(event.target.value)}>
                <option value="democracy">Democracy</option>
                <option value="federation">Federation</option>
                <option value="monarchy">Monarchy</option>
                <option value="republic">Republic</option>
              </select>
            </label>
            <p className="text-sm">{selected.length} regions selected{selected[0] ? ` · capital ${selected[0]}` : ""}</p>
            <button className="tab" type="button" onClick={suggestRealm}>
              {label("suggest")}
            </button>
            <Zoom zoom={zoom} setZoom={setZoom} />
            <button className="btn" disabled={busy || selected.length < 1} type="submit">
              {label("found")}
            </button>
          </form>
        </section>
      ) : null}

      {country ? (
        <section className="px-4 pt-4">
          {tab === 0 ? (
            <div className="space-y-3">
              <MapBoard tiles={tiles} selected={[]} target={target} zoom={zoom} setZoom={setZoom} onTile={onTile} onPress={onPress} ownId={country.id} allies={allies} lang={lang} />
              <Zoom zoom={zoom} setZoom={setZoom} />
              <p className="text-sm text-[#cbbfa6]">{label("drag")}</p>
              <p className="text-sm text-[#cbbfa6]">{label("selected")} {target || label("none")}</p>
              {detail ? (
                <p className="text-sm">{label("detail")} {detail.id} · {detail.terrain} · {detail.resources || label("none")} · {detail.ownerName || detail.status}</p>
              ) : null}
              <button className="tab" type="button" onClick={pickNeighbor}>
                {label("aim")}
              </button>
              <NoticeList title={label("notices")} rows={world?.notices ?? []} />
              <NoticeList title={label("feed")} rows={(world?.feed ?? []).map((row) => ({ id: row.id, body: `${row.attacker ?? ""} ${row.posture} ${row.target}: ${row.outcome}`, day: row.day }))} />
            </div>
          ) : null}
          {tab === 1 ? (
            <div className="panel space-y-3 p-4">
              <Stat label={label("treasury")} value={country.treasury} />
              <Stat label={label("population")} value={country.population} />
              <Stat label={label("stocks")} value={`${country.food} / ${country.water} / ${country.goods}`} />
              <Stat label={label("rates")} value={`${country.stability} / ${country.economy} / ${country.technology}`} />
              <p className="text-sm text-[#cbbfa6]">{label("budget")}</p>
              {country.stability < 66 ? <p className="text-sm text-[#e7b2a8]">{label("shortage")}</p> : null}
              <button className="btn" disabled={busy} type="button" onClick={() => void run(() => setBudget({ data: { tax: 1000, agri: 4000, industry: 2000, infra: 2500, reserves: 1500, idempotencyKey: freshKey("budget") } }))}>
                {label("confirmBudget")}
              </button>
              <button className="tab" disabled={busy} type="button" onClick={() => void run(() => advanceTick({ data: { idempotencyKey: freshKey("tick") } }))}>
                {label("advance")}
              </button>
              <h3 className="font-display text-2xl">{label("books")}</h3>
              <ul className="text-sm">
                {(world?.books ?? []).map((row, index) => (
                  <li key={`${row.reason}-${index}`}>{label("day")} {row.day}: {row.reason} {row.amount} → {row.balanceAfter}</li>
                ))}
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
              <p className="text-sm text-[#cbbfa6]">{label("researchHelp")}</p>
              <p className="text-sm text-[#cbbfa6]">{world?.researchBonusesEnabled ? label("bonusOn") : label("bonusOff")}</p>
              <textarea className="field min-h-28" value={research} onChange={(event) => setResearch(event.target.value)} />
              <button className="btn" disabled={busy} type="submit">{label("startResearch")}</button>
              <ul className="space-y-1 text-sm">
                {world?.projects.map((project) => (
                  <li key={project.id}>{project.status}: {project.title} · {project.category ?? "general"} · {project.daysLeft} days · {project.cost}</li>
                ))}
              </ul>
            </form>
          ) : null}
          {tab === 3 ? (
            <div className="panel space-y-3 p-4">
              <p className="text-sm">{label("units")} {world?.units ?? 0}. {label("equipment")} {country.equipment ?? 0}. {label("readiness")} {country.readiness ?? 0}. {label("costs")}</p>
              <button className="btn" disabled={busy} type="button" onClick={() => void run(() => recruitUnit({ data: { name: "Company", idempotencyKey: freshKey("recruit") } }))}>
                {label("recruit")}
              </button>
              <select className="field" value={posture} onChange={(event) => setPosture(event.target.value)}>
                <option value="probe">Probe</option>
                <option value="assault">Assault</option>
                <option value="defend">Defend</option>
              </select>
              <p className="text-sm">{label("selected")} {target || label("none")}</p>
              <button className="tab" type="button" onClick={pickNeighbor}>
                {label("aim")}
              </button>
              <div className="flex flex-wrap gap-2">
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
              <p className="text-sm text-[#cbbfa6]">{label("counterHelp")}</p>
              <h3 className="font-display text-2xl">{label("reports")}</h3>
              <ul className="space-y-1 text-sm">
                {world?.battles.map((battle) => (
                  <li key={battle.id}>{battle.posture} {battle.target}: {battle.outcome}. Soldiers killed {battle.militaryDeaths}. Civilians {battle.civilianDeaths}. Land changed: {battle.changed ? "yes" : "no"}.</li>
                ))}
                {world?.training.map((battle) => (
                  <li key={battle.id}>Training {battle.posture}: {battle.outcome}. Not applied. Soldiers in the report {battle.militaryDeaths}.</li>
                ))}
              </ul>
            </div>
          ) : null}
          {tab === 4 ? (
            <div className="panel space-y-3 p-4">
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
              <button className="btn" disabled={busy || !treatyTarget} type="button" onClick={() => void run(() => proposeTreaty({ data: { targetId: treatyTarget, kind: treatyKind, body: "Hold the border.", idempotencyKey: freshKey("treaty") } }))}>
                {label("propose")}
              </button>
              <ul className="space-y-2 text-sm">
                {world?.agreements.map((deal) => (
                  <li key={deal.id} className="flex flex-wrap items-center gap-2">
                    <span>{deal.kind} · {deal.proposer} → {deal.target} · {deal.status}</span>
                    {deal.status === "proposed" && deal.targetId === country.id ? (
                      <>
                        <button className="tab" type="button" disabled={busy} onClick={() => void run(() => answerTreaty({ data: { agreementId: deal.id, accept: true, idempotencyKey: freshKey("accept") } }))}>
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
              </ul>
              <ul className="text-sm text-[#cbbfa6]">
                {world?.messages.map((message) => (
                  <li key={message.id}>Day {message.day}: {message.from} — {message.body}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {tab === 5 ? (
            <div className="panel space-y-3 p-4">
              <p className="text-sm text-[#cbbfa6]">{label("humanHelp")}</p>
              <Stat label={label("killed")} value={country.militaryDeaths} />
              <Stat label={label("wounded")} value={country.wounded} />
              <Stat label={label("disabled")} value={country.disabled} />
              <Stat label={label("civilians")} value={country.civilianDeaths} />
              <Stat label={label("displaced")} value={country.displaced} />
              <Stat label={label("damage")} value={country.infraDamage} />
              <button className="btn" disabled={busy} type="button" onClick={() => void run(() => rehabilitate({ data: { idempotencyKey: freshKey("rehab") } }))}>
                {label("rehab")}
              </button>
              {country ? (
                <button className="tab" disabled={busy || !target} type="button" onClick={() => void run(() => moveCapital({ data: { target, idempotencyKey: freshKey("capital") } }))}>
                  {label("moveCapital")}
                </button>
              ) : null}
            </div>
          ) : null}
          {tab === 6 ? (
            <div className="panel space-y-3 p-4">
              <p className="text-sm">{label("wallet")} {world?.wallet ?? 0}. {label("walletHelp")}</p>
              <div className="flex flex-wrap gap-2">
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
                  className="tab"
                  type="button"
                  onClick={() => {
                    void adminOverview().then((result) => setAdmin(JSON.stringify(result)));
                  }}
                >
                  Admin overview
                </button>
              ) : (
                <p className="text-sm text-[#cbbfa6]">Admin tools stay hidden until a database role is granted. No email is checked in this page.</p>
              )}
              {admin ? <pre className="overflow-auto text-xs">{admin}</pre> : null}
              <VoiceDeck />
            </div>
          ) : null}
        </section>
      ) : null}

      <nav className="mobile-bottom" aria-label="Sections">
        {labels.map((label, index) => (
          <button key={label} type="button" className={tab === index ? "tab on" : "tab"} onClick={() => setTab(index)}>
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
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
    <div className="space-y-2 border-t border-[#3a3228] pt-3">
      <p className="text-sm text-[#cbbfa6]">
        Microphone and speaker stay local. Checking the microphone never sends an order.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="tab" type="button" onClick={() => void checkMic()}>
          Check microphone
        </button>
        <button className="tab" type="button" onClick={() => setSpeaker((current) => (current === "muted" ? "on" : "muted"))}>
          Speaker {speaker}
        </button>
      </div>
      <p className="text-sm">Microphone {mic}. No audio is stored.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <p className="flex items-baseline justify-between gap-3 border-b border-[#3a3228] py-2">
      <span className="text-sm text-[#cbbfa6]">{label}</span>
      <span className="font-display text-2xl">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</span>
    </p>
  );
}

function NoticeList({ title, rows }: { title: string; rows: { id: string; body: string; day: number }[] }) {
  if (!rows.length) return null;
  return (
    <div className="panel space-y-1 p-3 text-sm">
      <h3 className="font-display text-2xl">{title}</h3>
      {rows.map((row) => (
        <p key={row.id}>Day {row.day}: {row.body}</p>
      ))}
    </div>
  );
}

function Zoom({ zoom, setZoom }: { zoom: number; setZoom: (zoom: number) => void }) {
  return (
    <div className="flex gap-2">
      {[0.8, 1, 1.4, 1.8].map((value) => (
        <button key={value} type="button" className={zoom === value ? "tab on" : "tab"} onClick={() => setZoom(value)}>
          {value.toFixed(1)}
        </button>
      ))}
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
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom(clampZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1)));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [setZoom, zoom]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
      drag.current = null;
      return;
    }
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: scroller.current?.scrollLeft ?? 0,
      top: scroller.current?.scrollTop ?? 0,
      moved: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setZoom(clampZoom(pinch.current.zoom * (distance / pinch.current.distance)));
      return;
    }
    const current = drag.current;
    const node = scroller.current;
    if (!current || !node) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) > 6) current.moved = true;
    if (current.moved) {
      node.scrollLeft = current.left - dx;
      node.scrollTop = current.top - dy;
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.moved) moved.current = true;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
  }

  return (
    <div
      ref={scroller}
      className="panel max-h-[70vh] touch-none overflow-auto p-3"
      data-zoom={zoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-[#cbbfa6]">
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#16343f" }} /> {t(lang, "legendOcean")}</span>
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#c6b07a" }} /> {t(lang, "legendOpen")}</span>
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#8f3d3a" }} /> {t(lang, "legendMine")}</span>
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#3e6b58" }} /> {t(lang, "legendAlly")}</span>
        <span><i className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: "#6e5340" }} /> {t(lang, "legendEnemy")}</span>
      </div>
      <div
        className="grid origin-top-left gap-px"
        style={{ width: `${Math.round(14 * 44 * zoom)}px`, gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
      >
        {tiles.map((tile) => {
          const mine = ownId && tile.ownerId === ownId;
          const ally = Boolean(tile.ownerId && allies.has(tile.ownerId));
          const chosen = selected.includes(tile.id) || target === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              title={`${tile.id} ${tile.terrain}${tile.ownerName ? ` · ${tile.ownerName}` : ""}`}
              className="aspect-square min-h-11 border border-black/30"
              style={{
                background: mine ? "#8f3d3a" : ally ? "#3e6b58" : tile.ownerId ? "#6e5340" : COLORS[tile.terrain] || "#333",
                outline: chosen ? "2px solid #f3e6c8" : tile.capital ? "2px solid #d4b483" : "none",
              }}
              onClick={() => {
                if (moved.current) {
                  moved.current = false;
                  return;
                }
                onTile(tile);
              }}
              onPointerDown={() => onPress(tile)}
            />
          );
        })}
      </div>
    </div>
  );
}

