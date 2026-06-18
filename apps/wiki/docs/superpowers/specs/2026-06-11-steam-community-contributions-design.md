# Steam community contributions — design

**Date:** 2026-06-11
**Status:** Approved (design); pending implementation plan
**Scope:** Let Steam-authenticated users propose corrections to existing wiki
entities and request new pages. Admins review and apply via a custom in-app
screen. Covers TODO lines: "Add steam connection…" and "Add validation screen
in backoffice…".

## Goal

The wiki is currently a read-only, server-rendered Next.js app backed by
structured Prisma/Postgres tables (`Item`, `EnvEntity`, `TramplerPart`,
recipes, loot…), with Directus as the admin backoffice. We want community
members to help fix errors and request new pages, with every change gated
behind admin approval before it touches canonical data.

## Key decisions

- **Proposal model: hybrid.** Existing pages get structured field edits (a
  diff of typed fields) plus an optional free-text note. New pages are
  free-text requests only in v1.
- **Review surface: custom Next.js page.** A purpose-built `/admin/proposals`
  screen with a side-by-side old→new diff and one-click "Approve & apply".
  Chosen over Directus because Directus renders the structured diff as a raw
  JSON blob and cannot apply an approved diff back onto the canonical row
  without a fiddly Flow.
- **Auth: Steam is the only auth system.** Admins are simply Steam IDs on an
  allowlist — no second login to build or secure. Directus admin is unchanged
  and separate.
- **Auth implementation: lightweight custom.** Steam OpenID 2.0 redirect +
  verification, plus our own signed httpOnly session cookie. No auth framework
  dependency (avoids Next.js 16 compatibility risk). A dedicated security
  review is a required gate before this is considered done.

## Architecture overview

Three capabilities layered onto the existing app, sharing one auth system:

1. **Steam auth** — route handlers + a session-cookie helper (`src/lib/auth.ts`).
2. **Contribution flow** — "Suggest a correction" on each entity page (edit
   form) and a "Propose a new page" form (free-text). Both write `Proposal`
   rows. Nothing touches canonical data at submission time.
3. **Admin review** — `/admin/proposals`, gated to admin Steam IDs, with a
   side-by-side diff and Approve & apply (transactional write) or Reject.

Directus remains the raw-data editor and the place admins manually create rows
for approved new-page requests.

## Data model

Two new Prisma models. IDs follow the existing `gen_random_uuid()` DB-default
pattern (migration `20260611150000_id_db_default`).

```prisma
model SteamUser {
  steamId     String   @id              // 64-bit steamid as string
  personaName String?
  avatar      String?
  createdAt   DateTime @default(now())
  lastSeenAt  DateTime @default(now())
  proposals   Proposal[]
}

model Proposal {
  id           String    @id @default(dbgenerated("(gen_random_uuid())::text"))
  kind         String                     // "edit" | "new_page"
  status       String    @default("pending") // "pending" | "applied" | "rejected"
  targetType   String?                    // "item" | "envEntity" | "tramplerPart" (edits)
  targetSlug   String?
  changes      Json?                      // { field: { old, new } } — changed fields only
  note         String?                    // context (edits) / body (new pages)
  proposedName String?                    // new pages
  proposerId   String
  proposer     SteamUser @relation(fields: [proposerId], references: [steamId])
  createdAt    DateTime  @default(now())
  reviewedById String?
  reviewedAt   DateTime?
  reviewNote   String?

  @@index([status])
  @@index([targetType, targetSlug])
}
```

**Admin identity:** an `ADMIN_STEAM_IDS` env allowlist (comma-separated) is the
source of truth — checked at request time so it cannot go stale. No DB column
to hand-edit.

## Steam auth + session

- `GET /api/auth/steam/login` → redirect to Steam's OpenID 2.0 endpoint with
  `realm` and `return_to` pinned to our own origin (no open redirect).
- `GET /api/auth/steam/callback` → verify by posting the returned params back to
  Steam with `openid.mode=check_authentication`; require `is_valid:true`.
  Extract `steamid` from `openid.claimed_id`
  (`https://steamcommunity.com/openid/id/<steamid>`). Optionally fetch
  `personaName` + `avatar` via `ISteamUser/GetPlayerSummaries` (`STEAM_API_KEY`).
  Upsert `SteamUser`.
- Issue a stateless signed session cookie: HMAC-SHA256 (Web Crypto, no
  dependency) over `{ steamId, exp }`; `httpOnly` + `secure` + `sameSite=lax`.
- `POST /api/auth/steam/logout` clears the cookie.
- Helpers in `src/lib/auth.ts`: `getSession()` (read + verify cookie),
  `getUser()` (load `SteamUser`), `requireAdmin()` (allowlist check).

**New env vars:** `STEAM_API_KEY`, `SESSION_SECRET`, `ADMIN_STEAM_IDS`,
`NEXT_PUBLIC_SITE_URL` (for realm/return_to).

## Contribution flow

- **Field whitelist** — `src/lib/proposal-schema.ts` maps each `targetType` to
  its editable fields (`{ field, label, type }`). It drives both form rendering
  and server-side validation. Fields outside the whitelist are rejected, so a
  proposal can never target an arbitrary column. v1 covers scalar fields on
  `Item`, `EnvEntity`, `TramplerPart` (not recipe/loot relations).
- **Edit:** a "Suggest a correction" entry point on item/env/trampler detail
  pages. A logged-out click routes through Steam login and back. The form is
  prefilled with current values; submit computes the diff of changed fields
  only and creates `Proposal(kind="edit")`. An empty diff is rejected.
- **New page:** `/contribute/new` — type select + proposed name + free-text
  body → `Proposal(kind="new_page")`.
- **Anti-abuse (v1):** login required; cap pending proposals per user (10).
  CAPTCHA is out of scope.

## Admin review + apply

- `/admin/proposals` (`requireAdmin`) lists pending proposals.
- **Edit detail:** side-by-side current DB value vs proposed value. Because data
  may have shifted since submission, if the current value differs from the
  stored `old`, show a "stale — base value changed" warning so the admin does
  not blindly overwrite.
- **Approve & apply** (edits): a single transaction re-reads the target row,
  writes only the whitelisted changed fields, and sets `status="applied"` plus
  reviewer id/time.
- **New-page** proposals cannot auto-apply: the admin reads the request, creates
  the row in Directus, and marks the proposal `applied` (or `rejected` with a
  note).

## Edge cases & security

Verified at the end via the `security-review` skill before sign-off:

- Open-redirect protection on `return_to` / `realm`.
- Strict OpenID `check_authentication` verification.
- Constant-time HMAC comparison for session verification.
- Cookie flags: `httpOnly`, `secure`, `sameSite=lax`.
- CSRF / origin checks on every state-changing POST (submit, approve, reject).
- Whitelist enforcement on apply.
- Admin gate on every `/admin` route and admin action.
- Stale-base handling on apply.

## Testing

- Unit: diff computation, whitelist validation, session sign/verify (tampered
  cookie → reject), OpenID param parsing (mocked Steam responses).
- The security review is a separate required gate before "done."

## Out of scope (v1)

- Structured new-entity creation (forms with all fields + relations).
- Tips / voting system (separate TODO line).
- Email / notifications.
- Editing recipe and loot relations through proposals.
