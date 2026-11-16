# WORLD WAR COMMAND — Combined developer build

## What has actually been combined

- **Main runnable code:** Milestone 2F TanStack Start / React application, its server functions, PostgreSQL migrations, and tests, from `wwc-pack.zip`.
- **Visual direction:** First ZIP's navy/blue/gold palette and typography have been applied to the 2F application stylesheet. The original first-package Next.js design and visual references are preserved in `design-from-first-package/` for further faithful screen-by-screen work.
- **Product specification:** `MASTER_SPECIFICATION.md` from the first ZIP, including proposed and unresolved requirements.
- **Existing production DB:** Only its manifest is included for reference. The account-containing JSON export and functions are intentionally NOT packaged for deployment. No old production database has been changed.

## Critical limitations — not a 100% finished game

This is a combined, editable development package, **not** a verified complete production game. The first ZIP is a foundation and visual prototype; the second is a different 2F game engine. They cannot be merged by copying SQL schemas. The second source has its own game and migrations; the old production source is not included. The first-package UI has been **themed**, not faithfully rebuilt screen by screen. No real hosting, mail service, live PostgreSQL credentials or production browser tests were available in this environment. The source contains Grok preview/auth integration and embedded PGLite fallback; audit these for your hosting provider.

## How to start

1. `cd app && npm ci`
2. Run `npm run typecheck && npm test && npm run build` and fix any failures.
3. Provision a **new empty** PostgreSQL database, distinct from PlanetScale `wargame/main` and `canon`.
4. Set `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and production authentication environment values securely. See `DEPLOYMENT_ENV.example`.
5. Review migration scripts and **run them only against the new empty database**. The existing build script also invokes `db:migrate`; inspect its target before running.
6. Connect and test real email verification/reset; do not claim it works without delivery evidence.
7. Deploy the app to a temporary URL, test real multiplayer, persistence, browser/mobile, restart and database restore.
8. Switch your chosen public domain only after acceptance testing and a verified rollback.

**Never point this package's migration script at the existing production `wargame/main` database.**
