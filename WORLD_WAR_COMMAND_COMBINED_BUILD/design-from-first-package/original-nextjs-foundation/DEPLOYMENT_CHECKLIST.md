# Deployment and acceptance checklist

## Before deployment
- [ ] Create production PostgreSQL database and secure credentials.
- [ ] Configure production SMTP sender and verify delivery.
- [ ] Generate a unique SESSION_SECRET.
- [ ] Configure APP_URL and NODE_ENV=production.
- [ ] Run Prisma schema migration/push against the intended database.
- [ ] Seed the world grid once.
- [ ] Confirm database backups and restore procedure.
- [ ] Run dependency audit and production build.

## Required end-to-end tests
- [ ] Register with valid email and password.
- [ ] Receive the verification code in the actual inbox.
- [ ] Reject incorrect code and expired code.
- [ ] Resend code and verify cooldown.
- [ ] Verify account and establish session.
- [ ] Sign in and sign out.
- [ ] Reject duplicate verified email.
- [ ] Create a country with a unique name.
- [ ] Reject duplicate country name.
- [ ] Select up to six connected territories.
- [ ] Reject disconnected territories and unavailable territories.
- [ ] Verify first selected territory becomes capital.
- [ ] Save and reload national priorities.
- [ ] Save and reload game actions/history.
- [ ] Verify all pages on 360, 390, 412, 768, 1024, 1366 and 1920 CSS pixel widths.
- [ ] Test physical iPhone and Android touch selection.
- [ ] Test keyboard navigation and accessible labels.
- [ ] Test rate limiting, CSRF/origin protections and abuse scenarios before public launch.

## Do not claim complete until separately implemented and tested
- [ ] Real-time multiplayer and matchmaking service.
- [ ] Full economic simulation and balancing.
- [ ] Research and invention engine.
- [ ] Military, conflict and battle-resolution engine.
- [ ] Diplomacy, treaty proposal and acceptance workflows.
- [ ] Human Cost and NSI formulas and auditability.
- [ ] Real-world map geometry and geographic ownership data.
- [ ] Voice command parsing, permissions and high-impact confirmations.
- [ ] Admin/moderation tools and player support.
- [ ] Privacy policy, terms, age policy and account/data deletion workflows.
