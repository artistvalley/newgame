# WORLD WAR COMMAND
## Master Vision, Story, Product Specification, Design Standard and Safe Rebuild Plan
**Version:** 1.0 — 6 November 2026  
**Status:** Consolidated planning baseline; not a claim of completed implementation or deployment.

> **Scope and evidence:** This document consolidates the user's recoverable earlier project discussions, project handoff notes, UI references, the current conversation and the uploaded `world-war-command-source.zip`. It is NOT a verified verbatim replay of every historic prompt. Distinctions: **CONFIRMED** = clearly expressed/approved; **PROPOSED** = implementation design to review; **UNRESOLVED** = needs a decision or source verification. No invented production readiness.

## 1. The Story — A World You Create, A World You Must Protect

Imagine entering WORLD WAR COMMAND as the founder of a new nation. You choose a name, government, population and connected territory. Your first chosen region becomes the capital. The land contains resources, people have needs, and your government has limited money. You can build farms, schools, hospitals, factories, transport and research centres, or divert resources into defence.

Beyond your borders are human players and AI-led countries. You may trade, form alliances, negotiate treaties, spy, compete, or fight. Every decision changes a persistent shared world. A war is not simply a scoreboard: civilians may die, soldiers may be injured, people may be displaced, buildings may be destroyed, and the population may protest. Your country may survive a battle but lose its economy, stability or legitimacy. Peace, surrender, reconstruction and rehabilitation are real strategic choices.

You can enter a private war with a friend, challenge an AI country or participate in the International Arena where spectators follow events and tournaments unfold. You may propose imaginative new inventions in the Infinite Imagination Lab, but the game evaluates feasibility, research costs and consequences. Commands can be issued by text or voice, with confirmation before important actions.

Players can buy **ZETOS**, the game's virtual credits, from the operator to support their nations and access defined in-game opportunities. A player facing defeat might buy more ZETOS, but **money cannot buy the AI judge's verdict or guarantee victory**. Military outcomes are calculated from consistent server-side rules, and the AI explains them transparently. The winner must still contend with human suffering and the cost of recovery.

The ultimate goal is not merely conquest. It is to create, lead and sustain a civilization under pressure — and learn what power, economics, invention and war do to human lives.

## 2. Foundational Principles (CONFIRMED)

1. A persistent multiplayer civilization and conventional-war simulation, not a static mockup.
2. Human players may create countries and interact with AI-controlled nations.
3. Modes: solo versus AI, private friend multiplayer, International Arena/public multiplayer, training, and watch/spectator mode.
4. Hybrid weekly strategic planning and real-time battle simulation; one real hour equals one game day for the approved economy simulation. Exact reconciliation of weekly planning with hourly economy ticks is **UNRESOLVED**.
5. Combined 2D strategic command map and 3D battlefield, with mobile-first design.
6. Player-selectable initial country population between 1 million and 100 million was an earlier concept. The later Phase 1 economy fixture uses 100,000 and an internal population bound of 1,000–5 million. **These conflict and require an explicit product/rules decision before production.**
7. Up to six connected initial territory regions; first selected is capital; reject unavailable or disconnected selections. Current live map has been described as 14×14; validate against actual production code.
8. Civilian and military deaths, disability, amputations, rehabilitation, displacement, infrastructure damage and recovery must be modelled and reported.
9. An independent AI judge explains results; the authoritative battle and economy outcomes come from deterministic, auditable server-side mechanics. ZETOS never biases judging.
10. Nuclear, chemical and biological weapons are prohibited.
11. Languages: English, Tamil and Hindi; text commands, voice input, transcript review, read-aloud.
12. Beginner and Advanced experiences; accessible, understandable interface.
13. Preserve existing user accounts and live game data during migration; never silently replace a production database.

## 3. Complete Gameplay Modules

### 3.1 Onboarding and Accounts
Registration, verification, secure login, account recovery, optional supported social login, player profile, tutorials, accessible settings, privacy controls and clear game mode selection. Distinguish actually implemented features from placeholders.

### 3.2 Country Founding and Government
Country name, flag, government type, population, initial territory, capital, connected-land validation, national priorities and governance decisions. Country state persists across sessions. History and decision log are visible.

### 3.3 World and Territory
Persistent world map; resources, terrain, country borders, capitals, available/claimed/ocean cells; territory acquisition, disputes, ownership history, diplomacy and world events. A shared-world architecture prevents double claims.

### 3.4 Economy and Civilian Life
Treasury, taxes, budget allocation, reserves, food, water, wood, ore, stone, energy and goods. Industry, agriculture, infrastructure, education, healthcare, tourism, environment, research, trade, jobs, public stability and logistics. Scarcity and human needs constrain military power.

**Previously approved Phase 1 initial budget:** Agriculture 40%, Industry 20%, Infrastructure 25%, Reserves 15%, for new and existing countries. Preserve existing treasury, population and stability; initialise missing stock/reserve without applying an automatic tick.

**Previously approved clock:** one real hour = one game day; catch up missed days sequentially; idempotent ledger and country locks; do not advance the world clock until processing completes.

**Previously approved tax ceiling:** 25%; fixture tax 10%. Budget percentages modify production; they are not direct treasury expenditure. Integer/floor arithmetic and bounded nonnegative state.

**Important test correction:** Without RESEARCH selected, the known fixture produces **7,000 goods/day**, not 7,700. Five-day expected end stocks: Food 172,999; Water 86,500; Wood 40,000; Stone 30,000; Ore 25,000; Energy 145,000; Goods 35,000. Day 5 expected treasury 1,007,313; reserve 9,411; population 101,002; stability 75. These are test-fixture expectations, not live game values.

### 3.5 Infinite Imagination Lab
Players describe fictional technologies, inventions, vehicles, equipment and civilian breakthroughs. The game evaluates research feasibility, prerequisites, cost, manufacturing time, materials, reliability and countermeasures. No arbitrary 'instant win' inventions. The prohibited weapon classes remain excluded.

### 3.6 Military, Defence and Conventional Warfare
Forces, recruitment, readiness, training, supply lines, terrain, intelligence, tactics, industrial production, movement, attack/defence, morale, losses and ceasefire options. Combat simulation is server-authoritative. Do not equate player spending with guaranteed victory.

### 3.7 Diplomacy and International Relations
Trade, treaties, alliances, negotiations, sanctions, espionage, conflict resolution, surrender, ceasefires, reconstruction agreements and international pressure. AI countries react consistently to player actions.

### 3.8 International Arena and Multiplayer
Invitations, private matches, public Arena, matchmaking, spectators, tournament rules, session state, replays, rankings, moderation and fair-play protections. Training and watch modes must not mutate competitive game state.

### 3.9 Human Cost, NSI and AI Judge
Report civilian deaths, military deaths, disability, amputations, displaced people, damaged hospitals/schools/roads, rehabilitation and recovery costs. **NSI** is a previously referenced score/indicator; its exact definition and formula must be recovered before coding. Explain verdicts in understandable language and show the underlying recorded inputs. Never allow the language model alone to determine irreversible battle outcomes.

### 3.10 News, Disasters and World Events
In-world news, public opinion, protests, migration, disasters, economic shocks, humanitarian crises and spectator reporting. Any references to real-world leaders or 'Trump' are **UNRESOLVED**; do not invent the user's intended mechanic or portray actual people as participating without an explicit design decision.

### 3.11 Commands, Languages and Accessibility
Text command composer, optional microphone, transcript preview, command confirmation, read-aloud, translated UI (English/Tamil/Hindi), keyboard/touch navigation and safe error recovery. Distinguish suggestions from executed commands.

## 4. ZETOS — Virtual Currency and Business Model

**CONFIRMED:** ZETOS is an in-game currency sold by the operator to players; users can purchase it to support their nations, including when struggling in war. The operator requires a finance/admin module. ZETOS must never change the impartial judge's decision.

**PROPOSED:** Credit bundles, purchase checkout, secure wallet ledger, purchase receipts, clear conversion rates, transaction reconciliation, refunds, chargebacks, fraud prevention, admin finance reporting and transparent game balance rules.

**UNRESOLVED:** Exact ZETOS per rupee, bundle prices, earn/spend rules, transferability, whether ZETOS can be redeemed or withdrawn, applicable taxes, refund policy, spending limits and whether purchases influence competitive ranking. Prior examples of ₹100/₹500/₹1,000 are examples, not final approved pricing.

**Fairness guardrails:** Purchases may enable defined in-game options but cannot retroactively rewrite outcomes, secretly alter probability, buy judge preference or bypass the human-cost model. Clearly disclose advantages to players. No cash-out or player-to-player real-money exchange unless separately legally and technically reviewed. Payment processing must be integrated only after payment provider approval and appropriate compliance review.

## 5. Super Admin Control Centre — Functional Specification

Separate secure administrative app with proper role-based permissions and server-side checks. **Desktop:** collapsible left sidebar, summary dashboard, searchable paginated tables, filters and detail views. **Mobile:** compact drawer/bottom navigation, one task per screen, responsive cards, large touch targets and no giant scrolling form.

Dedicated modules:
- Overview and actionable alerts: active players, countries, wars, shortages, economy, clock, errors and backups.
- Players and roles: search, profile, suspend/restore, permissions, audit trail.
- Countries and world: capitals, territories, ownership, maps, country detail.
- Economy: treasury, taxes, stocks, budget, tick ledger, anomalies.
- **ZETOS Finance:** bundles, wallet balances, payment status, purchases, refunds, reconciliations, disputes and audit logs.
- Military, diplomacy, research and Arena moderation.
- Reports, Human Cost, NSI, Judge explanations and history.
- Content, translations, announcements, support and moderation.
- System health: Cloudflare Worker, database, storage, API configuration, error logs, scheduled jobs.
- Backup and Restore: manual encrypted backup, schedule, integrity checks, retention, restore rehearsal, protected access; destructive restore requires separate explicit approval.
- Admin security: multi-factor authentication where supported, roles, least privilege, action confirmation, session control, immutable action history.

Every dashboard number must come from real records, with clear empty/loading/error states. Dangerous actions must not appear beside routine Save controls. Do not expose passwords, tokens or secrets in the UI.

## 6. Design Direction — Premium, Beautiful and Practical

**Visual identity:** sophisticated midnight navy / charcoal, restrained gold accents, teal for information, red only for genuine danger, crisp typography, subtle atmospheric world imagery, professional cartography and clear hierarchy. Avoid a cluttered neon dashboard or generic admin template.

**Player desktop:** immersive world overview with navigable 2D map, contextual right-side information, persistent navigation, a clear command composer and quick access to Nation, Research, Military, Diplomacy and Arena. 3D battlefield is a separate focused experience, not an obstacle to ordinary administration.

**Player mobile:** true app-like responsive layout, bottom navigation Home / World / Nation / Command / More, clear country status, thumb-friendly actions, collapsible details, low-bandwidth behaviour and accessible text. Beginner mode reveals guided decisions; Advanced mode exposes detailed data and controls.

**Admin desktop:** practical operations-first interface, not decorative cards only. **Admin mobile:** task-focused screens for checking status, searching users, handling alerts and approving safe actions. Large reports can use responsive drill-down.

**Design acceptance:** No overflow at common mobile widths; real data; no fake buttons; no placeholder features disguised as working; consistent empty/error/loading states; legible contrast; keyboard access; visible confirmation of successful backend actions.

## 7. Installable PWA

One shared web application and player database. Web app manifest, app name/icons, maskable icon, theme, standalone display, service worker, offline fallback, safe static asset caching, secure login/session, version updates and installation guidance for Android and iPhone/iPad. Push notifications only on supported devices with permission. Do not claim offline multiplayer or battle simulation works offline. Test actual installability.

## 8. Proposed Technical Architecture — Cloudflare-Compatible

**Known production context from earlier reports, not freshly verified:** `wargame.zetoask.com`, Cloudflare Worker `wargame-zetoask`, PlanetScale PostgreSQL database `wargame`, Hyperdrive binding `HYPERDRIVE`. Verify actual bindings, schema and deployment before using these names.

**Proposed implementation:** TypeScript-based Cloudflare-compatible application/API; shared validated domain logic for economy, combat and world state; PostgreSQL transactional source of truth; queue/cron processing for hourly ticks; append-only economy/ZETOS/combat/admin ledgers; role-based authorisation; object storage in Cloudflare R2 where needed; reliable event and audit logging; automated tests and migrations. Do not assume an uploaded Next.js/Prisma project is drop-in compatible with the existing Cloudflare Worker.

Keep payment credentials, database passwords and Cloudflare/R2 tokens in secure secrets management, not in code or downloadable archives. Previously shared credentials must be rotated.

## 9. Existing Project and Backup Reality

The uploaded `world-war-command-source.zip` is a small Next.js/Prisma source package, apparently distinct from the previously reported 494-file Cloudflare recovery archive. The prior Grok report said source backup PARTIAL, live database rows MISSING, schema only, no private upload store verified, no clean restoration test. These are reported facts, not independently verified live infrastructure status.

**Never overwrite the existing production Worker or database based solely on this ZIP.** Before replacement: inventory live Worker and bindings; export and verify live PostgreSQL rows; preserve secrets separately; capture full source and assets; test restore in an isolated environment; test compatibility; create a rollback point. A fresh implementation must be deployed to staging first. A production cutover must preserve/migrate accounts, country/world state and financial records, with explicit approval and a rollback plan.

## 10. Development and Approval Plan

**Phase 0 — Recovery and traceability:** inventory every recoverable prompt, handoff, UI design and code version; make feature traceability matrix (user idea → screen → backend → database → tests). List unresolved contradictions. Protect live data.

**Phase 1 — Design system and prototypes:** produce polished mobile and desktop player screens plus mobile and desktop admin screens; review user flows before full implementation.

**Phase 2 — Core platform:** authentication, country creation, territory selection, world state, persistence and audit logging.

**Phase 3 — Civilization economy:** implement approved deterministic formulas and tick catch-up, regression fixtures and real economy UI.

**Phase 4 — ZETOS:** design transparent virtual-credit economics, wallet ledger, purchase flow, admin finance, tests and payment integration only after approval.

**Phase 5 — Research, industry and Infinite Imagination Lab.**

**Phase 6 — Military, logistics, diplomacy, AI countries and war simulation.**

**Phase 7 — Human Cost, NSI, independent Judge and reports.**

**Phase 8 — Multiplayer, International Arena, tournaments, spectators and replays.**

**Phase 9 — Voice, multilingual accessibility, PWA and mobile optimisation.**

**Phase 10 — Super Admin completeness, security, backup/restore and system observability.**

**Phase 11 — End-to-end QA, staging restore and migration rehearsal, explicit production cutover approval, launch and rollback validation.**

The phase order is a proposed **new-build plan**, not permission to override the previously approved Grok phase tracker. Preserve the prior tracker for historical evidence and map it to this document; do not pretend work has been completed.

## 11. Definition of Done

A feature is COMPLETE only when its actual screen, backend logic, database persistence, security checks, failure states and tests work together. A placeholder or note-saving page is PARTIAL, not complete. A successful build is not a successful production deployment. A backup is COMPLETE only after the required data is captured and a clean restore is demonstrated.

Before any launch: verify account security, country/territory integrity, economy determinism, ZETOS ledger correctness, combat fairness, human-cost calculations, multiplayer isolation, admin authorisation, real-device PWA installation, accessibility, backups, disaster recovery, observability and rollback.

## 12. Questions and Conflicts Not to Guess

1. **Trump reference:** The exact original idea was not recoverable; request original wording before implementing a real-world leader feature.
2. **Population scale:** Earlier 1–100 million country creation conflicts with later 1,000–5 million engine bounds and 100,000 test fixture.
3. **ZETOS:** Exact purchase pricing, credit conversion, spending rules and competitive fairness remain undecided.
4. **NSI:** Exact formula and meaning must be recovered.
5. **Time model:** Weekly planning versus one-hour/one-day economy tick needs explicit coordination rules.
6. **World map:** Existing 14×14 grid versus eventual real geographic map and 3D battles requires staged compatibility design.
7. **Payment provider:** No approved live provider is established in this specification.
8. **Production migration:** Existing live database content and schema have not been verified; never substitute an empty database.

## 13. Permanent Preservation and Change-Control Rule

Every change must link back to an original requirement and acceptance test. Maintain one permanent tracker, with statuses NOT STARTED / PARTIAL / TESTED / BLOCKED / DEPLOYED. Never silently drop features during redesign. Back up before modifying, test in isolation, document changes and obtain explicit approval before destructive operations, production migrations or production deployment. **User authorisation to plan a rebuild does not justify losing existing player data.**
