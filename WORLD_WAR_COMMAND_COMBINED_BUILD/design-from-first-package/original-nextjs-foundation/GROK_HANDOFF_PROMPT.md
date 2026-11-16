# GROK HANDOFF — WORLD WAR COMMAND NEW BUILD

You are receiving a new source-code project for WORLD WAR COMMAND. This is a clean new build, not a patch to the old site.

## Absolute instruction
Do not discard or rewrite the supplied source casually. Inspect every file, preserve the architecture and working features, and make additive corrections. Do not claim the full strategy simulation is complete just because the interface pages exist.

## First tasks
1. Inspect the complete repository and report its structure.
2. Install dependencies and run Prisma generation, schema validation and production build.
3. Fix all compile, type, schema and runtime errors you find.
4. Configure a real PostgreSQL database and production SMTP provider using environment variables. Never hardcode secrets or print them.
5. Run the Prisma schema against the intended database and seed the territory grid once.
6. Test registration, email OTP delivery, incorrect code, expired code, resend cooldown, verification, login, session, logout and country creation end-to-end.
7. Test territory selection on physical iPhone and Android if available. Test taps near cell edges, zoom, selection, deselection, adjacency validation, max-six limit and capital selection.
8. Test every page at 360, 390, 412, 768, 1024, 1366 and 1920 CSS pixels.
9. Fix accessibility, keyboard focus, loading states, errors, duplicate submission and mobile safe-area issues.
10. Deploy to the agreed Vercel project only after a successful build and tests. Do not overwrite another production project without confirmation.

## Product implementation still required
The current project provides a real app foundation and DB-backed account/country/territory/priority/action flows. The following are not yet full simulation engines and must be implemented in future additive phases:
- Complete economic simulation, budgets, resource production/consumption and balancing.
- Research tree and Infinite Imagination Lab invention lifecycle.
- Military units, logistics, intelligence, conflict and battle-resolution engine.
- Diplomacy, trade, treaties, proposals and acceptance workflows.
- Persistent real-time multiplayer, matchmaking, friend invites, spectators and replays.
- Human Cost and NSI formulas, reports and Judge's Explanation.
- Voice command recognition, transcript review, safe command execution and text-to-speech.
- Real geographic world map and validated territorial geometry. The included 14x14 grid is a deterministic starter map, not a real geopolitical map.
- Admin/moderation/support tools, account recovery, account deletion, privacy and terms.

Implement these in a documented order using the original full product specification. Preserve the Beginner/Advanced principle: Beginner Mode simplifies presentation, never removes advanced capabilities or changes game rules.

## Deployment acceptance
- A real email must arrive with a six-digit code.
- Resend must work with cooldown and expiry.
- Passwords and session tokens must never be stored in plaintext.
- Country creation must persist to PostgreSQL.
- Disconnected or unavailable territories must be rejected server-side.
- First selected territory must become capital.
- Every success message must correspond to a confirmed backend operation.
- No fake player counts, fake online status, fake matches or fake simulation results.
- Provide a deployment report, environment-variable names (not values), build logs, database migration/seed status, test evidence, unresolved items and rollback instructions.

Do not state that a feature is complete or tested unless you have actually implemented and verified it.
