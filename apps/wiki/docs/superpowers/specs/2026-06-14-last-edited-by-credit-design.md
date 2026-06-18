# "Last edited by" contributor credit on entity pages

**Date:** 2026-06-14
**Status:** Approved design

## Goal

Credit the most recent contributor on each entity detail page (items, environment
entities, trampler parts) with a "Last edited by &lt;Steam persona name&gt;" line in
the sidebar, linking to the contributor's Steam profile.

## Scope decisions (settled during brainstorming)

- **Single last editor**, not a contributor list. One name.
- **Any applied proposal** that targets the entity counts as an edit: field `edit`,
  `links_edit`, and `loot_sources_edit`. Recipe proposals target a recipe (not the
  entity) and are correctly excluded.
- **Placement:** sidebar, as its own credit block (distinct from the factual
  "Details" rows).
- **Display:** persona name, linked to the Steam profile. No avatar.
- **Approach: derive at read time** from the `Proposal` table. No schema change, no
  changes to any apply path, and existing applied edits are credited retroactively.

## Why derive-at-read-time (vs. denormalizing onto Entity)

The proposer's identity is already captured on every `Proposal`
(`proposerId` → `SteamUser`). Reading the latest applied proposal per entity:

- requires **no migration** and **no backfill** — existing contributions show up
  immediately;
- needs **no edits to the four `applyProposal*` paths** (a denormalized field would
  have to be written in every one or silently go stale);
- is **always accurate** and inherently covers all entity-targeting proposal kinds.

Cost: one small indexed query per entity page render. The required indexes already
exist (`@@index([targetType, targetSlug])`, `@@index([status])`).

## Data model (unchanged)

No Prisma schema change. Relevant existing models:

- `Proposal { kind, status, targetType, targetSlug, proposerId, reviewedAt,
  createdAt, proposer: SteamUser }`
- `SteamUser { steamId @id, personaName String?, avatar, ... }`

Proposal `targetType`/`targetSlug` conventions confirmed in
`src/app/contribute/actions.ts`:

| kind                | targetType                          | targetSlug        |
| ------------------- | ----------------------------------- | ----------------- |
| `edit`              | `item` / `envEntity` / `tramplerPart` | entity slug     |
| `links_edit`        | `item` / `envEntity` / `tramplerPart` | entity slug     |
| `loot_sources_edit` | `item`                              | item slug         |
| `recipe_*`          | `recipe`                            | recipe slug       |

Filtering on **both** `targetType` and `targetSlug` scopes the credit to the entity
and avoids any slug collision with `recipe`-targeted proposals.

## Components & changes

### 1. `src/lib/steam.ts` (new) — pure helpers

```ts
/** Public Steam community profile URL for a 17-digit steamId. */
export function steamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}

/** Display name for a contributor credit; SteamUser.personaName is nullable. */
export function editorDisplayName(personaName: string | null): string {
  return personaName?.trim() || "Anonymous contributor";
}
```

### 2. `src/lib/steam.test.ts` (new) — unit tests

- `steamProfileUrl("7656...")` → `https://steamcommunity.com/profiles/7656...`
- `editorDisplayName("Neo")` → `"Neo"`
- `editorDisplayName(null)` and `editorDisplayName("  ")` → `"Anonymous contributor"`

### 3. `src/lib/queries.ts` — `getLastEditor`

```ts
export async function getLastEditor(
  targetType: "item" | "envEntity" | "tramplerPart",
  slug: string,
): Promise<{ steamId: string; personaName: string | null } | null> {
  const p = await prisma.proposal.findFirst({
    where: { targetType, targetSlug: slug, status: "applied" },
    orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
    select: { proposer: { select: { steamId: true, personaName: true } } },
  });
  return p?.proposer ?? null;
}
```

Returns `null` for seeded/unedited entities → no credit rendered. The thin Prisma
wrapper is left untested, consistent with the rest of `queries.ts`; the display
logic it feeds is covered by the helper tests.

### 4. `src/components/EntityDetail.tsx` — `lastEditedBy` prop + credit block

- Add to `EntityDetailProps`:
  ```ts
  lastEditedBy?: { steamId: string; name: string } | null;
  ```
- Sidebar visibility: `const hasSidebar = (detailRows?.length ?? 0) > 0 || !!lastEditedBy;`
- In the sidebar column, render a small muted credit block **below**
  `ItemDetailsPanel` when `lastEditedBy` is set:

  ```
  Last edited by
  <name>   → <a href={steamProfileUrl(steamId)} target="_blank" rel="noopener noreferrer">
  ```

  Styled subtly (muted label, small text), visually separate from the Details `dl`.
  The anchor uses the same underline/hover treatment as the existing source link.

Behavior per page:
- **Items / tramplers** (already pass `detailRows`): credit appears beneath Details.
- **Environment** (no `detailRows` today): a minimal sidebar appears containing only
  the credit when an applied edit exists; otherwise the page stays single-column,
  exactly as it is now.

### 5. Page wiring — three routes

In each of `src/app/items/[slug]/page.tsx`, `src/app/environment/[slug]/page.tsx`,
`src/app/tramplers/[slug]/page.tsx`:

- Call `getLastEditor(<type>, slug)` (types: `"item"`, `"envEntity"`,
  `"tramplerPart"` respectively).
- Map the result to `{ steamId, name: editorDisplayName(personaName) }` and pass as
  `lastEditedBy` to `EntityDetail`. Pass `null`/omit when there's no editor.

No changes to the `detailRows` builders (`itemDetailRows`, `tramplerDetailRows`).

## Error handling

- No applied proposals → `getLastEditor` returns `null` → nothing rendered.
- `personaName` null/blank → `editorDisplayName` falls back to "Anonymous
  contributor"; link still resolves via `steamId`.
- The `proposer` relation is FK-constrained, so a missing proposer cannot occur.
- No new failure modes on the render path; no apply-path or migration risk.

## Files touched

- `src/lib/steam.ts` *(new)*
- `src/lib/steam.test.ts` *(new)*
- `src/lib/queries.ts` — add `getLastEditor`
- `src/components/EntityDetail.tsx` — `lastEditedBy` prop, sidebar logic, credit block
- `src/app/items/[slug]/page.tsx` — call + pass prop
- `src/app/environment/[slug]/page.tsx` — call + pass prop
- `src/app/tramplers/[slug]/page.tsx` — call + pass prop

## Out of scope

- Full contributor lists / per-field attribution.
- Avatars in the credit.
- Crediting source/container entities affected indirectly by a `loot_sources_edit`.
- Any denormalized audit columns on `Entity`.
