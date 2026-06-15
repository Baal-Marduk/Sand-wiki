# Admin Entity Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins three direct, seed-safe in-app capabilities — add an entity, change an entity's image, and disable an entity so only admins can see it.

**Architecture:** A new `Entity.disabled` column drives visibility via a single `visibilityWhere(isAdmin)` helper merged into list/search/sitemap queries; detail pages 404 disabled entities for non-admins. Admin-direct server actions write straight to the DB and — for image changes — record a pre-applied `edit` proposal so the seed's existing lock-map preserves the change. New entities are created `curated: true` so the seed never prunes them. All admin UI is gated by `requireAdmin()` / `sessionIsAdmin()`.

**Tech Stack:** Next.js (App Router, server actions), Prisma 6 + Neon Postgres, React 19, Tailwind, Radix UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-admin-entity-management-design.md`

---

## File Structure

**Create:**
- `src/lib/visibility.ts` — `visibilityWhere(isAdmin)` WHERE-fragment helper (pure).
- `src/lib/visibility.test.ts` — unit test for the helper.
- `src/lib/admin-entity.ts` — pure helpers: kind↔proposal-type maps, `buildImageChanges`, `buildEntityCreateData` (validation + partition).
- `src/lib/admin-entity.test.ts` — unit tests for the pure helpers.
- `src/app/admin/entities/actions.ts` — `setEntityImage`, `setEntityDisabled`, `createEntity` server actions.
- `src/components/AdminEntityControls.tsx` — client control strip (image edit + disable toggle).
- `src/app/admin/entities/new/page.tsx` — add-entity form page (admin-gated).
- `src/components/CreateEntityForm.tsx` — client form for new entities.

**Modify:**
- `prisma/schema.prisma` — add `disabled` column to `Entity`.
- `src/lib/auth.ts` — add `sessionIsAdmin()`.
- `src/lib/queries.ts` — apply visibility to list/facet/sitemap/tech queries.
- `src/app/api/search-index/route.ts` — exclude disabled.
- `src/components/EntityDetail.tsx` — add `disabled` badge + `adminControls` slot.
- `src/components/EntityCard.tsx` — add `disabled` pill.
- `src/app/items/[slug]/page.tsx`, `src/app/environment/[slug]/page.tsx`, `src/app/tramplers/[slug]/page.tsx` — admin-aware 404 + control strip.
- `src/app/items/page.tsx`, `src/app/environment/page.tsx`, `src/app/tramplers/page.tsx` — thread `isAdmin` + disabled pill.
- `src/app/admin/proposals/page.tsx` (or the admin landing) — add a link to "Add entity".

---

## Task 1: Add the `disabled` column to Entity

**Files:**
- Modify: `prisma/schema.prisma` (Entity model, after `curated`)

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, inside `model Entity`, immediately after the `curated` line, add:

```prisma
  disabled    Boolean @default(false) // admin-hidden; only admins see it. Seed never writes this column, so it survives re-seeds.
```

- [ ] **Step 2: Push the schema to the dev DB and regenerate the client**

Run: `npm run db:seed -- --help` is NOT needed. Instead run:

```bash
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.` followed by `Generated Prisma Client`. This adds a defaulted boolean column — non-destructive, no re-seed, existing rows get `disabled = false`.

> NOTE: Do NOT run `npm run db:seed` / `:force` / `db:reset` — that would wipe contributor edits (see project memory "never reseed live DB"). `db push` only adds the column.

- [ ] **Step 3: Verify the column exists**

Run:

```bash
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.entity.findFirst({select:{slug:true,disabled:true}}).then(r=>{console.log(r); return p.$disconnect()})"
```

Expected: prints an object like `{ slug: '...', disabled: false }` (no error about an unknown column).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add Entity.disabled flag for admin-only visibility"
```

---

## Task 2: Visibility helper + `sessionIsAdmin`

**Files:**
- Create: `src/lib/visibility.ts`
- Create: `src/lib/visibility.test.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/visibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { visibilityWhere } from "./visibility";

describe("visibilityWhere", () => {
  it("hides disabled rows for non-admins", () => {
    expect(visibilityWhere(false)).toEqual({ disabled: false });
  });

  it("shows everything to admins", () => {
    expect(visibilityWhere(true)).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/visibility.test.ts`
Expected: FAIL — `Cannot find module './visibility'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/visibility.ts`:

```ts
import type { Prisma } from "@prisma/client";

/** WHERE fragment to merge into Entity queries so disabled rows stay hidden from
 *  the public. Admins (isAdmin=true) get an empty fragment → they see everything.
 *  Defaulting callers to `false` keeps any forgotten call site safe (public view). */
export function visibilityWhere(isAdmin: boolean): Prisma.EntityWhereInput {
  return isAdmin ? {} : { disabled: false };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/visibility.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add `sessionIsAdmin` to auth.ts**

In `src/lib/auth.ts`, after the `getSession` function (around line 37), add:

```ts
/** Boolean admin check for the current request. Safe in any Server Component:
 *  no session → false. Use to branch UI / pass into visibility-aware queries. */
export async function sessionIsAdmin(): Promise<boolean> {
  const session = await getSession();
  return !!session && isAdmin(session.steamId);
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/visibility.ts src/lib/visibility.test.ts src/lib/auth.ts
git commit -m "feat(visibility): add visibilityWhere helper and sessionIsAdmin"
```

---

## Task 3: Apply visibility filters across queries

**Files:**
- Modify: `src/lib/queries.ts`
- Modify: `src/app/api/search-index/route.ts`

Detail-page queries (`getItemBySlug` / `getEnvEntityBySlug` / `getTramplerPartBySlug`) are NOT changed here — they keep returning the row (with the now-included `disabled` field), and the admin-aware 404 happens in the page (Task 8). This avoids changing their React `cache()` signatures.

- [ ] **Step 1: Make the three list functions admin-aware**

In `src/lib/queries.ts`:

Add the import at the top (after the existing `entityHref` import line):

```ts
import { visibilityWhere } from "./visibility";
```

Change `listItems` (line 50) signature and where-merge:

```ts
export async function listItems(filter: ItemFilter, isAdmin = false) {
  const { where, orderBy } = buildItemQuery(filter);
  const items = await prisma.entity.findMany({
    where: { ...where, ...visibilityWhere(isAdmin) },
    orderBy,
    include: { itemStats: true },
  });
  const flat = items.map((i) => ({ ...i, ammoName: i.itemStats?.ammoName ?? null }));
  return applyItemView(flat, { sort: filter.sort, weaponClass: filter.weaponClass });
}
```

Change `listEnvEntities` (line 111):

```ts
export async function listEnvEntities(category?: string, isAdmin = false) {
  return prisma.entity.findMany({
    where: { kind: "environment", ...(category ? { category } : {}), ...visibilityWhere(isAdmin) },
    orderBy: { name: "asc" },
  });
}
```

Change `listTramplerParts` (line 160):

```ts
export async function listTramplerParts(category?: string, isAdmin = false) {
  return prisma.entity.findMany({
    where: { kind: "trampler-part", ...(category ? { category } : {}), ...visibilityWhere(isAdmin) },
    include: { tramplerStats: true },
    orderBy: [{ tramplerStats: { researchTier: "asc" } }, { name: "asc" }],
  });
}
```

- [ ] **Step 2: Make facet, count, sitemap and tech queries always-public**

These describe the browsable (public) space, so they unconditionally exclude disabled. In `src/lib/queries.ts`:

`listRarities` (line 65) — add `disabled: false` to the where:

```ts
  const rows = await prisma.entity.findMany({
    where: { ...where, rarity: { not: null }, disabled: false },
    distinct: ["rarity"],
    select: { rarity: true },
  });
```

`listWorkbenchTiers` (line 80) — constrain through the entity relation:

```ts
  const rows = await prisma.itemStats.findMany({
    where: { entity: { ...where, disabled: false }, workbenchTier: { not: null } },
    distinct: ["workbenchTier"],
    select: { workbenchTier: true },
    orderBy: { workbenchTier: "asc" },
  });
```

`listItemClasses` (line 96):

```ts
  const rows = await prisma.entity.findMany({
    where: { ...where, disabled: false },
    select: { slug: true, name: true, itemStats: { select: { ammoName: true } } },
  });
```

`itemCategoryCounts` (line 106):

```ts
  const rows = await prisma.entity.groupBy({ by: ["category"], where: { kind: "item", disabled: false }, _count: true });
```

`envCategoryCounts` (line 154):

```ts
  const rows = await prisma.entity.groupBy({ by: ["category"], where: { kind: "environment", disabled: false }, _count: true });
```

`tramplerCategoryCounts` (line 188):

```ts
  const rows = await prisma.entity.groupBy({ by: ["category"], where: { kind: "trampler-part", disabled: false }, _count: true });
```

`listEntityPaths` (line 228) — sitemaps are public, always exclude:

```ts
export async function listEntityPaths(): Promise<{ slug: string; kind: string }[]> {
  return prisma.entity.findMany({
    where: { kind: { in: ["item", "environment", "trampler-part"] }, disabled: false },
    select: { slug: true, kind: true },
    orderBy: { slug: "asc" },
  });
}
```

`getTechTree` (line 368) — defensive (tech-nodes have no detail page so can't be disabled via UI today, but keep them consistent):

```ts
    where: { kind: "tech-node", disabled: false },
```

- [ ] **Step 3: Exclude disabled from the search index**

In `src/app/api/search-index/route.ts`, add `disabled: false` to both `findMany` where clauses (the `kind: "item"` query and the `kind: "environment"` query):

```ts
    prisma.entity.findMany({
      where: { kind: "item", disabled: false },
      select: { slug: true, name: true, category: true, derivedName: true },
      orderBy: { name: "asc" },
    }),
    prisma.entity.findMany({
      where: { kind: "environment", category: { in: ["loot-containers", "landmarks"] }, disabled: false },
      select: { slug: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Existing callers of `listItems`/`listEnvEntities`/`listTramplerParts` still compile because `isAdmin` defaults to `false`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts src/app/api/search-index/route.ts
git commit -m "feat(visibility): filter disabled entities from lists, facets, search, sitemap"
```

---

## Task 4: Pure admin-entity helpers (image diff + create builder)

**Files:**
- Create: `src/lib/admin-entity.ts`
- Create: `src/lib/admin-entity.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/admin-entity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { typeForKind, buildImageChanges, buildEntityCreateData } from "./admin-entity";

describe("typeForKind", () => {
  it("maps Entity.kind to the legacy proposal type", () => {
    expect(typeForKind("item")).toBe("item");
    expect(typeForKind("environment")).toBe("envEntity");
    expect(typeForKind("trampler-part")).toBe("tramplerPart");
  });
  it("throws on a non-creatable kind", () => {
    expect(() => typeForKind("tech-node")).toThrow();
  });
});

describe("buildImageChanges", () => {
  it("returns null when nothing changed", () => {
    expect(buildImageChanges({ icon: "/a.png", imageAlt: "A" }, { icon: "/a.png", imageAlt: "A" })).toBeNull();
  });
  it("records only the changed image fields with old/new", () => {
    expect(buildImageChanges({ icon: "/a.png", imageAlt: null }, { icon: "/b.png", imageAlt: "B" })).toEqual({
      icon: { old: "/a.png", new: "/b.png" },
      imageAlt: { old: null, new: "B" },
    });
  });
  it("treats empty string as clearing to null", () => {
    expect(buildImageChanges({ icon: "/a.png", imageAlt: "A" }, { icon: "", imageAlt: "" })).toEqual({
      icon: { old: "/a.png", new: null },
      imageAlt: { old: "A", new: null },
    });
  });
});

describe("buildEntityCreateData", () => {
  it("builds an item with stat split + curated flag", () => {
    const out = buildEntityCreateData("item", {
      slug: "test-rifle", name: "Test Rifle", category: "weapons",
      icon: "/icons/x.png", imageAlt: "", description: "A gun [[ammo]]",
      rarity: "Rare", damage: "42", storageStack: "",
    });
    expect(out.statRelation).toBe("itemStats");
    expect(out.entityData).toMatchObject({
      slug: "test-rifle", kind: "item", name: "Test Rifle", category: "weapons",
      icon: "/icons/x.png", description: "A gun [[ammo]]", rarity: "Rare", curated: true,
    });
    expect(out.entityData.imageAlt ?? null).toBeNull();
    expect(out.statData).toMatchObject({ damage: 42 });
    expect("storageStack" in out.statData).toBe(false); // blank → omitted
  });

  it("builds an environment entity with no stat extension", () => {
    const out = buildEntityCreateData("environment", {
      slug: "test-crate", name: "Test Crate", category: "loot-containers",
    });
    expect(out.statRelation).toBeNull();
    expect(out.entityData).toMatchObject({ kind: "environment", curated: true });
    expect(Object.keys(out.statData)).toHaveLength(0);
  });

  it("rejects a bad slug", () => {
    expect(() => buildEntityCreateData("item", { slug: "Bad Slug!", name: "x", category: "weapons" })).toThrow(/slug/i);
  });

  it("rejects a category not valid for the kind", () => {
    expect(() => buildEntityCreateData("item", { slug: "ok", name: "x", category: "loot-containers" })).toThrow(/category/i);
  });

  it("rejects a missing name", () => {
    expect(() => buildEntityCreateData("item", { slug: "ok", name: "  ", category: "weapons" })).toThrow(/name/i);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/admin-entity.test.ts`
Expected: FAIL — `Cannot find module './admin-entity'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/admin-entity.ts`:

```ts
import { editableFields, fieldDef, coerceValue, baseType } from "./proposal-schema";
import { isItemCategory, isEnvCategory, isTramplerCategory } from "./taxonomy";

/** Creatable Entity.kind → legacy proposal target-type name (the vocabulary used by
 *  EDITABLE_FIELDS / Proposal.targetType). Tech-nodes are not creatable. */
const TYPE_FOR_KIND: Record<string, "item" | "envEntity" | "tramplerPart"> = {
  item: "item",
  environment: "envEntity",
  "trampler-part": "tramplerPart",
};

export const CREATABLE_KINDS = ["item", "environment", "trampler-part"] as const;
export type CreatableKind = (typeof CREATABLE_KINDS)[number];

export function typeForKind(kind: string): "item" | "envEntity" | "tramplerPart" {
  const t = TYPE_FOR_KIND[kind];
  if (!t) throw new Error(`Kind "${kind}" cannot be created here.`);
  return t;
}

/** Whitelisted fields stored on the Entity row itself; all other editable fields for
 *  item/trampler targets live on the per-kind stat extension table. Mirrors the set in
 *  proposal-apply.ts (kept local so this module stays pure / server-import-free). */
const ENTITY_OWN_FIELDS = new Set(["name", "description", "category", "rarity", "sourceUrl"]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ImageFields = { icon: string | null; imageAlt: string | null };
type ChangeMap = Record<string, { old: string | null; new: string | null }>;

/** Normalize a raw image value: trim; empty → null. */
function normImage(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Diff current vs submitted image fields. Returns a {field:{old,new}} map of only the
 *  changed fields, or null if nothing changed. Used both to update the row and as the
 *  `changes` payload of the pre-applied lock proposal. */
export function buildImageChanges(
  current: ImageFields,
  submitted: { icon: string; imageAlt: string },
): ChangeMap | null {
  const next = { icon: normImage(submitted.icon), imageAlt: normImage(submitted.imageAlt) };
  const out: ChangeMap = {};
  if (next.icon !== current.icon) out.icon = { old: current.icon, new: next.icon };
  if (next.imageAlt !== current.imageAlt) out.imageAlt = { old: current.imageAlt, new: next.imageAlt };
  return Object.keys(out).length === 0 ? null : out;
}

function categoryOkForKind(kind: CreatableKind, category: string): boolean {
  if (kind === "item") return isItemCategory(category);
  if (kind === "environment") return isEnvCategory(category);
  return isTramplerCategory(category);
}

export interface EntityCreateData {
  entityData: Record<string, string | number | null>;
  statData: Record<string, string | number | null>;
  statRelation: "itemStats" | "tramplerStats" | null;
}

/** Validate + shape raw form values into a create payload split between the Entity row
 *  and its stat extension. Throws Error (message shown to admin) on invalid input. The
 *  row is always marked `curated: true` so the seed never prunes it. */
export function buildEntityCreateData(
  kind: string,
  raw: Record<string, string | undefined>,
): EntityCreateData {
  if (!(CREATABLE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Kind "${kind}" cannot be created here.`);
  }
  const k = kind as CreatableKind;
  const type = typeForKind(k);

  const slug = (raw.slug ?? "").trim();
  if (!SLUG_RE.test(slug)) throw new Error("Slug must be lowercase letters, digits, and single hyphens (e.g. test-rifle).");

  const name = (raw.name ?? "").trim();
  if (!name) throw new Error("Name is required.");

  const category = (raw.category ?? "").trim();
  if (!categoryOkForKind(k, category)) throw new Error(`Category "${category}" is not valid for ${kind}.`);

  const entityData: Record<string, string | number | null> = {
    slug,
    kind: k,
    name,
    category,
    curated: true,
    icon: normImage(raw.icon),
    imageAlt: normImage(raw.imageAlt),
  };
  const statData: Record<string, string | number | null> = {};
  const splitToStats = k === "item" || k === "trampler-part";

  // Walk the kind's whitelisted scalar fields; name/category already handled above.
  for (const f of editableFields(type)) {
    if (f.field === "name" || f.field === "category") continue;
    const def = fieldDef(type, f.field)!;
    const value = coerceValue(baseType(def), String(raw[f.field] ?? ""));
    if (value === null) continue; // omit blanks so defaults / nulls apply cleanly
    if (!splitToStats || ENTITY_OWN_FIELDS.has(f.field)) entityData[f.field] = value;
    else statData[f.field] = value;
  }

  const statRelation = k === "item" ? "itemStats" : k === "trampler-part" ? "tramplerStats" : null;
  return { entityData, statData, statRelation };
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/lib/admin-entity.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-entity.ts src/lib/admin-entity.test.ts
git commit -m "feat(admin): pure helpers for image diff and entity-create payloads"
```

---

## Task 5: Admin server actions

**Files:**
- Create: `src/app/admin/entities/actions.ts`

These are exercised end-to-end via the UI tasks; there are no DB-backed unit tests (this codebase's tests are pure-function only). The pure logic they depend on is already tested in Task 4.

- [ ] **Step 1: Implement the actions**

Create `src/app/admin/entities/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { typeForKind, buildImageChanges, buildEntityCreateData } from "@/lib/admin-entity";
import { entityHref } from "@/lib/entity-links";

/** Detail-page path for an entity by kind+slug, for revalidation. Falls back to "/". */
function detailPath(kind: string, slug: string): string {
  return entityHref(kind, slug) ?? "/";
}

/** List path for a kind, for revalidation. */
function listPath(kind: string): string {
  return kind === "item" ? "/items" : kind === "environment" ? "/environment" : "/tramplers";
}

/** Set/clear an entity's image + alt text. Applies the change directly AND records a
 *  pre-applied `edit` proposal whose `changes` keys (`icon`/`imageAlt`) feed the seed's
 *  lock map, so a future re-seed won't overwrite the icon. */
export async function setEntityImage(formData: FormData) {
  const session = await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  const icon = String(formData.get("icon") ?? "");
  const imageAlt = String(formData.get("imageAlt") ?? "");

  const entity = await prisma.entity.findUnique({
    where: { slug },
    select: { kind: true, icon: true, imageAlt: true },
  });
  if (!entity) throw new Error("Entity not found.");

  const changes = buildImageChanges({ icon: entity.icon, imageAlt: entity.imageAlt }, { icon, imageAlt });
  if (changes) {
    const targetType = typeForKind(entity.kind);
    await prisma.$transaction([
      prisma.entity.update({
        where: { slug },
        data: {
          icon: changes.icon ? changes.icon.new : undefined,
          imageAlt: changes.imageAlt ? changes.imageAlt.new : undefined,
        },
      }),
      prisma.proposal.create({
        data: {
          kind: "edit",
          status: "applied",
          targetType,
          targetSlug: slug,
          changes: changes as object,
          note: "Admin image update",
          proposerId: session.steamId,
          reviewedById: session.steamId,
          reviewedAt: new Date(),
        },
      }),
    ]);
    revalidatePath(detailPath(entity.kind, slug));
    revalidatePath(listPath(entity.kind));
  }
  redirect(detailPath(entity.kind, slug));
}

/** Toggle an entity's disabled flag. No lock record needed — the seed never writes
 *  the `disabled` column. */
export async function setEntityDisabled(formData: FormData) {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  const disabled = String(formData.get("disabled") ?? "") === "true";

  const entity = await prisma.entity.findUnique({ where: { slug }, select: { kind: true } });
  if (!entity) throw new Error("Entity not found.");

  await prisma.entity.update({ where: { slug }, data: { disabled } });
  revalidatePath(detailPath(entity.kind, slug));
  revalidatePath(listPath(entity.kind));
  redirect(detailPath(entity.kind, slug));
}

/** Create a new entity (item / environment / trampler-part), curated so the seed never
 *  prunes it. Validates + partitions via buildEntityCreateData, then inserts with the
 *  nested stat sub-row for item/trampler. */
export async function createEntity(formData: FormData) {
  await requireAdmin();
  const kind = String(formData.get("kind") ?? "");

  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value;
  }

  const { entityData, statData, statRelation } = buildEntityCreateData(kind, raw);

  const existing = await prisma.entity.findUnique({ where: { slug: entityData.slug as string }, select: { slug: true } });
  if (existing) throw new Error(`Slug "${entityData.slug}" is already taken.`);

  const data: Record<string, unknown> = { ...entityData };
  if (statRelation && Object.keys(statData).length > 0) {
    data[statRelation] = { create: statData };
  }
  await prisma.entity.create({ data: data as never });

  revalidatePath(listPath(kind));
  redirect(detailPath(kind, entityData.slug as string));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/entities/actions.ts
git commit -m "feat(admin): server actions for image, disable, and create entity"
```

---

## Task 6: EntityDetail + EntityCard support for disabled / admin controls

**Files:**
- Modify: `src/components/EntityDetail.tsx`
- Modify: `src/components/EntityCard.tsx`

- [ ] **Step 1: Extend EntityDetailProps**

In `src/components/EntityDetail.tsx`, add two optional props to the `EntityDetailProps` interface (after `lastEditedBy`):

```ts
  /** Renders a "Disabled" badge near the title (admins only ever see disabled rows). */
  disabled?: boolean;
  /** Admin-only control strip (image edit + disable toggle), shown below the header. */
  adminControls?: React.ReactNode;
```

- [ ] **Step 2: Destructure and render them**

In the `EntityDetail` function, add `disabled` and `adminControls` to the destructured params.

In the header block, change the badges line so a "Disabled" pill is prepended when `disabled` is true. Replace:

```tsx
          {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
```

with:

```tsx
          {(badges || disabled) && (
            <div className="flex flex-wrap items-center gap-2">
              {disabled && (
                <span className="border border-warning/60 bg-warning/10 px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-warning">
                  Disabled
                </span>
              )}
              {badges}
            </div>
          )}
```

Then, immediately after the closing `</header>` tag, add:

```tsx
      {adminControls && (
        <div className="border border-border-strong bg-card-elevated p-4">{adminControls}</div>
      )}
```

> If `text-warning` / `border-warning` are not defined tokens in this theme, use `text-primary` / `border-primary` instead (check `src/app/globals.css` or `tailwind` theme for the available semantic colors before committing).

- [ ] **Step 3: Add a `disabled` pill to EntityCard**

In `src/components/EntityCard.tsx`, add to `EntityCardData` (after `stats`):

```ts
  /** Admin browse only: marks the row as admin-hidden. */
  disabled?: boolean;
```

In the name cell, after the `<span class="truncate ...">{entity.name}</span>` line, render a pill when disabled. Change the name `<span>` block to include:

```tsx
          <span className="truncate font-display text-base font-semibold leading-tight text-foreground group-hover:text-primary-hover">
            {entity.name}
            {entity.disabled && (
              <span className="ml-2 align-middle border border-primary/60 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.05em] text-primary">
                Disabled
              </span>
            )}
          </span>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/EntityDetail.tsx src/components/EntityCard.tsx
git commit -m "feat(admin): disabled badge + admin-controls slot in EntityDetail/EntityCard"
```

---

## Task 7: AdminEntityControls client component

**Files:**
- Create: `src/components/AdminEntityControls.tsx`

- [ ] **Step 1: Implement the component**

The disable button needs a confirm dialog, but `setEntityDisabled` is a `<form action>` — so the dialog's `onConfirm` calls `formRef.current?.requestSubmit()` on a hidden-input form. The image edit is a plain `<form action={setEntityImage}>` with a live preview driven by local state.

Create `src/components/AdminEntityControls.tsx`:

```tsx
"use client";

import { useState, useRef } from "react";
import { setEntityImage, setEntityDisabled } from "@/app/admin/entities/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { labelCls, inputCls } from "@/components/form-styles";

/** Admin-only strip on an entity detail page: paste an image URL/path (with a live
 *  preview), and disable/enable the entity. Both post to server actions. */
export function AdminEntityControls({
  slug,
  icon,
  imageAlt,
  disabled,
}: {
  slug: string;
  icon: string | null;
  imageAlt: string | null;
  disabled: boolean;
}) {
  const [preview, setPreview] = useState(icon ?? "");

  return (
    <div className="space-y-4">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Admin controls
      </p>

      <form action={setEntityImage} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <div className="flex items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center border border-border bg-card" aria-hidden>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="size-[80%] object-contain" />
            ) : (
              <span className="text-dim">▦</span>
            )}
          </span>
          <div className="flex-1 space-y-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Image URL / path</span>
              <input
                name="icon"
                defaultValue={icon ?? ""}
                onChange={(e) => setPreview(e.target.value.trim())}
                placeholder="/icons/example.png"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Image alt text</span>
              <input name="imageAlt" defaultValue={imageAlt ?? ""} className={inputCls} />
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm">Save image</Button>
        </div>
      </form>

      <DisableToggle slug={slug} disabled={disabled} />
    </div>
  );
}

function DisableToggle({ slug, disabled }: { slug: string; disabled: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex items-center justify-between border-t border-border pt-3">
      <span className="text-sm text-muted-foreground">
        {disabled ? "Hidden from the public." : "Visible to everyone."}
      </span>
      <form action={setEntityDisabled} ref={formRef}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
        {disabled ? (
          <Button type="submit" size="sm" variant="default">Enable</Button>
        ) : (
          <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>
            Disable
          </Button>
        )}
      </form>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Disable this entity?"
        description="It will be hidden from the public. Admins can still see and re-enable it."
        confirmLabel="Disable"
        destructive
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminEntityControls.tsx
git commit -m "feat(admin): AdminEntityControls (image edit + disable toggle)"
```

---

## Task 8: Wire admin controls + 404 into the three detail pages

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`
- Modify: `src/app/environment/[slug]/page.tsx`
- Modify: `src/app/tramplers/[slug]/page.tsx`

The pattern is identical for all three. Below is the items page; apply the same edits to environment and tramplers, adjusting the variable name (`item` / `entity` / `part`) and the `suggest.type` value already present in each file.

- [ ] **Step 1: Items detail page**

In `src/app/items/[slug]/page.tsx`:

Add imports:

```ts
import { sessionIsAdmin } from "@/lib/auth";
import { AdminEntityControls } from "@/components/AdminEntityControls";
```

After `if (!item) notFound();` (line 52), add the admin-aware visibility gate:

```ts
  const admin = await sessionIsAdmin();
  if (item.disabled && !admin) notFound();
```

In the `<EntityDetail ... />` props, add:

```tsx
      disabled={item.disabled}
      adminControls={
        admin ? (
          <AdminEntityControls slug={item.slug} icon={item.icon} imageAlt={item.imageAlt} disabled={item.disabled} />
        ) : undefined
      }
```

- [ ] **Step 2: Environment detail page**

In `src/app/environment/[slug]/page.tsx`, add the same imports. After `if (!entity) notFound();` (line 45) add:

```ts
  const admin = await sessionIsAdmin();
  if (entity.disabled && !admin) notFound();
```

Add to `<EntityDetail>`:

```tsx
      disabled={entity.disabled}
      adminControls={
        admin ? (
          <AdminEntityControls slug={entity.slug} icon={entity.icon} imageAlt={entity.imageAlt} disabled={entity.disabled} />
        ) : undefined
      }
```

- [ ] **Step 3: Tramplers detail page**

In `src/app/tramplers/[slug]/page.tsx`, add the same imports. After the part-not-found `notFound()` guard add:

```ts
  const admin = await sessionIsAdmin();
  if (part.disabled && !admin) notFound();
```

Add to `<EntityDetail>`:

```tsx
      disabled={part.disabled}
      adminControls={
        admin ? (
          <AdminEntityControls slug={part.slug} icon={part.icon} imageAlt={part.imageAlt} disabled={part.disabled} />
        ) : undefined
      }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`disabled`, `icon`, `imageAlt` are all on the entity rows returned by the detail queries.)

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. As an admin (your Steam id in `ADMIN_STEAM_IDS`), open an item page: the admin control strip appears below the header. Paste a different `/icons/...` path → preview updates → Save → icon changes and "Last edited by" shows you. Click Disable → confirm → page still loads for you with a "Disabled" badge. Open the same URL in a logged-out/private window → 404.

- [ ] **Step 6: Commit**

```bash
git add src/app/items/[slug]/page.tsx src/app/environment/[slug]/page.tsx src/app/tramplers/[slug]/page.tsx
git commit -m "feat(admin): admin controls + non-admin 404 on disabled entity pages"
```

---

## Task 9: Thread isAdmin + disabled pill into the three list pages

**Files:**
- Modify: `src/app/items/page.tsx`
- Modify: `src/app/environment/page.tsx`
- Modify: `src/app/tramplers/page.tsx`

- [ ] **Step 1: Items list page**

In `src/app/items/page.tsx`:

Add import:

```ts
import { sessionIsAdmin } from "@/lib/auth";
```

Change the items fetch (line 61) to pass admin status:

```ts
  const admin = await sessionIsAdmin();
  const items = await listItems(filter, admin);
```

In the `EntityCard` mapping (around line 144), add `disabled` to the passed `entity` object:

```tsx
                  entity={{
                    slug: i.slug,
                    name: i.name,
                    href: `/items/${i.slug}`,
                    icon: i.icon,
                    rarity: i.rarity,
                    typeLabel: itemClass(i.slug, i.name, i.ammoName),
                    disabled: i.disabled,
                  }}
```

- [ ] **Step 2: Environment list page**

In `src/app/environment/page.tsx`: add the `sessionIsAdmin` import; change `const entities = await listEnvEntities(category);` to:

```ts
  const admin = await sessionIsAdmin();
  const entities = await listEnvEntities(category, admin);
```

Add `disabled: e.disabled` (use whatever the map variable is named in this file — confirm by reading the `EntityCard` block around line 84) to the `EntityCard` `entity` object.

- [ ] **Step 3: Tramplers list page**

In `src/app/tramplers/page.tsx`: add the `sessionIsAdmin` import; change `const parts = await listTramplerParts(category);` to:

```ts
  const admin = await sessionIsAdmin();
  const parts = await listTramplerParts(category, admin);
```

Add `disabled: <var>.disabled` to the `EntityCard` `entity` object (line ~86).

- [ ] **Step 4: Typecheck + smoke test**

Run: `npx tsc --noEmit` → no errors.
Run `npm run dev`: a disabled item shows in the list **with a "Disabled" pill** when you're an admin, and is **absent** when logged out.

- [ ] **Step 5: Commit**

```bash
git add src/app/items/page.tsx src/app/environment/page.tsx src/app/tramplers/page.tsx
git commit -m "feat(admin): show disabled entities (with pill) to admins in browse lists"
```

---

## Task 10: Add-entity form page

**Files:**
- Create: `src/app/admin/entities/new/page.tsx`
- Create: `src/components/CreateEntityForm.tsx`
- Modify: `src/app/admin/proposals/page.tsx` (add a nav link to the new form)

- [ ] **Step 1: Build the server page**

Create `src/app/admin/entities/new/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth";
import { CreateEntityForm } from "@/components/CreateEntityForm";
import { editableFields } from "@/lib/proposal-schema";
import { ITEM_CATEGORY_SLUGS, ENV_CATEGORY_SLUGS, TRAMPLER_CATEGORY_SLUGS, categoryLabel } from "@/lib/taxonomy";
import { KNOWN_RARITY_NAMES } from "@/lib/rarity";

export const metadata = { title: "Add entity" };

export default async function NewEntityPage() {
  await requireAdmin();

  // Field definitions + category option lists per creatable kind, passed to the client form.
  const config = {
    item: { fields: editableFields("item"), categories: ITEM_CATEGORY_SLUGS },
    environment: { fields: editableFields("envEntity"), categories: ENV_CATEGORY_SLUGS },
    "trampler-part": { fields: editableFields("tramplerPart"), categories: TRAMPLER_CATEGORY_SLUGS },
  };
  const categoryOptions = Object.fromEntries(
    Object.entries(config).map(([kind, c]) => [
      kind,
      c.categories.map((slug) => ({ value: slug, label: categoryLabel(slug) })),
    ]),
  );

  return (
    <article className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Add entity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a curated row immediately. Curated rows are never overwritten or pruned by a re-seed.
        </p>
      </div>
      <CreateEntityForm
        config={config}
        categoryOptions={categoryOptions}
        rarities={KNOWN_RARITY_NAMES.map((n) => ({ value: n, label: n }))}
      />
    </article>
  );
}
```

> Verify the export names `ITEM_CATEGORY_SLUGS`, `ENV_CATEGORY_SLUGS`, `TRAMPLER_CATEGORY_SLUGS`, `categoryLabel` in `src/lib/taxonomy.ts` and `KNOWN_RARITY_NAMES` in `src/lib/rarity.ts` (all referenced by `proposal-schema.ts`, so they exist) before finalizing imports.

- [ ] **Step 2: Build the client form**

Create `src/components/CreateEntityForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createEntity } from "@/app/admin/entities/actions";
import type { EditableField, SelectOption } from "@/lib/proposal-schema";
import { Button } from "@/components/ui/button";
import { labelCls, inputCls, textareaCls } from "@/components/form-styles";

type Kind = "item" | "environment" | "trampler-part";

const KIND_LABELS: Record<Kind, string> = {
  item: "Item",
  environment: "Environment",
  "trampler-part": "Trampler part",
};

export function CreateEntityForm({
  config,
  categoryOptions,
  rarities,
}: {
  config: Record<Kind, { fields: EditableField[]; categories: string[] }>;
  categoryOptions: Record<Kind, SelectOption[]>;
  rarities: SelectOption[];
}) {
  const [kind, setKind] = useState<Kind>("item");
  // name + category are rendered explicitly; skip them in the generic field loop.
  const extraFields = config[kind].fields.filter((f) => f.field !== "name" && f.field !== "category");

  return (
    <form action={createEntity} className="space-y-4">
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Kind</span>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={inputCls}>
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Slug</span>
        <input name="slug" required placeholder="test-rifle" className={inputCls} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Name</span>
        <input name="name" required className={inputCls} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Category</span>
        <select name="category" required className={inputCls} defaultValue="">
          <option value="" disabled>Select a category…</option>
          {categoryOptions[kind].map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Image URL / path</span>
        <input name="icon" placeholder="/icons/example.png" className={inputCls} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Image alt text</span>
        <input name="imageAlt" className={inputCls} />
      </label>

      {extraFields.map((f) => (
        <label key={f.field} className="flex flex-col gap-1.5">
          <span className={labelCls}>{f.label}</span>
          {f.field === "rarity" ? (
            <select name="rarity" className={inputCls} defaultValue="">
              <option value="">—</option>
              {rarities.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : f.type === "text" ? (
            <textarea name={f.field} rows={3} className={textareaCls} />
          ) : (
            <input name={f.field} type={f.type === "int" ? "number" : "text"} className={inputCls} />
          )}
        </label>
      ))}

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit">Create entity</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Link to the form from the admin proposals page**

In `src/app/admin/proposals/page.tsx`, add a link to `/admin/entities/new` near the page heading (match the file's existing markup/styles — read it first). Minimal example to place beside the title:

```tsx
import Link from "next/link";
// ...near the heading:
<Link href="/admin/entities/new" className="border border-border-strong px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.05em] hover:border-primary hover:text-primary-hover">
  Add entity
</Link>
```

- [ ] **Step 4: Typecheck + smoke test**

Run: `npx tsc --noEmit` → no errors.
Run `npm run dev`, go to `/admin/entities/new`. Switching the Kind selector swaps the category options and the extra stat fields. Create an item with a slug/name/category → redirected to its new detail page; it renders, and (Task 8) shows the admin strip. Confirm a non-admin gets redirected away from `/admin/entities/new`.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/entities/new/page.tsx src/components/CreateEntityForm.tsx src/app/admin/proposals/page.tsx
git commit -m "feat(admin): add-entity form at /admin/entities/new"
```

---

## Task 11: Seed-safety verification + final checks

This is the task that proves the user's core requirement: nothing is lost on re-seed. It runs against a **throwaway/local** DB only — never the live one.

- [ ] **Step 1: Capture the pre-seed state**

With the dev DB, perform three admin actions via the UI (or `tsx` script): (a) create a curated entity `qa-admin-widget`; (b) change an existing scraped item's icon to `/icons/__qa_marker.png`; (c) disable an existing entity.

Record the three slugs.

- [ ] **Step 2: Run a forced re-seed**

Run: `npm run db:seed:force`
Expected: completes; log line `Preserved N contributor-edited field(s) ...` includes the icon edit.

- [ ] **Step 3: Assert nothing was lost**

Run (substitute your three slugs):

```bash
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); (async()=>{ const a=await p.entity.findUnique({where:{slug:'qa-admin-widget'},select:{slug:true,curated:true}}); const b=await p.entity.findUnique({where:{slug:'<edited-item-slug>'},select:{icon:true}}); const c=await p.entity.findUnique({where:{slug:'<disabled-slug>'},select:{disabled:true}}); console.log({a,b,c}); await p.\$disconnect(); })()"
```

Expected: `a` is non-null with `curated:true`; `b.icon === "/icons/__qa_marker.png"`; `c.disabled === true`. If any fails, STOP — the seed-safety guarantee is broken; debug before proceeding (most likely the lock proposal's `changes` key name doesn't match the seed's identity field name `icon`).

- [ ] **Step 4: Full test suite + lint + build**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass. `npm test` includes the new `visibility.test.ts` and `admin-entity.test.ts`.

- [ ] **Step 5: Clean up QA rows (optional, dev DB)**

Delete `qa-admin-widget` and re-enable / revert the QA-edited rows if you want a clean dev DB. (No commit needed — data only.)

- [ ] **Step 6: Final commit (if any cleanup edits were made to code)**

```bash
git add -A
git commit -m "chore(admin): verification pass for admin entity management"
```

---

## Self-Review

**Spec coverage:**
- Schema `disabled` column → Task 1. ✓
- Seed-safety: add=curated (Task 5/4), image=lock proposal (Task 5), disable=column seed ignores (Task 1) → verified Task 11. ✓
- Visibility (non-admin excluded from lists/search/sitemap, 404 detail; admin sees with badge) → Tasks 3, 8, 9. ✓
- `visibilityWhere` helper + admin-aware queries → Tasks 2, 3. ✓
- Server actions setEntityImage/setEntityDisabled/createEntity → Task 5. ✓
- Admin control strip on detail pages → Tasks 7, 8. ✓
- Add-entity form (item/env/trampler, kind selector, reuse EDITABLE_FIELDS) → Task 10. ✓
- Tech-nodes excluded from creation → `CREATABLE_KINDS` (Task 4); add-form only offers three kinds (Task 10). ✓
- No EDITABLE_FIELDS change / image not routed through applyProposal → confirmed (actions write pre-applied records, Task 5; helper keeps icon entity-owned, Task 4). ✓
- SteamUser FK satisfied (admin row from login) → noted Task 5. ✓
- Tests: visibility + admin-entity unit tests + seed-safety integration → Tasks 2, 4, 11. ✓

**Placeholder scan:** No `TODO`/`TBD`/unfilled code. Theme-token caveats (`text-warning`) are flagged inline with a concrete fallback (`text-primary`). "Verify export name X before finalizing" notes (taxonomy/rarity constants, list-page map variable names) are confirmation steps against real existing modules, not placeholders — the names are already imported by `proposal-schema.ts`/the list pages, so they resolve.

**Type consistency:** `visibilityWhere(isAdmin: boolean)`, `typeForKind`, `buildImageChanges`, `buildEntityCreateData` (returning `{entityData, statData, statRelation}`) are used with identical signatures in Tasks 3/5/8/9. `setEntityImage`/`setEntityDisabled`/`createEntity` all take `FormData`, matching the existing `submitEdit(formData)` convention and the `<form action={...}>` usage in Tasks 7 and 10. `EntityCardData.disabled?` and `EntityDetailProps.disabled?`/`adminControls?` are defined in Task 6 and consumed in Tasks 8/9.
