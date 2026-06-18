- [x] Import trampler parts from wiki
- [x] Normalize buy/sell price on items details table and remove elsewhere
- [x] Order items in list by rarity/alphanumeric
- [x] Order weapons by types
- [x] Order artillery by type
- [x] Add EMP and Delayed detonation ammo for 80mm (icons added; descriptions are still TODO placeholders)
- [x] add alphanumeric ordering on tables columns (click headers: asc → desc → default)
- [x] add hover effect on links and tabs and interactive ui in app (global hover system in globals.css)
- [x] Make rarity background color slightly translucent like in game (~65% tint; all items default to Common)
- [x] Fix import from wiki in crates content sometimes mismatching "pneumatic components" for example being pneumatic parts (wiki-overrides for wiki↔game name drift; regression test)
- [x] Add landmarks and loot containers to search auto fill
- [x] Disable buttons to currently WIP pages (Tech, Tools, NPCs shown dimmed + "soon", non-interactive)
- [x] Flatening tables for directus and integration (flat stat columns + LootTier/LootEntry/TramplerPartCost; upsert-by-slug seed; local Directus via docker-compose)
- [x] Add backoffice to edit as admin datas from app — Directus handles this. PKs
  are DB-generated (migration 20260611150000_id_db_default: `gen_random_uuid()` default
  on every `id`) so Studio-created rows get an id with no manual entry, and `id` is
  read-only in Studio (field meta in `directus/snapshots/snapshot.yaml` — set it on any
  new collection's `id`, then `npm run directus:snapshot`).
- Directus in production: the current setup is dev-only — before deploying, (1) the icon
  thumbnail display (`image-path`) has `baseUrl = http://localhost:3000` hardcoded in field
  config: repoint it to the public app URL (Studio → Item/EnvEntity/TramplerPart `icon` field →
  display options, then re-snapshot), (2) update the compose CSP override
  `CONTENT_SECURITY_POLICY_DIRECTIVES__IMG_SRC` to that same public origin, (3) set `PUBLIC_URL`
  to the public Directus URL, (4) host Directus somewhere (Neon prod DB + the `directus` schema
  + `DIRECT_DATABASE_URL` non-pooler endpoint), (5) hand-authored recipes are wiped by
  `npm run db:seed` — add the `manual`-flag seed change before authoring anything precious,
  (6) `directus/uploads` (mirrored sprites for card images) is machine-local — on a new host run
  `npx tsx prisma/sync-directus-icons.mjs` to repopulate files + `iconFile` links,
  (7) the read-only `id` fields travel in `snapshot.yaml` (applied via `npm run directus:apply`)
  and the `gen_random_uuid()` column default ships with `prisma migrate deploy` — both reproduce
  on prod with no extra provisioning step.
- [x] Add steam connection to allow user to offfer corrections, (will need vallidation by admin)
  (Steam OpenID login + signed session cookie; logged-in users propose structured
  field corrections or free-text new-page requests. See docs/superpowers/specs/2026-06-11-steam-community-contributions-design.md)
- [x] Add validation screen in backoffice to make validate corrections from steam authenticated user.
  (Implemented as an in-app `/admin/proposals` screen — Steam-id allowlist admins, side-by-side
  diff + one-click Approve & apply — rather than in Directus; Directus diff display/apply was too clunky.)
- Add tips tab in items to allow user to share tips (might be moderated by admin) with vote system
- Add legal statement about property and stuff
- Add thanks to wiki

