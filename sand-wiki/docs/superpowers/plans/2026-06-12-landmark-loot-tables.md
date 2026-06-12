# Landmark Loot Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let loot tables (incl. landmarks) contain **containers as well as items**, make loot **editable nestedly in Directus**, and **protect hand-authored loot from the seed**.

**Architecture:** A Prisma migration adds `LootEntry.containerId` (FK → EnvEntity) and `EnvEntity.lootCurated`. The seed skips wiping loot for `lootCurated` entities. The env detail page renders container entries via a pure `lootEntryView` projection + an `href`-capable `ItemIconLink`. Directus nested editing is configured in the committed snapshot, mirroring the existing `Recipe.inputs/outputs` O2M setup.

**Tech Stack:** Prisma 6 (Postgres/Neon), Next.js (vendored/non-standard — match existing patterns), Directus 11.17.4 (snapshot-managed schema), vitest, daisyUI.

**Reference spec:** [docs/superpowers/specs/2026-06-12-landmark-loot-tables-design.md](../specs/2026-06-12-landmark-loot-tables-design.md)

**Commands** (from `sand-wiki/`): unit `npm test`; focused `npx vitest run src/lib/<f>.test.ts`; types `npx tsc --noEmit`; lint `npm run lint` (2 pre-existing `directus/` warnings OK); build `npm run build`; migrate `npx prisma migrate dev`; generate `npx prisma generate`; Directus `docker compose up -d directus` + `npm run directus:apply` / `npm run directus:snapshot`.

---

## File Structure

**Created:**
- `src/lib/loot.ts` + `.test.ts` — `LootEntryView` type + pure `lootEntryView(entry)` projection (item/container/name → name+icon+rarity+href).
- `prisma/migrations/<ts>_loot_container_and_curated/` — generated migration.

**Modified:**
- `prisma/schema.prisma` — `LootEntry.containerId`/`container`, `EnvEntity.lootCurated`/back-relation, `@@index([containerId])`.
- `prisma/seed.ts` — skip loot recreate when `lootCurated`.
- `src/lib/queries.ts` — `getEnvEntityBySlug` includes `container`.
- `src/app/environment/[slug]/page.tsx` — project entries via `lootEntryView`.
- `src/components/LootTable.tsx` — `LootEntryView` now carries `href` (imported from `@/lib/loot`).
- `src/components/ItemIconLink.tsx` — optional `href` prop.
- `directus/snapshots/snapshot.yaml` — O2M alias fields, `container` M2O, `lootCurated`, relations, notes.

---

## Task 1: Schema — container link + lootCurated flag

**Files:** Modify `prisma/schema.prisma`; generates a migration.

No unit test (schema). Verify by migrate + generate + tsc + existing suite.

- [ ] **Step 1: Edit `EnvEntity`**

In `prisma/schema.prisma`, the `EnvEntity` model currently ends with `lootTiers   LootTier[]` then `@@index([category])`. Add the flag and the back-relation:

```prisma
model EnvEntity {
  id          String  @id @default(dbgenerated("(gen_random_uuid())::text"))
  slug        String  @unique
  category    String
  name        String
  description String?
  sourceUrl   String?
  icon        String?
  iconFile    String? @db.Uuid

  lootCurated Boolean @default(false) // when true, the seed won't overwrite this entity's loot table

  lootTiers     LootTier[]
  droppedInLoot LootEntry[] @relation("LootEntryContainer") // loot entries that reference this entity as a container

  @@index([category])
}
```

- [ ] **Step 2: Edit `LootEntry`**

Add the `container` relation + index. The model becomes:

```prisma
model LootEntry {
  id          String   @id @default(dbgenerated("(gen_random_uuid())::text"))
  lootTierId  String
  lootTier    LootTier @relation(fields: [lootTierId], references: [id], onDelete: Cascade)
  itemId      String?
  item        Item?    @relation(fields: [itemId], references: [id], onDelete: SetNull)
  containerId String?
  container   EnvEntity? @relation("LootEntryContainer", fields: [containerId], references: [id], onDelete: SetNull)
  name        String // display fallback; also the label for an item/container entry
  value1      String? // wiki amounts are strings ("10-20"); rows can have fewer values than columns
  value2      String?
  value3      String?
  sortOrder   Int

  @@unique([lootTierId, sortOrder])
  @@index([itemId])
  @@index([containerId])
}
```

- [ ] **Step 3: Create + apply the migration**

Run: `npx prisma migrate dev --name loot_container_and_curated`
Expected: a new migration is created and applied; output ends with "Your database is now in sync with your schema." (adds nullable `containerId` + FK `LootEntry_containerId_fkey`, `lootCurated` boolean default false, and the `containerId` index — all safe for existing rows).

- [ ] **Step 4: Regenerate the client + typecheck**

Run: `npx prisma generate` then `npx tsc --noEmit`
Expected: client regenerates; tsc clean (the new optional relation doesn't break existing selects).

- [ ] **Step 5: Run the suite (no regressions)**

Run: `npm test`
Expected: 193 tests pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(wiki): loot entries can reference a container; EnvEntity.lootCurated flag"
```

---

## Task 2: Pure `lootEntryView` projection

**Files:** Create `src/lib/loot.ts`, `src/lib/loot.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/loot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lootEntryView } from "./loot";

describe("lootEntryView", () => {
  it("projects an item entry to the item page with item icon/rarity", () => {
    expect(lootEntryView({
      name: "Iron", item: { slug: "iron", icon: "/i/iron.png", rarity: "Common" }, container: null,
    })).toEqual({ name: "Iron", icon: "/i/iron.png", rarity: "Common", href: "/items/iron" });
  });

  it("projects a container entry to the environment page, with no rarity", () => {
    expect(lootEntryView({
      name: "Ammo Crate", item: null, container: { slug: "ammo-crate", icon: "/i/crate.png" },
    })).toEqual({ name: "Ammo Crate", icon: "/i/crate.png", rarity: null, href: "/environment/ammo-crate" });
  });

  it("projects a name-only entry to no link and no icon", () => {
    expect(lootEntryView({ name: "Mystery", item: null, container: null }))
      .toEqual({ name: "Mystery", icon: null, rarity: null, href: null });
  });

  it("prefers the item when both item and container are somehow set", () => {
    expect(lootEntryView({
      name: "X", item: { slug: "x", icon: null, rarity: null }, container: { slug: "c", icon: null },
    }).href).toBe("/items/x");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/loot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/loot.ts`**

```ts
/** A loaded loot entry's link refs (from the env-page query include). */
export interface LootEntryRef {
  name: string;
  item: { slug: string; icon: string | null; rarity: string | null } | null;
  container: { slug: string; icon: string | null } | null;
}

/** Display-ready loot entry: name + icon + rarity (for sort/tint) + link target. */
export interface LootEntryView {
  name: string;
  icon: string | null;
  rarity: string | null;
  href: string | null;
}

/** Project a loot entry to its display view. An entry links to an item, else a
 *  container, else nothing; item wins if both are set. `name` is the label. */
export function lootEntryView(e: LootEntryRef): LootEntryView {
  if (e.item) return { name: e.name, icon: e.item.icon, rarity: e.item.rarity, href: `/items/${e.item.slug}` };
  if (e.container) return { name: e.name, icon: e.container.icon, rarity: null, href: `/environment/${e.container.slug}` };
  return { name: e.name, icon: null, rarity: null, href: null };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/loot.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/loot.ts src/lib/loot.test.ts
git commit -m "feat(wiki): pure lootEntryView projection (item/container/name → href)"
```

---

## Task 3: Render container entries on the env page

**Files:** Modify `src/lib/queries.ts`, `src/app/environment/[slug]/page.tsx`, `src/components/LootTable.tsx`, `src/components/ItemIconLink.tsx`.

No unit test (the projection is tested in Task 2; this is wiring). Verify by tsc + lint + build + manual.

- [ ] **Step 1: Include `container` in the env query**

In `src/lib/queries.ts`, `getEnvEntityBySlug` currently includes `entries: { orderBy: { sortOrder: "asc" }, include: { item: { select: { slug: true, icon: true, rarity: true } } } }`. Add the container select:

```ts
          entries: {
            orderBy: { sortOrder: "asc" },
            include: {
              item: { select: { slug: true, icon: true, rarity: true } },
              container: { select: { slug: true, icon: true } },
            },
          },
```

- [ ] **Step 2: Add an `href` prop to `ItemIconLink`**

In `src/components/ItemIconLink.tsx`, add an optional `href` and use it with precedence over the item slug. Replace the prop list and the link target:

```tsx
export function ItemIconLink({
  slug, href, name, icon, amount, rarity,
}: { slug?: string; href?: string; name: string; icon?: string | null; amount?: number; rarity?: string | null }) {
  const target = href ?? (slug ? `/items/${slug}` : undefined);
  return (
    <div className="group relative flex flex-col items-center gap-0.5">
      {target ? (
        <Link href={target} aria-label={name} className="block">
          <ItemIcon name={name} icon={icon} size="recipe" rarity={rarity} />
        </Link>
      ) : (
        <ItemIcon name={name} icon={icon} size="recipe" rarity={rarity} />
      )}
      {amount != null && <span className="text-sm font-bold text-base-content">×{amount}</span>}
      <span role="tooltip" aria-hidden="true" className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-base-300 px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 z-10">
        {name}
      </span>
    </div>
  );
}
```

(Keep the existing tooltip `<span>` exactly as it is in the current file — copy its real className verbatim rather than the abbreviated one above if it differs. Only the prop list and the `target` link logic change; recipe callers passing `slug` are unaffected.)

- [ ] **Step 3: Move `LootEntryView` to `@/lib/loot` and update `LootTable`**

Replace `src/components/LootTable.tsx` with (it now imports the view type and passes `href`):

```tsx
import { ItemIconLink } from "@/components/ItemIconLink";
import type { LootEntryView } from "@/lib/loot";

/** One tier's loot, as an icon grid (icon + name tooltip, linked to the item or
 *  container when matched). Amounts are intentionally not shown. */
export function LootTable({ entries }: { entries: LootEntryView[] }) {
  if (entries.length === 0) return <p className="text-base-content/50">—</p>;
  return (
    <div className="flex flex-wrap gap-3">
      {entries.map((e, i) => (
        <ItemIconLink key={`${e.href ?? e.name}-${i}`} href={e.href ?? undefined} name={e.name} icon={e.icon} rarity={e.rarity} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Project entries on the env page**

In `src/app/environment/[slug]/page.tsx`, add `import { lootEntryView } from "@/lib/loot";` and replace the inline `.map(...)` projection in the tab content with `lootEntryView`:

```tsx
      <LootTable
        entries={t.entries.map(lootEntryView).sort(byRarityThenName)}
      />
```

(`byRarityThenName` already sorts on `{ rarity, name }`, which `LootEntryView` has; container entries have `rarity: null` → sort last. The existing `import { byRarityThenName } from "@/lib/rarity";` stays.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` then `npm run lint` then `npm test` then `npm run build`
Expected: clean / 197 tests green / build succeeds.

- [ ] **Step 6: Manual smoke (note for executor)**

After Task 5 (Directus) makes authoring possible — or by inserting a row directly — confirm a loot tier containing an item, a container, and a name-only entry renders the icon grid with the item linking to `/items/…`, the container to `/environment/…`, and the name-only entry as a bare icon. A plain item-only loot table is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries.ts src/components/ItemIconLink.tsx src/components/LootTable.tsx "src/app/environment/[slug]/page.tsx"
git commit -m "feat(wiki): render container loot entries linking to their environment page"
```

---

## Task 4: Protect hand-authored loot in the seed

**Files:** Modify `prisma/seed.ts`.

No unit test (DB seed glue). Verify by tsc + a reasoning check; manual re-seed check noted.

- [ ] **Step 1: Gate the loot recreate on `lootCurated`**

In `prisma/seed.ts`, the env loop currently does (around line 143):

```ts
    const entity = await prisma.envEntity.upsert({ where: { slug }, create: { slug, ...scraped }, update: scraped });
    await prisma.lootTier.deleteMany({ where: { envEntityId: entity.id } });
    for (const t of lootToTiers(e.loot)) {
      await prisma.lootTier.create({ /* ... */ });
    }
    envCount++;
```

Wrap the delete+recreate in a `lootCurated` guard. `entity.lootCurated` reflects the existing DB value because `scraped` never includes it (create → default `false`; update → unchanged):

```ts
    const entity = await prisma.envEntity.upsert({ where: { slug }, create: { slug, ...scraped }, update: scraped });
    if (entity.lootCurated) {
      console.log(`Skipping loot recreate for ${slug} (lootCurated = true)`);
    } else {
      await prisma.lootTier.deleteMany({ where: { envEntityId: entity.id } });
      for (const t of lootToTiers(e.loot)) {
        await prisma.lootTier.create({
          data: {
            envEntityId: entity.id,
            tier: t.tier,
            col1Label: t.col1Label,
            col2Label: t.col2Label,
            col3Label: t.col3Label,
            sortOrder: t.sortOrder,
            entries: {
              create: t.entries.map((en) => {
                const itemId = en.itemSlug ? idBySlug.get(en.itemSlug) ?? null : null;
                if (en.itemSlug && !itemId) console.warn(`Loot slug "${en.itemSlug}" in ${slug}/${t.tier} does not resolve to an item`);
                return { itemId, name: en.name, value1: en.value1, value2: en.value2, value3: en.value3, sortOrder: en.sortOrder };
              }),
            },
          },
        });
      }
    }
    envCount++;
```

(Preserve the existing inner `lootTier.create` body exactly — only the surrounding `if (entity.lootCurated) … else { delete + loop }` is new. Do not add `lootCurated` to `scraped`/`create`/`update`.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: clean. (The seed is run on demand, not in CI; tsc covers the change.)

- [ ] **Step 3: Manual re-seed check (note for executor)**

Set `lootCurated = true` on one env entity that exists in `env-content.json` (e.g. via Directus), hand-add a loot tier to it, then run `npm run db:seed`. Confirm the console logs "Skipping loot recreate for … (lootCurated = true)" and the hand-added tier survives. Flip it to false and re-seed → the wiki loot (or none) replaces it. (Do NOT run a destructive reseed against a DB you care about without this confirmation.)

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(wiki): seed skips loot recreate for lootCurated entities"
```

---

## Task 5: Directus nested loot editing (snapshot config)

**Files:** Modify `directus/snapshots/snapshot.yaml`.

This task is **config + manual verification**, not unit/build-testable. It mirrors the existing `Recipe.inputs/outputs` O2M config. **Requires a running Directus** (`docker compose up -d directus`) connected to the migrated DB (Task 1 must be applied first so the `containerId`/`lootCurated` columns + `LootEntry_containerId_fkey` exist).

> **Two ways to do this — pick one:**
> **(A) Edit the snapshot YAML directly** (Steps 1–4 below), then `npm run directus:apply`. Deterministic and reviewable; use the exact blocks given.
> **(B) Configure in Directus Studio** (per the checklist in Step 5), then `npm run directus:snapshot` to capture it into `snapshot.yaml`. More reliable across Directus internals. **If you choose (B), still verify the regenerated snapshot contains the equivalents of Steps 1–3 and commit it.**

- [ ] **Step 1: Add O2M alias fields** (in the `fields:` section of `snapshot.yaml`, mirroring the existing `Recipe.inputs` alias block)

Add an `entries` alias on `LootTier` and a `lootTiers` alias on `EnvEntity`:

```yaml
  - collection: LootTier
    field: entries
    type: alias
    meta:
      collection: LootTier
      conditions: null
      display: null
      display_options: null
      field: entries
      group: null
      hidden: false
      interface: list-o2m
      note: The rows of this tier. Add/reorder loot here.
      options:
        enableSelect: true
        template: '{{name}}'
      readonly: false
      required: false
      searchable: true
      sort: 20
      special:
        - o2m
      translations: null
      validation: null
      validation_message: null
      width: full
  - collection: EnvEntity
    field: lootTiers
    type: alias
    meta:
      collection: EnvEntity
      conditions: null
      display: null
      display_options: null
      field: lootTiers
      group: null
      hidden: false
      interface: list-o2m
      note: Loot tiers for this entity (containers and landmarks).
      options:
        enableSelect: true
        template: '{{tier}}'
      readonly: false
      required: false
      searchable: true
      sort: 30
      special:
        - o2m
      translations: null
      validation: null
      validation_message: null
      width: full
```

- [ ] **Step 2: Add the `container` M2O field on `LootEntry`** (mirror the existing `LootEntry.itemId` field block, pointing at `EnvEntity`)

```yaml
  - collection: LootEntry
    field: containerId
    type: text
    meta:
      collection: LootEntry
      display: related-values
      display_options:
        template: '{{name}}'
      field: containerId
      interface: select-dropdown-m2o
      note: 'Optional: link this entry to a container (env entity). Leave item AND container empty to show just the typed name.'
      options:
        template: '{{name}}'
      readonly: false
      required: false
      width: half
    schema:
      foreign_key_table: EnvEntity
      foreign_key_column: id
```

Also add a `note` to the existing `LootEntry.itemId` field meta ("Optional: link to an item.") and to `LootEntry.name` ("Display label — shown as the row's text/tooltip; defaults to the item/container name.") — edit those existing blocks' `meta.note`.

- [ ] **Step 3: Add the relations entries** (in the `relations:` section, mirroring `RecipeInput.recipeId`). These give Directus the O2M aliases + the container M2O. Use the Prisma FK constraint names.

```yaml
  - collection: LootEntry
    field: lootTierId
    related_collection: LootTier
    meta:
      junction_field: null
      many_collection: LootEntry
      many_field: lootTierId
      one_allowed_collections: null
      one_collection: LootTier
      one_collection_field: null
      one_deselect_action: nullify
      one_field: entries
      sort_field: sortOrder
    schema:
      table: LootEntry
      column: lootTierId
      foreign_key_table: LootTier
      foreign_key_column: id
      constraint_name: LootEntry_lootTierId_fkey
      on_update: NO ACTION
      on_delete: CASCADE
  - collection: LootTier
    field: envEntityId
    related_collection: EnvEntity
    meta:
      junction_field: null
      many_collection: LootTier
      many_field: envEntityId
      one_allowed_collections: null
      one_collection: EnvEntity
      one_collection_field: null
      one_deselect_action: nullify
      one_field: lootTiers
      sort_field: sortOrder
    schema:
      table: LootTier
      column: envEntityId
      foreign_key_table: EnvEntity
      foreign_key_column: id
      constraint_name: LootTier_envEntityId_fkey
      on_update: NO ACTION
      on_delete: CASCADE
  - collection: LootEntry
    field: containerId
    related_collection: EnvEntity
    meta:
      junction_field: null
      many_collection: LootEntry
      many_field: containerId
      one_allowed_collections: null
      one_collection: EnvEntity
      one_collection_field: null
      one_deselect_action: nullify
      one_field: null
      sort_field: null
    schema:
      table: LootEntry
      column: containerId
      foreign_key_table: EnvEntity
      foreign_key_column: id
      constraint_name: LootEntry_containerId_fkey
      on_update: NO ACTION
      on_delete: SET NULL
```

> If `directus:apply` rejects an `on_update`/`on_delete`/`constraint_name` value (these must match what Postgres actually created), run `npm run directus:snapshot` against the live DB once to capture the exact schema block for these FKs, then re-apply method (B). The `meta` (one_field/sort_field) is the part that creates the nested editing.

- [ ] **Step 4: Add the `lootCurated` field on `EnvEntity`**

```yaml
  - collection: EnvEntity
    field: lootCurated
    type: boolean
    meta:
      collection: EnvEntity
      field: lootCurated
      interface: boolean
      note: When ON, the importer will not overwrite this entity's loot table (set this for hand-authored landmark loot).
      special:
        - cast-boolean
      width: half
    schema:
      default_value: false
```

Optionally set `display_template` on the `LootTier` collection meta to `'{{tier}}'` and on `LootEntry` to `'{{name}}'` so list views are readable (edit each collection's `meta.display_template`).

- [ ] **Step 5: Apply + verify in Directus Studio**

Run: `docker compose up -d directus` then `npm run directus:apply`
Expected: applies without error.

Then open Directus Studio (`http://localhost:8055`) and confirm:
1. Open an `EnvEntity` (a landmark, e.g. `dreadnaught`) → there's an inline **Loot Tiers** list. Add a tier (pick `tier`, set a `col1Label`).
2. Inside the tier, an inline **Entries** list lets you add rows; each row offers an **item** picker, a **container** picker, a **name**, and amount fields — no more ambiguous parent dropdown.
3. Rows drag-reorder (writes `sortOrder`).
4. The `EnvEntity` has a **lootCurated** toggle.

**Known caveat to watch:** `LootEntry` has `@@unique([lootTierId, sortOrder])`. If Directus drag-reorder errors on a duplicate `sortOrder` mid-update, that unique constraint is the cause — note it for a follow-up (a migration dropping that unique, or relying on Directus's deferred sort). Don't fix it inline here unless it actually blocks reordering.

- [ ] **Step 6: Capture + commit the snapshot**

If you used method (B), run `npm run directus:snapshot` first. Then:

```bash
git add directus/snapshots/snapshot.yaml
git commit -m "feat(wiki): nested Directus editing for loot tables + container & lootCurated fields"
```

---

## Final verification

- [ ] `npm test` → green (adds `loot.test.ts`; ~197 tests).
- [ ] `npx tsc --noEmit` → clean.
- [ ] `npm run lint` → no new errors.
- [ ] `npm run build` → succeeds.
- [ ] Directus: nested loot editing works; a landmark loot tier with an item + a container + a name-only entry renders on the env page with correct links (Task 3 manual smoke).
- [ ] Seed: a `lootCurated` entity's hand-authored loot survives `npm run db:seed` (Task 4 manual check).

---

## Self-Review Notes (author)

- **Spec coverage:** §1 container schema → Task 1 ✓; §2 seed protection → Task 1 (flag) + Task 4 (skip logic) ✓; §3 Directus nested editing + container field + lootCurated toggle + notes → Task 5 ✓; §4 app rendering of container entries → Tasks 2 (pure helper) + 3 (query/page/LootTable/ItemIconLink) ✓; testing helper → Task 2 ✓.
- **Type consistency:** `LootEntryView` defined once in `src/lib/loot.ts` (Task 2), imported by `LootTable` (Task 3) — the old in-component definition is removed. `LootEntryRef` shape matches the Task 3 query include (`item{slug,icon,rarity}`, `container{slug,icon}`) and `lootEntryView` consumes it. `ItemIconLink` gains `href?` (Task 3), used by `LootTable`; recipe callers keep `slug`. `lootCurated`/`containerId` names consistent across schema (T1), seed (T4), Directus (T5).
- **Ordering:** T1 (migration) precedes everything (client + DB columns + FK needed by T3/T4/T5). T5 needs the FK from T1 + a running Directus.
- **Migration safety:** new column is nullable; flag has a default — no backfill.
- **Known risks flagged:** `@@unique([lootTierId, sortOrder])` vs Directus drag-reorder (Task 5 caveat); FK schema values in the snapshot may need a capture pass (Task 5 Step 3 note).
- **Out of scope (per spec):** amounts/column rendering, reverse container-drop lookup, DB-enforced item-xor-container, wiki import of container loot, auto-setting lootCurated.
