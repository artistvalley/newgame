# Comparison of the two uploaded archives

| Area | First handoff ZIP | Second `wwc-pack.zip` | Combined build |
|---|---|---|---|
| UI | Navy/gold Next.js foundation, offline playable prototype, reference images | Brown/gold TanStack React 2F UI | 2F controls with first palette; first source/reference kept separately |
| Runtime | Next.js 15 + Prisma 6 | TanStack Start + Vite + Nitro + `pg` / PGLite | TanStack 2F runtime; no mixed React routing frameworks |
| Gameplay | Country founding, priorities, map, mostly recorded decisions | Server game actions for economy, battles, research, diplomacy, human cost, ZETOS | 2F gameplay retained; first app not mounted as a second backend |
| DB | Prisma schema, separate from live | 2F SQL migrations; old live DB JSON export | 2F SQL only; old data excluded for privacy |
| Live old game | No matching source | DB export only, no matching live source | Not imported or modified |
| Completion | Foundation, not production-ready | 7 reported disposable DB tests; no production deploy | Not independently proven 100% |

See `MASTER_SPECIFICATION.md` for the broader vision and unresolved rules. Do not mistake design mockups, a checklist or a successful local test for a complete feature.
