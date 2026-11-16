# WORLD WAR COMMAND

A new mobile-first strategy-game foundation built with Next.js, TypeScript, PostgreSQL and Prisma. It includes an interactive public landing page, email/password registration, six-digit email verification, resend-code flow, persistent sessions, country founding, a seeded selectable territory grid, connected-region validation, national priorities, action history and responsive game navigation.

## Important product status

This is a working first complete application foundation, not a claim that a production-scale persistent multiplayer simulation is finished. The game shell includes real database-backed account, country, territory, priority and action workflows. Economy, research, military, diplomacy and Arena currently save strategic activity records; their full simulation engines, live multiplayer/matchmaking, real geographical world map, battle engine, Human Cost/NSI rules engine, voice command execution, payment/notification infrastructure and moderation console still require dedicated implementation and testing. The interface labels these areas as planning/recording where appropriate rather than pretending to run a full simulation.

## Requirements
- Node.js 20.9+
- PostgreSQL 14+
- SMTP credentials for email verification

## Local setup
1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a PostgreSQL database.
3. Set `SESSION_SECRET` to a long random secret.
4. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`.
5. Install and prepare:

```bash
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel
1. Push this project to a private Git repository.
2. Create a PostgreSQL database (Neon, Supabase or another PostgreSQL host).
3. Import the repository into Vercel.
4. Add all environment variables from `.env.example` in Vercel Project Settings.
5. Set `APP_URL` to the production domain.
6. Run `npx prisma db push` against the production database before first use, then `npm run db:seed` once.
7. Deploy and test registration, code delivery, verification, login, country creation and logout on the live domain.

Do not use a development SMTP account for production without verifying sender/domain requirements. Do not commit `.env` or production secrets.

## Security notes
- Passwords are hashed with bcrypt.
- Verification codes are hashed in the database, expire after 10 minutes and have a five-attempt limit.
- Resend has a short cooldown.
- Session tokens are random, stored as hashes, held in HttpOnly cookies and expire after 30 days.
- Production cookies are Secure when `NODE_ENV=production`.
- Add production-grade rate limiting, abuse detection, email verification monitoring, password reset, account deletion, audit logging, backups and security review before opening registration publicly.

## Database
The Prisma schema includes users, verification codes, sessions, countries, territories, country-territory ownership, national priorities, game actions, treaties, messages and game settings.

The included territory grid is a deterministic starter game map, not a real-world geopolitical map. Replace or extend it with licensed/verified map geometry before claiming geographic accuracy.
