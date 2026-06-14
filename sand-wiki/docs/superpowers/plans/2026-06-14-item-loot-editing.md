# Item-side Loot Editing ("Found in") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a contributor edit which containers/landmarks an item is found in, from the item's Edit Tabs page (the inverse of the existing container→item loot editor), and include landmarks in the item's loot display.

**Architecture:** A new proposal kind `loot_sources_edit` mirrors the existing `links_edit` pipeline but edits an item's *incoming* loot links. It reuses the pure link helpers and the `LinkEditForm` UI (parameterized), with a dedicated submit action and a dedicated apply function that reconciles links across multiple sources via a pure, unit-tested planner (`diffLootSources`) keyed by source + tier.

**Tech Stack:** Next.js (App Router, server actions), Prisma 6, React, Vitest, TypeScript. Spec: `docs/superpowers/specs/2026-06-14-item-loot-editing-design.md`.

**Inversion convention (read this first):** For `loot_sources_edit` proposals, each `LinkRowDraft.targetSlug` holds the **source** (container/landmark) slug, and `name` holds the source's display name. This is the only semantic difference from `links_edit` rows.

---

## Task 1: Pure helpers — `incomingLootToDrafts` and `diffLootSources`

**Files:**
- Modify: `sand-wiki/src/lib/link-proposal.ts`
- Test: `sand-wiki/src/lib/link-proposal.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `sand-wiki/src/lib/link-proposal.test.ts` (add the new symbols to the existing import from `./link-proposal` at the top of the file):

```ts
import {
  incomingLootToDrafts,
  diffLootSources,
  type ExistingLootLink,
} from "./link-proposal";

describe("incomingLootToDrafts", () => {
  it("maps source slug→targetSlug and source name→name, sorted by sortOrder", () => {
    const rows = [
      { source: { slug: "ammo-crate", name: "Ammo Crate" }, tier: "Rare", value1: "1-2", sortOrder: 1 },
      { source: { slug: "supply-cache", name: "Supply Cache" }, tier: null, value1: null, sortOrder: 0 },
    ];
    expect(incomingLootToDrafts(rows)).toEqual([
      { targetSlug: "supply-cache", name: "Supply Cache", amount: null, tier: null, value1: null },
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Rare", value1: "1-2" },
    ]);
  });
});

describe("diffLootSources", () => {
  const existing: ExistingLootLink[] = [
    { id: "l1", sourceSlug: "ammo-crate", tier: "Rare", value1: "1-2", sortOrder: 0 },
    { id: "l2", sourceSlug: "supply-cache", tier: null, value1: null, sortOrder: 1 },
  ];

  it("creates new (source,tier) pairs, deletes missing ones", () => {
    const newRows = [
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Rare", value1: "1-2" }, // same
      { targetSlug: "field-box", name: "Field Box", amount: null, tier: "Normal", value1: "1" },    // added
    ];
    const w = diffLootSources(existing, newRows);
    expect(w.creates).toEqual([
      { targetSlug: "field-box", name: "Field Box", amount: null, tier: "Normal", value1: "1" },
    ]);
    expect(w.updates).toEqual([]);
    expect(w.deletes).toEqual(["l2"]); // supply-cache removed
  });

  it("treats a value1-only change as an in-place update", () => {
    const newRows = [
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Rare", value1: "3-4" },
      { targetSlug: "supply-cache", name: "Supply Cache", amount: null, tier: null, value1: null },
    ];
    const w = diffLootSources(existing, newRows);
    expect(w.creates).toEqual([]);
    expect(w.updates).toEqual([{ id: "l1", value1: "3-4" }]);
    expect(w.deletes).toEqual([]);
  });

  it("treats a tier change as delete-old + create-new (tier is part of the key)", () => {
    const newRows = [
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Very Rare", value1: "1-2" },
      { targetSlug: "supply-cache", name: "Supply Cache", amount: null, tier: null, value1: null },
    ];
    const w = diffLootSources(existing, newRows);
    expect(w.creates).toEqual([
      { targetSlug: "ammo-crate", name: "Ammo Crate", amount: null, tier: "Very Rare", value1: "1-2" },
    ]);
    expect(w.deletes).toEqual(["l1"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sand-wiki && npx vitest run src/lib/link-proposal.test.ts`
Expected: FAIL — `incomingLootToDrafts`/`diffLootSources`/`ExistingLootLink` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `sand-wiki/src/lib/link-proposal.ts`:

```ts
/** A loaded incoming loot link with its SOURCE resolved to slug + name. The inverse
 *  of RawLink: identifies the source (container/landmark) rather than the target. */
interface RawIncomingLoot {
  source: { slug: string; name: string };
  tier: string | null;
  value1: string | null;
  sortOrder: number;
}

/** Flatten an item's incoming loot links into LinkRowDraft[] for the item-side editor.
 *  Per the inversion convention, `targetSlug` holds the SOURCE slug and `name` the
 *  source name; loot has no amount. Sorted by sortOrder. */
export function incomingLootToDrafts(rows: RawIncomingLoot[]): LinkRowDraft[] {
  return [...rows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      targetSlug: r.source.slug,
      name: r.source.name,
      amount: null,
      tier: r.tier,
      value1: r.value1,
    }));
}

/** An existing incoming loot link, as the apply path loads it (source resolved to slug). */
export interface ExistingLootLink {
  id: string;
  sourceSlug: string;
  tier: string | null;
  value1: string | null;
  sortOrder: number;
}

/** DB-write plan to reconcile an item's incoming loot links from `existing` to `newRows`. */
export interface LootSourceWrites {
  creates: LinkRowDraft[];
  updates: { id: string; value1: string | null }[];
  deletes: string[];
}

/** Key an incoming-loot row by source slug + tier, so the same source listing this item
 *  at two tiers stays two distinct rows. */
const lootKey = (sourceSlug: string | null, tier: string | null): string =>
  `${sourceSlug ?? ""}|${tier ?? ""}`;

/** Plan the writes to reconcile incoming loot links. Keyed by source+tier; only value1
 *  can change in place (tier being part of the key, a tier change is delete + create). */
export function diffLootSources(existing: ExistingLootLink[], newRows: LinkRowDraft[]): LootSourceWrites {
  const existingByKey = new Map(existing.map((e) => [lootKey(e.sourceSlug, e.tier), e]));
  const newKeys = new Set(newRows.map((r) => lootKey(r.targetSlug, r.tier)));

  const creates: LinkRowDraft[] = [];
  const updates: { id: string; value1: string | null }[] = [];
  for (const r of newRows) {
    const ex = existingByKey.get(lootKey(r.targetSlug, r.tier));
    if (!ex) creates.push(r);
    else if (ex.value1 !== r.value1) updates.push({ id: ex.id, value1: r.value1 });
  }
  const deletes = existing
    .filter((e) => !newKeys.has(lootKey(e.sourceSlug, e.tier)))
    .map((e) => e.id);
  return { creates, updates, deletes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sand-wiki && npx vitest run src/lib/link-proposal.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/link-proposal.ts sand-wiki/src/lib/link-proposal.test.ts
git commit -m "feat(wiki): loot-source diff helpers for item-side loot editing"
```

---

## Task 2: Queries — incoming loot, source list, landmark display fix

**Files:**
- Modify: `sand-wiki/src/lib/queries.ts` (add two functions; widen `getCratesContaining` near line 171-178)

No unit test: queries are DB-bound and untested by convention in this repo. Verified via typecheck here and manual verification in Task 8.

- [ ] **Step 1: Add `getIncomingLootLinks` and `listLootSources`**

Add to `sand-wiki/src/lib/queries.ts` (near `getCratesContaining`):

```ts
/** An item's incoming loot links, resolved to their source slug + name (ordered by
 *  sortOrder). Prefills the item-side ("Found in") loot editor. Null if not an item. */
export async function getIncomingLootLinks(itemSlug: string) {
  const item = await prisma.entity.findUnique({
    where: { slug: itemSlug },
    select: {
      kind: true,
      incomingLinks: {
        where: { role: "loot" },
        orderBy: { sortOrder: "asc" },
        select: {
          tier: true,
          value1: true,
          sortOrder: true,
          source: { select: { slug: true, name: true } },
        },
      },
    },
  });
  if (!item || item.kind !== "item") return null;
  return item.incomingLinks;
}

/** Env entities usable as loot sources (containers + landmarks), for the source dropdown
 *  in the item-side loot editor. */
export async function listLootSources(): Promise<{ slug: string; name: string }[]> {
  return prisma.entity.findMany({
    where: { kind: "environment", category: { in: ["loot-containers", "landmarks"] } },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}
```

- [ ] **Step 2: Widen `getCratesContaining` to include landmarks**

In `sand-wiki/src/lib/queries.ts`, change the `where` of `getCratesContaining`:

```ts
// before:
//   where: { role: "loot", target: { slug: itemSlug }, source: { category: "loot-containers" } },
// after:
    where: {
      role: "loot",
      target: { slug: itemSlug },
      source: { kind: "environment", category: { in: ["loot-containers", "landmarks"] } },
    },
```

- [ ] **Step 3: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/lib/queries.ts
git commit -m "feat(wiki): incoming-loot + loot-source queries; include landmarks in item loot"
```

---

## Task 3: Apply function — `applyItemLootProposal`

**Files:**
- Modify: `sand-wiki/src/lib/proposal-apply.ts`

No unit test (DB-bound, matches existing `applyLinksProposal` which is untested). Logic core (`diffLootSources`) is unit-tested in Task 1.

- [ ] **Step 1: Extend imports**

In `sand-wiki/src/lib/proposal-apply.ts`, change the link-proposal import:

```ts
import { diffLootSources, type LinkProposalChange, type ExistingLootLink } from "./link-proposal";
```

(removes the old type-only `import type { LinkProposalChange }` line — replace it with the line above.)

- [ ] **Step 2: Add the apply function**

Append to `sand-wiki/src/lib/proposal-apply.ts`:

```ts
/** Apply an approved loot_sources_edit proposal: reconcile an ITEM's incoming loot
 *  links across many sources. Rows use the inversion convention (targetSlug = source
 *  slug). Deletes removed (source,tier) pairs, updates value1 on kept pairs, appends
 *  created pairs after each source's existing loot rows. Marks every touched source
 *  lootCurated so a reseed won't clobber the edit. */
export async function applyItemLootProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "loot_sources_edit" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending loot-sources edit.");
    }
    const change = p.changes as unknown as LinkProposalChange;

    const item = await tx.entity.findUnique({
      where: { slug: p.targetSlug },
      select: { id: true, name: true, kind: true },
    });
    if (!item || item.kind !== "item") throw new Error("Item not found.");

    const existingLinks = await tx.entityLink.findMany({
      where: { role: "loot", targetId: item.id },
      select: { id: true, tier: true, value1: true, sortOrder: true, source: { select: { slug: true } } },
    });
    const existing: ExistingLootLink[] = existingLinks.map((l) => ({
      id: l.id,
      sourceSlug: l.source.slug,
      tier: l.tier,
      value1: l.value1,
      sortOrder: l.sortOrder,
    }));

    // targetSlug holds the SOURCE slug for this proposal kind. Resolve all before writing.
    const newSourceSlugs = [...new Set(change.new.map((r) => r.targetSlug).filter((s): s is string => !!s))];
    const sources = await tx.entity.findMany({ where: { slug: { in: newSourceSlugs } }, select: { id: true, slug: true } });
    const idBySlug = new Map(sources.map((s) => [s.slug, s.id]));
    for (const slug of newSourceSlugs) {
      if (!idBySlug.has(slug)) throw new Error(`Cannot resolve loot source ${slug}`);
    }

    const { creates, updates, deletes } = diffLootSources(existing, change.new);

    if (deletes.length) await tx.entityLink.deleteMany({ where: { id: { in: deletes } } });
    for (const u of updates) {
      await tx.entityLink.update({ where: { id: u.id }, data: { value1: u.value1 } });
    }
    for (const r of creates) {
      const sourceId = idBySlug.get(r.targetSlug!)!;
      const max = await tx.entityLink.aggregate({ where: { sourceId, role: "loot" }, _max: { sortOrder: true } });
      await tx.entityLink.create({
        data: {
          sourceId,
          targetId: item.id,
          role: "loot",
          name: item.name,
          amount: null,
          tier: r.tier,
          value1: r.value1,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
      });
    }

    const touchedSlugs = new Set<string>([
      ...change.old.map((r) => r.targetSlug).filter((s): s is string => !!s),
      ...change.new.map((r) => r.targetSlug).filter((s): s is string => !!s),
    ]);
    if (touchedSlugs.size) {
      await tx.entity.updateMany({ where: { slug: { in: [...touchedSlugs] } }, data: { lootCurated: true } });
    }

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/lib/proposal-apply.ts
git commit -m "feat(wiki): applyItemLootProposal for item-side loot edits"
```

---

## Task 4: Submit action — `submitItemLootEdit`

**Files:**
- Modify: `sand-wiki/src/app/contribute/actions.ts`

- [ ] **Step 1: Extend imports**

In `sand-wiki/src/app/contribute/actions.ts`:

```ts
// change:
import { getOutgoingLinks } from "@/lib/queries";
// to:
import { getOutgoingLinks, getIncomingLootLinks, listLootSources } from "@/lib/queries";

// change:
import { parseLinkRows, linksToSnapshot, snapshotsEqual as linkSnapshotsEqual } from "@/lib/link-proposal";
// to:
import { parseLinkRows, linksToSnapshot, incomingLootToDrafts, snapshotsEqual as linkSnapshotsEqual } from "@/lib/link-proposal";
```

- [ ] **Step 2: Add the action**

Append to `sand-wiki/src/app/contribute/actions.ts`:

```ts
/** Item-side loot editing: reconcile which containers/landmarks an item is found in.
 *  Mirrors submitLinksEdit but inverse — each row selects a SOURCE (held in the row's
 *  targetSlug per the inversion convention). Free-text/unlinked sources are rejected. */
export async function submitItemLootEdit(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const role = "loot";
  const note = (String(formData.get("note") ?? "").trim() || null) as string | null;

  const session = await requireUser(`/contribute/edit-tabs?type=item&slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const oldRows = await getIncomingLootLinks(slug);
  if (oldRows === null) throw new Error("Item not found.");

  const sources = await listLootSources();
  const nameBySlug = new Map(sources.map((s) => [s.slug, s.name]));

  const parsed = parseLinkRows(role, {
    slugs: formData.getAll("linkSlug").map(String),
    customNames: formData.getAll("linkName").map(String),
    amounts: formData.getAll("linkAmount").map(String),
    tiers: formData.getAll("linkTier").map(String),
    value1s: formData.getAll("linkValue1").map(String),
  }, nameBySlug);
  if (parsed.error) throw new Error(parsed.error);
  if (parsed.rows.some((r) => r.targetSlug === null)) {
    throw new Error("Loot sources must be existing containers or landmarks.");
  }

  const oldSnap = { role, rows: incomingLootToDrafts(oldRows) };
  const newSnap = { role, rows: parsed.rows };
  if (linkSnapshotsEqual(oldSnap, newSnap)) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: {
      kind: "loot_sources_edit",
      targetType: "item",
      targetSlug: slug,
      changes: { role, old: oldSnap.rows, new: newSnap.rows } as object,
      note,
      proposerId: session.steamId,
    },
  });

  redirect(`/contribute/edit-tabs?type=item&slug=${slug}&proposed=1`);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/app/contribute/actions.ts
git commit -m "feat(wiki): submitItemLootEdit action (loot_sources_edit proposals)"
```

---

## Task 5: Parameterize `LinkEditForm`

**Files:**
- Modify: `sand-wiki/src/components/LinkEditForm.tsx`

- [ ] **Step 1: Add props with backwards-compatible defaults**

In `sand-wiki/src/components/LinkEditForm.tsx`, update the component signature/props (keep the existing import of `submitLinksEdit`):

```tsx
export function LinkEditForm({
  type,
  slug,
  role,
  label,
  fields,
  rows: initialRows,
  items,
  action = submitLinksEdit,
  optionNoun = "item",
  allowCustom = true,
}: {
  type: string;
  slug: string;
  role: string;
  label: string;
  fields: readonly LinkField[];
  rows: LinkRowDraft[];
  items: ItemOption[];
  action?: (formData: FormData) => void | Promise<void>;
  optionNoun?: string;
  allowCustom?: boolean;
}) {
```

- [ ] **Step 2: Use the new props in the form**

Change the `<form action={submitLinksEdit} ...>` to use the prop:

```tsx
    <form action={action} className="space-y-4 max-w-2xl">
```

Change the select's static options:

```tsx
                <option value="">— select {optionNoun} —</option>
                {allowCustom && (
                  <option value={CUSTOM_TARGET}>— custom / unlinked —</option>
                )}
```

- [ ] **Step 3: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean). Existing envEntity/tramplerPart usages still compile (defaults preserve old behavior).

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/components/LinkEditForm.tsx
git commit -m "refactor(wiki): parameterize LinkEditForm (action/optionNoun/allowCustom)"
```

---

## Task 6: Edit Tabs page — add "Found in" section for items

**Files:**
- Modify: `sand-wiki/src/app/contribute/edit-tabs/page.tsx`

- [ ] **Step 1: Extend imports**

Add to the imports in `sand-wiki/src/app/contribute/edit-tabs/page.tsx`:

```ts
import { getOutgoingLinks, getItemBySlug, getIncomingLootLinks, listLootSources } from "@/lib/queries";
import { linksToSnapshot, incomingLootToDrafts } from "@/lib/link-proposal";
import { linkFields, LINK_ROLES } from "@/lib/entity-links";
import { LinkEditForm } from "@/components/LinkEditForm";
import { submitDeleteRecipe, submitItemLootEdit } from "@/app/contribute/actions";
```

(Three changes vs current: add `getIncomingLootLinks, listLootSources` to the queries import; add `incomingLootToDrafts` to the link-proposal import; add `submitItemLootEdit` to the actions import.)

- [ ] **Step 2: Load item-side loot data**

In the `EditTabsPage` component, after the `const item = ...` line, add:

```tsx
  const isItem = entity.kind === "item";
  const lootSources = isItem ? await listLootSources() : [];
  const lootRows = isItem ? await getIncomingLootLinks(slug) : null;
  const lootDrafts = lootRows ? incomingLootToDrafts(lootRows) : [];
```

- [ ] **Step 3: Render the Found-in section; remove the dead fallback**

Replace the existing role block:

```tsx
      {role ? (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{LINK_ROLES[role].label}</h2>
          <LinkEditForm
            type={type}
            slug={slug}
            role={role}
            label={LINK_ROLES[role].label}
            fields={linkFields(role)}
            rows={linksToSnapshot(role, entity.outgoingLinks).rows}
            items={items}
          />
        </section>
      ) : (
        <p className="text-muted-foreground">No editable tabs for this entity yet.</p>
      )}
```

with:

```tsx
      {role && (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{LINK_ROLES[role].label}</h2>
          <LinkEditForm
            type={type}
            slug={slug}
            role={role}
            label={LINK_ROLES[role].label}
            fields={linkFields(role)}
            rows={linksToSnapshot(role, entity.outgoingLinks).rows}
            items={items}
          />
        </section>
      )}

      {isItem && (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Found in</h2>
          <p className="text-sm text-muted-foreground">Containers and landmarks where this item can be looted.</p>
          <LinkEditForm
            type="item"
            slug={slug}
            role="loot"
            label="Found in"
            fields={linkFields("loot")}
            rows={lootDrafts}
            items={lootSources}
            action={submitItemLootEdit}
            optionNoun="source"
            allowCustom={false}
          />
        </section>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/app/contribute/edit-tabs/page.tsx
git commit -m "feat(wiki): item-side 'Found in' loot editor in Edit Tabs hub"
```

---

## Task 7: Admin review — render & approve `loot_sources_edit`

**Files:**
- Modify: `sand-wiki/src/app/admin/proposals/[id]/page.tsx`
- Modify: `sand-wiki/src/app/admin/proposals/actions.ts`
- Modify: `sand-wiki/src/app/admin/proposals/page.tsx`

- [ ] **Step 1: Detail page — accept the new kind for the link diff**

In `sand-wiki/src/app/admin/proposals/[id]/page.tsx`:

Change the linkChange guard (around line 52):

```tsx
  let linkChange: LinkProposalChange | null = null;
  if ((p.kind === "links_edit" || p.kind === "loot_sources_edit") && p.changes) {
    linkChange = p.changes as unknown as LinkProposalChange;
  }
```

Change the render condition (around line 138):

```tsx
      ) : (p.kind === "links_edit" || p.kind === "loot_sources_edit") && linkChange ? (
```

Relabel the table header (around line 142) from `Target` to `Entity`:

```tsx
            <thead><tr><th className={thCls}>Entity</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
```

Add the title case in the `<h1>` ternary (after the `links_edit` branch, around line 76):

```tsx
            : p.kind === "links_edit"
                ? `Tab edit · ${p.targetType} · ${p.targetSlug}`
                : p.kind === "loot_sources_edit"
                  ? `Loot sources · ${p.targetType} · ${p.targetSlug}`
                  : p.kind === "recipe_new"
```

(Note: the nested ternary's following branches keep their existing content; only this new branch is inserted between `links_edit` and `recipe_new`.)

- [ ] **Step 2: Approve action — wire the apply function**

In `sand-wiki/src/app/admin/proposals/actions.ts`:

Extend the import:

```ts
import { applyProposal, applyRecipeProposal, applyLinksProposal, applyItemLootProposal, applyRecipeNew, applyRecipeDelete } from "@/lib/proposal-apply";
```

Add a branch alongside the others (after the `links_edit` branch):

```ts
  } else if (p.kind === "links_edit") {
    await applyLinksProposal(id, session.steamId);
  } else if (p.kind === "loot_sources_edit") {
    await applyItemLootProposal(id, session.steamId);
```

- [ ] **Step 3: List page — add the label**

In `sand-wiki/src/app/admin/proposals/page.tsx`, insert the new branch in the label ternary (after the `links_edit` branch, around line 38):

```tsx
                      : p.kind === "links_edit"
                        ? `Tab edit · ${p.targetType} · ${p.targetSlug}`
                        : p.kind === "loot_sources_edit"
                          ? `Loot sources · ${p.targetType} · ${p.targetSlug}`
                          : p.kind === "recipe_new"
```

(Again: only this branch is inserted; the following branches keep their content.)

- [ ] **Step 4: Typecheck**

Run: `cd sand-wiki && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/app/admin/proposals/[id]/page.tsx sand-wiki/src/app/admin/proposals/actions.ts sand-wiki/src/app/admin/proposals/page.tsx
git commit -m "feat(wiki): admin review + apply for loot_sources_edit proposals"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd sand-wiki && npx vitest run`
Expected: PASS — all suites green (including the new `link-proposal` cases).

- [ ] **Step 2: Full typecheck**

Run: `cd sand-wiki && npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 3: Lint (if configured)**

Run: `cd sand-wiki && npm run lint`
Expected: no errors. (If the script doesn't exist, skip.)

- [ ] **Step 4: Manual verification (dev server)**

Run: `cd sand-wiki && npm run dev`, then as a signed-in user:
  1. Go to an item's detail page (e.g. the RG79S Smoke Grenade) → **Edit Tabs**. Confirm a **Found in** section appears with a source dropdown listing containers **and** landmarks, no "custom / unlinked" option.
  2. Add a source row (pick a container, set tier + count), submit. Confirm redirect with `?proposed=1` and a pending `loot_sources_edit` proposal.
  3. As admin, open the proposal under **Review** → confirm the diff table renders ("Entity"/Current/Proposed) and shows the added row. Approve it.
  4. Reload the item page's **Loot** tab → confirm the new source appears, and that any landmark sources now show too (display fix).
  5. Re-open **Edit Tabs**, change the row's count (value1) only, submit, approve → confirm the container's other loot ordering is unchanged.

- [ ] **Step 5: Final no-op commit if needed**

If lint/format made changes:

```bash
git add -A && git commit -m "chore(wiki): lint/format after item-loot-editing"
```

---

## Notes for the implementer
- **Inversion convention** is load-bearing: in `loot_sources_edit` rows, `targetSlug` = source slug. Keep the doc comments intact at every read/write site.
- `parseLinkRows` is reused unchanged; the action enforces "no unlinked sources" by rejecting any parsed row with `targetSlug === null`.
- Server actions (`submitItemLootEdit`) are passed as a prop to the client `LinkEditForm`; this is supported because they live in a `"use server"` module.
- Do not touch the forward (container-side) loot editor or `applyLinksProposal`.
```
