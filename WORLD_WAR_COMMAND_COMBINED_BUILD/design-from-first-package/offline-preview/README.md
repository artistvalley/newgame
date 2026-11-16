# WORLD WAR COMMAND — PWA Preview Build 3

This is a standalone **offline/local demonstration**, NOT a complete multiplayer production game. No real purchases or privileged administration are supported.

## Try it
Serve this directory over HTTPS or localhost (for example `python -m http.server 8000`) and open `index.html`. For Android use Chrome > Install app; for iPhone use Safari > Share > Add to Home Screen. The standalone HTML file can also be opened locally, but service workers and PWA installation require HTTPS/localhost.

## Included
- Responsive playable local game demonstration, country founding, territory claiming, illustrative economy, warfare and diplomacy
- ZETOS informational page (payments disabled)
- Separate responsive admin demo tabs for overview, players, countries, economy, ZETOS, world, security and backup
- Web manifest, icons and service worker with static asset caching

## NOT INCLUDED / production blockers
- Live PlanetScale database backup and verified restoration
- Server-side player authentication, authorisation and admin RBAC
- Real multiplayer engine, authoritative warfare/economy engine, ZETOS payments
- Production deployment and connection to existing Cloudflare Worker

**Do not upload this preview over the live `wargame.zetoask.com` Worker.** It would replace the existing application and does not include its database.
