# Entity Tab Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in contributors add/update/delete the content of the tabs an entity page renders (Loot, Build Cost, Crafted-by, Used-in) through a single "Edit tabs" hub, reviewed by an admin like every other proposal.

**Architecture:** Reuse the existing `Proposal` machinery (kind + `{old,new}` JSON snapshot + admin diff + transactional apply). Add three new proposal kinds — `links_edit` (generic `EntityLink` row editor for Loot/Build Cost), `recipe_new`, `recipe_delete` — each mirroring the established `recipe_edit` shape. A new `/contribute/edit-tabs` hub routes each tab to its editor; recipe sections are gated by a single `RECIPE_TAB_KINDS` set so landmark crafting can switch them on later.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 6 (Postgres/Neon), React 19, vitest, Tailwind + shadcn (form styling via `@/components/form-styles`).

**Spec:** [docs/superpowers/specs/2026-06-13-entity-tab-editing-design.md](../specs/2026-06-13-entity-tab-editing-design.md)

**Branch:** `feat/entity-tab-editing`, cut from `master` *after* the DaisyUI→shadcn frontend rework was merged. All UI code below targets the **post-rework** styling system (see the form-styling convention) — an earlier draft used DaisyUI classes; they have been translated.

**Conventions in this codebase (read before starting):**
- Tests: `npx vitest run <file>` for one file, `npm test` for all. Test files are `src/**/*.test.ts`.
- Pure-function libs (`recipe-proposal.ts`) are unit-tested; DB apply functions and React pages are not (verified by typecheck + manual). Match that: TDD the libs, typecheck the rest.
- Typecheck (verify step for non-unit tasks): `npx tsc --noEmit`.
- Proposal *type* vocabulary is the legacy model names: `item` | `envEntity` | `tramplerPart`. `Entity.kind` vocabulary is `item` | `environment` | `trampler-part`. Two `entityHref` helpers exist — keep them separate (see their doc comments).
- Server actions live in `src/app/contribute/actions.ts`; admin apply in `src/lib/proposal-apply.ts`; admin routing in `src/app/admin/proposals/actions.ts`.
- **Form styling (NO DaisyUI):** contribute/edit/admin forms use shared class constants from `@/components/form-styles`: `labelCls`, `inputCls`, `selectCls` (= `inputCls`), `textareaCls`, `hintCls`, `errorCls`, and button variants `btnPrimary`, `btnGhost`, `btnSecondary`, `btnSuccess`, `btnDestructive`, plus size modifier `btnSm`. Native `<input>/<select>/<textarea>` keep their `name`/`value` so server actions still read FormData. `src/components/RecipeEditForm.tsx` is the row-editor reference. Do **not** use DaisyUI classes (`input input-bordered`, `btn btn-primary`, `rounded-box`, `text-base-content/*`, `badge`, `table`) — they no longer exist; use Tailwind tokens like `text-muted-foreground`, `border-border`, `bg-card`.
- **Admin tables:** `src/app/admin/proposals/[id]/page.tsx` defines local class constants at the top: `tableCls`, `thCls`, `tdCls`, and `tagWarn` (the status/"base changed" pill). Warning rows use `bg-warning/10`. Reuse these for any new diff tables; do not introduce a DaisyUI `table`.
- **Recipe display types:** `RecipeCard` (and `toRecipeCard`) live in `@/lib/recipes`; `getItemBySlug` returns `craftedBy: RecipeCard[]` and `usedIn: RecipeCard[]` (each card exposes `slug`, `workbench`, `tier`, `inputs`, `outputs`). `CraftTable`/`UsedInTable` render via `SortableTable` and gate the per-recipe edit link behind a `canSuggest`-conditional column.

---

## File Structure

**New files:**
- `src/lib/link-proposal.ts` — pure helpers for `links_edit` (snapshot, parse, equality, diff). Mirrors `recipe-proposal.ts`.
- `src/lib/link-proposal.test.ts` — unit tests for the above.
- `src/components/LinkEditForm.tsx` — client row-editor for one role (loot/cost), columns driven by role config.
- `src/components/EditTabsLink.tsx` — the "Edit tabs" entry-point button.
- `src/app/contribute/edit-tabs/page.tsx` — the unified hub page.
- `src/app/contribute/new-recipe/page.tsx` — "propose a new recipe" page (reuses `RecipeEditForm`).

**Modified files:**
- `src/lib/entity-links.ts` — extend `LINK_ROLES` with per-role editable `fields`.
- `src/lib/queries.ts` — add `getOutgoingLinks(slug, role)`.
- `src/lib/recipe-proposal.ts` — add `uniqueRecipeSlug(base, taken)`.
- `src/lib/recipe-proposal.test.ts` — test `uniqueRecipeSlug`.
- `src/app/contribute/actions.ts` — add `submitLinksEdit`, `submitNewRecipe`, `submitDeleteRecipe`.
- `src/lib/proposal-apply.ts` — add `applyLinksProposal`, `applyRecipeNew`, `applyRecipeDelete`.
- `src/app/admin/proposals/actions.ts` — route the three new kinds.
- `src/app/admin/proposals/[id]/page.tsx` — render diffs for the three new kinds.
- `src/components/RecipeEditForm.tsx` — parameterize `action`/`slug`/`submitLabel` so it serves both edit and new.
- `src/components/EntityDetail.tsx` — render the `EditTabsLink` next to `SuggestCorrectionLink`.
- `src/app/items/[slug]/page.tsx`, `src/components/CraftTable.tsx`, `src/components/UsedInTable.tsx` — remove per-recipe `SuggestRecipeLink`; drop the now-unused `canSuggest` plumbing for recipes.
- `prisma/schema.prisma` — add `Recipe.curated Boolean @default(false)`.
- `prisma/seed.ts` — skip line-recreation / overwrite for curated recipes.

---

## Task 1: `link-proposal.ts` lib + role field config

**Files:**
- Modify: `src/lib/entity-links.ts:14-19`
- Create: `src/lib/link-proposal.ts`
- Test: `src/lib/link-proposal.test.ts`

- [ ] **Step 1: Extend `LINK_ROLES` with editable fields**

In `src/lib/entity-links.ts`, replace the `LINK_ROLES` block (lines 14-19):

```ts
/** Fixed catalog of tab roles. Adding a tab TYPE = add an entry here + a renderer in the page.
 *  `fields` lists the editable columns the contributor row-editor shows for the role. */
export const LINK_ROLES = {
  loot: { label: "Loot", fields: ["tier", "value1"] },
  cost: { label: "Build Cost", fields: ["amount"] },
} as const;
export type LinkRole = keyof typeof LINK_ROLES;
export type LinkField = "amount" | "tier" | "value1";

/** Editable columns for a role (empty for an unknown role). */
export function linkFields(role: string): readonly LinkField[] {
  return (LINK_ROLES as Record<string, { fields: readonly LinkField[] }>)[role]?.fields ?? [];
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/link-proposal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  linksToSnapshot,
  parseLinkRows,
  snapshotsEqual,
  diffLinkRows,
  CUSTOM_TARGET,
  type LinkSnapshot,
} from "./link-proposal";

const names = new Map([["iron", "Iron"], ["bolt", "Bolt"]]);

describe("linksToSnapshot", () => {
  it("maps loaded rows (target→slug) into a sorted snapshot", () => {
    const snap = linksToSnapshot("cost", [
      { target: { slug: "bolt" }, name: "Bolt", amount: 3, tier: null, value1: null, sortOrder: 1 },
      { target: { slug: "iron" }, name: "Iron", amount: 2, tier: null, value1: null, sortOrder: 0 },
    ]);
    expect(snap).toEqual({
      role: "cost",
      rows: [
        { targetSlug: "iron", name: "Iron", amount: 2, tier: null, value1: null },
        { targetSlug: "bolt", name: "Bolt", amount: 3, tier: null, value1: null },
      ],
    });
  });

  it("keeps unlinked rows (null target) with their name fallback", () => {
    const snap = linksToSnapshot("loot", [
      { target: null, name: "Mystery", amount: null, tier: "Rare", value1: "1-2", sortOrder: 0 },
    ]);
    expect(snap.rows[0]).toEqual({ targetSlug: null, name: "Mystery", amount: null, tier: "Rare", value1: "1-2" });
  });
});

describe("parseLinkRows (cost)", () => {
  it("pairs slug/amount, drops blank rows, resolves names", () => {
    const r = parseLinkRows("cost",
      { slugs: ["iron", "", "bolt"], customNames: ["", "", ""], amounts: ["2", "9", "3"], tiers: [], value1s: [] },
      names);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([
      { targetSlug: "iron", name: "Iron", amount: 2, tier: null, value1: null },
      { targetSlug: "bolt", name: "Bolt", amount: 3, tier: null, value1: null },
    ]);
  });

  it("rejects a non-positive / non-integer amount", () => {
    const bad = parseLinkRows("cost", { slugs: ["iron"], customNames: [""], amounts: ["0"], tiers: [], value1s: [] }, names);
    expect(bad.error).toMatch(/positive whole number/i);
  });

  it("rejects an unknown slug", () => {
    const r = parseLinkRows("cost", { slugs: ["ghost"], customNames: [""], amounts: ["1"], tiers: [], value1s: [] }, names);
    expect(r.error).toMatch(/unknown item/i);
  });
});

describe("parseLinkRows (loot)", () => {
  it("captures tier + value1 and ignores amount for loot", () => {
    const r = parseLinkRows("loot",
      { slugs: ["iron"], customNames: [""], amounts: ["7"], tiers: ["Rare"], value1s: ["1-2"] },
      names);
    expect(r.error).toBeNull();
    expect(r.rows).toEqual([{ targetSlug: "iron", name: "Iron", amount: null, tier: "Rare", value1: "1-2" }]);
  });

  it("accepts a custom (unlinked) row by name", () => {
    const r = parseLinkRows("loot",
      { slugs: [CUSTOM_TARGET], customNames: ["Homemade"], amounts: [""], tiers: ["Normal"], value1s: [""] },
      names);
    expect(r.rows[0]).toEqual({ targetSlug: null, name: "Homemade", amount: null, tier: "Normal", value1: null });
  });

  it("rejects a custom row with no name", () => {
    const r = parseLinkRows("loot",
      { slugs: [CUSTOM_TARGET], customNames: ["  "], amounts: [""], tiers: ["Normal"], value1s: [""] },
      names);
    expect(r.error).toMatch(/name/i);
  });
});

describe("snapshotsEqual", () => {
  const base: LinkSnapshot = { role: "loot", rows: [{ targetSlug: "iron", name: "Iron", amount: null, tier: "Rare", value1: "1-2" }] };
  it("is order-sensitive and field-sensitive", () => {
    expect(snapshotsEqual(base, structuredClone(base))).toBe(true);
    const changed = structuredClone(base); changed.rows[0].tier = "Normal";
    expect(snapshotsEqual(base, changed)).toBe(false);
  });
});

describe("diffLinkRows", () => {
  it("classifies added / removed / changed / same, keyed by target+tier", () => {
    const oldRows = [
      { targetSlug: "iron", name: "Iron", amount: null, tier: "Rare", value1: "1-2" },
      { targetSlug: "bolt", name: "Bolt", amount: null, tier: "Normal", value1: "1" },
    ];
    const newRows = [
      { targetSlug: "iron", name: "Iron", amount: null, tier: "Rare", value1: "3-4" }, // changed
      { targetSlug: "gold", name: "Gold", amount: null, tier: "Rare", value1: "1" },   // added
    ];
    const diff = diffLinkRows(oldRows, newRows);
    const byName = Object.fromEntries(diff.map((d) => [d.name, d.status]));
    expect(byName).toEqual({ Iron: "changed", Bolt: "removed", Gold: "added" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/link-proposal.test.ts`
Expected: FAIL — `Cannot find module './link-proposal'`.

- [ ] **Step 4: Implement `link-proposal.ts`**

Create `src/lib/link-proposal.ts`:

```ts
import { linkFields } from "./entity-links";

/** A single editable EntityLink row. `targetSlug` null = unlinked (free-text name). */
export interface LinkRowDraft {
  targetSlug: string | null;
  name: string;
  amount: number | null;
  tier: string | null;
  value1: string | null;
}

/** Snapshot of one role's outgoing rows on one entity. sortOrder is positional. */
export interface LinkSnapshot {
  role: string;
  rows: LinkRowDraft[];
}

/** Stored shape of a links_edit proposal's `changes` JSON. */
export interface LinkProposalChange {
  role: string;
  old: LinkRowDraft[];
  new: LinkRowDraft[];
}

/** Select sentinel meaning "this row is an unlinked, free-text name". */
export const CUSTOM_TARGET = "__custom__";

/** A loaded EntityLink row with its target resolved to a slug. */
interface RawLink {
  target: { slug: string } | null;
  name: string;
  amount: number | null;
  tier: string | null;
  value1: string | null;
  sortOrder: number;
}

/** Flatten loaded EntityLink rows into a comparable snapshot (sorted by sortOrder). */
export function linksToSnapshot(role: string, rows: RawLink[]): LinkSnapshot {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    role,
    rows: sorted.map((r) => ({
      targetSlug: r.target?.slug ?? null,
      name: r.name,
      amount: r.amount,
      tier: r.tier,
      value1: r.value1,
    })),
  };
}

export interface LinkFormArrays {
  slugs: string[];
  customNames: string[];
  amounts: string[];
  tiers: string[];
  value1s: string[];
}

export interface ParsedLinks {
  rows: LinkRowDraft[];
  error: string | null;
}

/** Pair index-aligned form arrays into validated rows. A blank slug drops the row.
 *  CUSTOM_TARGET → unlinked row using the paired customNames entry (name required).
 *  Which of amount/tier/value1 are read & validated is driven by the role's fields. */
export function parseLinkRows(role: string, form: LinkFormArrays, nameBySlug: Map<string, string>): ParsedLinks {
  const fields = linkFields(role);
  const usesAmount = fields.includes("amount");
  const usesTier = fields.includes("tier");
  const usesValue1 = fields.includes("value1");
  const rows: LinkRowDraft[] = [];

  for (let i = 0; i < form.slugs.length; i++) {
    const sel = (form.slugs[i] ?? "").trim();
    if (sel === "") continue;

    let targetSlug: string | null;
    let name: string;
    if (sel === CUSTOM_TARGET) {
      targetSlug = null;
      name = (form.customNames[i] ?? "").trim();
      if (name === "") return { rows: [], error: "Custom rows need a name." };
    } else {
      const resolved = nameBySlug.get(sel);
      if (!resolved) return { rows: [], error: `Unknown item: ${sel}` };
      targetSlug = sel;
      name = resolved;
    }

    let amount: number | null = null;
    if (usesAmount) {
      const a = Number((form.amounts[i] ?? "").trim());
      if (!Number.isInteger(a) || a <= 0) {
        return { rows: [], error: `Amount for ${name} must be a positive whole number.` };
      }
      amount = a;
    }
    const tier = usesTier ? ((form.tiers[i] ?? "").trim() || null) : null;
    const value1 = usesValue1 ? ((form.value1s[i] ?? "").trim() || null) : null;
    rows.push({ targetSlug, name, amount, tier, value1 });
  }
  return { rows, error: null };
}

const rowsEqual = (a: LinkRowDraft[], b: LinkRowDraft[]): boolean =>
  a.length === b.length &&
  a.every((r, i) =>
    r.targetSlug === b[i].targetSlug &&
    r.name === b[i].name &&
    r.amount === b[i].amount &&
    r.tier === b[i].tier &&
    r.value1 === b[i].value1);

/** True when two snapshots match on role and rows. Row comparison is ORDER-SENSITIVE. */
export function snapshotsEqual(a: LinkSnapshot, b: LinkSnapshot): boolean {
  return a.role === b.role && rowsEqual(a.rows, b.rows);
}

export interface LinkDiffRow {
  key: string;
  name: string;
  old: LinkRowDraft | null;
  new: LinkRowDraft | null;
  status: "added" | "removed" | "changed" | "same";
}

/** Key a row by target (or name fallback) plus tier, so the same item across two
 *  loot tiers stays two distinct rows. */
const rowKey = (r: LinkRowDraft): string => `${r.targetSlug ?? `name:${r.name}`}|${r.tier ?? ""}`;

const sameRow = (a: LinkRowDraft, b: LinkRowDraft): boolean =>
  a.amount === b.amount && a.tier === b.tier && a.value1 === b.value1 && a.name === b.name;

/** Per-key diff of two row lists (old order first, then new-only keys). */
export function diffLinkRows(oldRows: LinkRowDraft[], newRows: LinkRowDraft[]): LinkDiffRow[] {
  const oldBy = new Map(oldRows.map((r) => [rowKey(r), r]));
  const newBy = new Map(newRows.map((r) => [rowKey(r), r]));
  const keys = [...new Set([...oldRows.map(rowKey), ...newRows.map(rowKey)])];
  return keys.map((key) => {
    const o = oldBy.get(key) ?? null;
    const n = newBy.get(key) ?? null;
    const name = (n ?? o)!.name;
    const status: LinkDiffRow["status"] = !o ? "added" : !n ? "removed" : sameRow(o, n) ? "same" : "changed";
    return { key, name, old: o, new: n, status };
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/link-proposal.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/entity-links.ts src/lib/link-proposal.ts src/lib/link-proposal.test.ts
git commit -m "feat(wiki): link-proposal lib + role field config for tab editing"
```

---

## Task 2: `getOutgoingLinks` query helper

**Files:**
- Modify: `src/lib/queries.ts` (add near `getEnvEntityBySlug`, ~line 118)

- [ ] **Step 1: Add the helper**

Append to `src/lib/queries.ts`:

```ts
/** Outgoing EntityLink rows for one role on one entity (by slug), target resolved
 *  to slug/name, sorted. Used by the tab editor and its submit/apply paths. */
export async function getOutgoingLinks(slug: string, role: string) {
  const entity = await prisma.entity.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      kind: true,
      outgoingLinks: {
        where: { role },
        orderBy: { sortOrder: "asc" },
        select: {
          name: true,
          amount: true,
          tier: true,
          value1: true,
          sortOrder: true,
          target: { select: { slug: true } },
        },
      },
    },
  });
  return entity;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(wiki): getOutgoingLinks query for tab editing"
```

---

## Task 3: `submitLinksEdit` server action

**Files:**
- Modify: `src/app/contribute/actions.ts` (imports + new export)

- [ ] **Step 1: Add imports**

At the top of `src/app/contribute/actions.ts`, add to the existing import groups:

```ts
import { getOutgoingLinks } from "@/lib/queries";
import { parseLinkRows, linksToSnapshot, snapshotsEqual as linkSnapshotsEqual } from "@/lib/link-proposal";
import { linkFields } from "@/lib/entity-links";
```

Also import the kind→`Entity.kind` map is not needed here; we resolve by slug directly.

- [ ] **Step 2: Add the action**

Append to `src/app/contribute/actions.ts`:

```ts
export async function submitLinksEdit(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const role = String(formData.get("role") ?? "");
  const note = (String(formData.get("note") ?? "").trim() || null) as string | null;

  if (!isEditableTarget(type)) throw new Error("Unknown target type.");
  if (linkFields(role).length === 0) throw new Error("Unknown tab.");

  const session = await requireUser(`/contribute/edit-tabs?type=${type}&slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const entity = await getOutgoingLinks(slug, role);
  if (!entity) throw new Error("Page not found.");

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true } });
  const nameBySlug = new Map(items.map((i) => [i.slug, i.name]));

  const parsed = parseLinkRows(role, {
    slugs: formData.getAll("linkSlug").map(String),
    customNames: formData.getAll("linkName").map(String),
    amounts: formData.getAll("linkAmount").map(String),
    tiers: formData.getAll("linkTier").map(String),
    value1s: formData.getAll("linkValue1").map(String),
  }, nameBySlug);
  if (parsed.error) throw new Error(parsed.error);

  const oldSnap = linksToSnapshot(role, entity.outgoingLinks);
  const newSnap = { role, rows: parsed.rows };
  if (linkSnapshotsEqual(oldSnap, newSnap)) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: {
      kind: "links_edit",
      targetType: type,
      targetSlug: slug,
      changes: { role, old: oldSnap.rows, new: newSnap.rows } as object,
      note,
      proposerId: session.steamId,
    },
  });
  redirect(`${entityHref(type, slug)}?proposed=1`);
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/contribute/actions.ts
git commit -m "feat(wiki): submitLinksEdit action for loot/cost tab editing"
```

---

## Task 4: `LinkEditForm` component

**Files:**
- Create: `src/components/LinkEditForm.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/LinkEditForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { submitLinksEdit } from "@/app/contribute/actions";
import { CUSTOM_TARGET, type LinkRowDraft } from "@/lib/link-proposal";
import type { LinkField } from "@/lib/entity-links";
import {
  labelCls, inputCls, selectCls, textareaCls, btnPrimary, btnGhost, btnSecondary, btnSm,
} from "@/components/form-styles";

type ItemOption = { slug: string; name: string };

let nextKey = 0;
type Row = LinkRowDraft & { key: number };
const toRow = (r: LinkRowDraft): Row => ({ ...r, key: nextKey++ });
const blankRow = (): Row => ({ targetSlug: "", name: "", amount: 1, tier: "", value1: "", key: nextKey++ });

const TIERS = ["Normal", "Rare", "Very Rare"];

export function LinkEditForm({
  type,
  slug,
  role,
  label,
  fields,
  rows: initialRows,
  items,
}: {
  type: string;
  slug: string;
  role: string;
  label: string;
  fields: readonly LinkField[];
  rows: LinkRowDraft[];
  items: ItemOption[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows.length ? initialRows.map(toRow) : [blankRow()]);
  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // A row is "unlinked" when its select is the CUSTOM_TARGET sentinel (targetSlug is the
  // select's value here; "" = unchosen, CUSTOM_TARGET = free-text name).
  const selectValue = (r: Row) => (r.targetSlug === null ? CUSTOM_TARGET : r.targetSlug ?? "");

  return (
    <form action={submitLinksEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="role" value={role} />

      <fieldset className="space-y-2">
        <legend className={`mb-1 ${labelCls}`}>{label}</legend>
        {rows.map((r, i) => {
          const isCustom = selectValue(r) === CUSTOM_TARGET;
          return (
            <div key={r.key} className="flex flex-wrap items-center gap-2">
              <select
                name="linkSlug"
                value={selectValue(r)}
                onChange={(e) =>
                  update(i, { targetSlug: e.target.value === CUSTOM_TARGET ? null : e.target.value })
                }
                className={`${selectCls} min-w-[12rem] flex-1`}
              >
                <option value="">— select item —</option>
                <option value={CUSTOM_TARGET}>— custom / unlinked —</option>
                {items.map((it) => (
                  <option key={it.slug} value={it.slug}>{it.name}</option>
                ))}
              </select>

              {/* Always emit linkName so indices stay aligned with linkSlug; only meaningful when custom. */}
              <input
                name="linkName"
                value={isCustom ? r.name : ""}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Custom name"
                className={`${inputCls} w-40${isCustom ? "" : " hidden"}`}
              />

              {fields.includes("amount") && (
                <input
                  name="linkAmount"
                  type="number"
                  min={1}
                  value={r.amount ?? 1}
                  onChange={(e) => update(i, { amount: Number(e.target.value) })}
                  className={`${inputCls} w-20 text-center`}
                />
              )}
              {fields.includes("tier") && (
                <select
                  name="linkTier"
                  value={r.tier ?? ""}
                  onChange={(e) => update(i, { tier: e.target.value })}
                  className={`${selectCls} w-36`}
                >
                  <option value="">— tier —</option>
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              {fields.includes("value1") && (
                <input
                  name="linkValue1"
                  value={r.value1 ?? ""}
                  onChange={(e) => update(i, { value1: e.target.value })}
                  placeholder="e.g. 1-2"
                  className={`${inputCls} w-28`}
                />
              )}

              <button
                type="button"
                aria-label="Remove row"
                className={`${btnGhost} ${btnSm}`}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button type="button" className={`${btnSecondary} ${btnSm}`} onClick={() => setRows([...rows, blankRow()])}>
          + Add row
        </button>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Note / source (optional)</span>
        <textarea name="note" className={textareaCls} rows={2} placeholder="Where did you confirm this?" />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button type="submit" className={btnPrimary}>Submit {label} change</button>
      </div>
    </form>
  );
}
```

> The form has no `backHref` prop — the hub page (Task 6) renders its own "Back to page" link below the editors.

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LinkEditForm.tsx
git commit -m "feat(wiki): LinkEditForm row editor for loot/cost tabs"
```

---

## Task 5: `applyLinksProposal` + admin review for `links_edit`

**Files:**
- Modify: `src/lib/proposal-apply.ts` (imports + new export)
- Modify: `src/app/admin/proposals/actions.ts` (route the kind)
- Modify: `src/app/admin/proposals/[id]/page.tsx` (render the diff)

- [ ] **Step 1: Implement `applyLinksProposal`**

In `src/lib/proposal-apply.ts`, add to imports:

```ts
import type { LinkProposalChange } from "./link-proposal";
```

Append the function:

```ts
/** Apply an approved links_edit proposal: full-replace the entity's outgoing
 *  EntityLink rows for the proposal's role. Resolves target slugs to ids;
 *  unlinked rows keep targetId null + their name. Marks the source entity
 *  lootCurated so a reseed won't clobber community loot/cost edits. */
export async function applyLinksProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "links_edit" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending links edit.");
    }
    const change = p.changes as unknown as LinkProposalChange;
    const role = change.role;

    const source = await tx.entity.findUnique({ where: { slug: p.targetSlug }, select: { id: true } });
    if (!source) throw new Error("Entity not found.");

    const slugs = [...new Set(change.new.map((r) => r.targetSlug).filter((s): s is string => !!s))];
    const targets = await tx.entity.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const idBySlug = new Map(targets.map((t) => [t.slug, t.id]));

    // Resolve before any write so a missing target aborts cleanly.
    const creates = change.new.map((r, i) => {
      const targetId = r.targetSlug ? idBySlug.get(r.targetSlug) : null;
      if (r.targetSlug && !targetId) throw new Error(`Cannot resolve target ${r.targetSlug}`);
      return {
        sourceId: source.id,
        targetId: targetId ?? null,
        role,
        name: r.name,
        amount: r.amount,
        tier: r.tier,
        value1: r.value1,
        sortOrder: i,
      };
    });

    await tx.entityLink.deleteMany({ where: { sourceId: source.id, role } });
    if (creates.length) await tx.entityLink.createMany({ data: creates });
    await tx.entity.update({ where: { id: source.id }, data: { lootCurated: true } });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
```

- [ ] **Step 2: Route the kind in `approveProposal`**

In `src/app/admin/proposals/actions.ts`, update the import and add a branch:

```ts
import { applyProposal, applyRecipeProposal, applyLinksProposal } from "@/lib/proposal-apply";
```

Inside `approveProposal`, add before the `else` (new_page) branch:

```ts
  } else if (p.kind === "links_edit") {
    await applyLinksProposal(id, session.steamId);
```

- [ ] **Step 3: Render the `links_edit` diff in the admin detail page**

In `src/app/admin/proposals/[id]/page.tsx`, add the import:

```ts
import { diffLinkRows, type LinkProposalChange } from "@/lib/link-proposal";
```

After the `recipeChange` block (around line 40), add:

```ts
  let linkChange: LinkProposalChange | null = null;
  if (p.kind === "links_edit" && p.changes) {
    linkChange = p.changes as unknown as LinkProposalChange;
  }
```

In the JSX, extend the conditional chain — add this branch immediately after the `recipe_edit` branch and before the final `: (` new_page fallback:

```tsx
      ) : p.kind === "links_edit" && linkChange ? (
        <div className="space-y-2">
          <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{linkChange.role} rows</h2>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Target</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
            <tbody>
              {diffLinkRows(linkChange.old, linkChange.new).map((row) => {
                const fmt = (r: typeof row.old) =>
                  r ? [r.tier, r.amount != null ? `×${r.amount}` : null, r.value1].filter(Boolean).join(" ") || "—" : "—";
                return (
                  <tr key={row.key} className={row.status === "same" ? "" : "bg-warning/10"}>
                    <td className={tdCls}>{row.name}{row.status !== "same" && <span className={tagWarn}>{row.status}</span>}</td>
                    <td className={`${tdCls} text-muted-foreground`}>{fmt(row.old)}</td>
                    <td className={`${tdCls} font-medium`}>{fmt(row.new)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
```

(`tableCls`, `thCls`, `tdCls`, `tagWarn` are the existing local constants at the top of this file — reuse, don't redefine.)

Also update the `<h1>` title expression to name the kind. Replace the existing title ternary with:

```tsx
        {p.kind === "edit"
          ? `Edit · ${p.targetType} · ${p.targetSlug}`
          : p.kind === "recipe_edit"
            ? `Recipe edit · ${p.targetSlug}`
            : p.kind === "links_edit"
              ? `Tab edit · ${p.targetType} · ${p.targetSlug}`
              : `New page · ${p.proposedName}`}
```

And include `links_edit` in the note-display guard near the bottom (match the existing markup, which uses `text-muted-foreground` + a `text-foreground` strong):

```tsx
      {p.note && (p.kind === "edit" || p.kind === "recipe_edit" || p.kind === "links_edit") && (
        <p className="text-muted-foreground"><strong className="text-foreground">Note:</strong> {p.note}</p>
      )}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal-apply.ts src/app/admin/proposals/actions.ts "src/app/admin/proposals/[id]/page.tsx"
git commit -m "feat(wiki): apply + admin review for links_edit proposals"
```

---

## Task 6: The "Edit tabs" hub page + entry point (loot/cost live)

**Files:**
- Create: `src/components/EditTabsLink.tsx`
- Create: `src/app/contribute/edit-tabs/page.tsx`
- Modify: `src/components/EntityDetail.tsx`

- [ ] **Step 1: Add the entry-point link component**

Create `src/components/EditTabsLink.tsx`:

```tsx
import Link from "next/link";
import { btnGhost, btnSm } from "@/components/form-styles";

export function EditTabsLink({ type, slug }: { type: string; slug: string }) {
  return (
    <Link href={`/contribute/edit-tabs?type=${type}&slug=${slug}`} className={`${btnGhost} ${btnSm}`}>
      Edit tabs
    </Link>
  );
}
```

> `SuggestCorrectionLink` is the sibling pattern — open it to confirm it uses the same `btnGhost`/`btnSm` constants, and match its markup so the two buttons sit consistently.

- [ ] **Step 2: Render it in `EntityDetail`**

In `src/components/EntityDetail.tsx`, add the import:

```ts
import { EditTabsLink } from "@/components/EditTabsLink";
```

Replace the suggest line (line ~57):

```tsx
        {canSuggest && <SuggestCorrectionLink type={suggest.type} slug={suggest.slug} />}
```

with:

```tsx
        {canSuggest && (
          <div className="flex gap-2">
            <SuggestCorrectionLink type={suggest.type} slug={suggest.slug} />
            <EditTabsLink type={suggest.type} slug={suggest.slug} />
          </div>
        )}
```

- [ ] **Step 3: Create the hub page (loot/cost only for now)**

Create `src/app/contribute/edit-tabs/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEditableTarget, entityHref } from "@/lib/proposal-schema";
import { getOutgoingLinks } from "@/lib/queries";
import { linksToSnapshot } from "@/lib/link-proposal";
import { linkFields, LINK_ROLES } from "@/lib/entity-links";
import { LinkEditForm } from "@/components/LinkEditForm";
import { btnGhost } from "@/components/form-styles";

type SP = Promise<{ type?: string; slug?: string }>;

/** Which link role (if any) this proposal target type edits via the inline editor. */
const ROLE_FOR_TYPE: Record<string, "loot" | "cost" | undefined> = {
  envEntity: "loot",
  tramplerPart: "cost",
  item: undefined, // recipes only (added in a later task)
};

export default async function EditTabsPage({ searchParams }: { searchParams: SP }) {
  const { type = "", slug = "" } = await searchParams;
  if (!isEditableTarget(type) || !slug) notFound();
  await requireUser(`/contribute/edit-tabs?type=${type}&slug=${slug}`);

  const role = ROLE_FOR_TYPE[type];
  const back = entityHref(type, slug);

  const entity = await getOutgoingLinks(slug, role ?? "loot");
  if (!entity) notFound();

  const items = await prisma.entity.findMany({
    where: { kind: "item" },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Edit tabs — {entity.name}</h1>
      <p className="text-muted-foreground">An admin reviews every change before it goes live.</p>

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

      <Link href={back} className={btnGhost}>Back to page</Link>
    </article>
  );
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, sign in, open an environment entity page, click **Edit tabs**, add/edit a loot row, submit. Confirm a `links_edit` proposal appears in `/admin/proposals`, the diff renders, and approving it updates the entity's Loot tab. Repeat on a trampler part for Build Cost.
Expected: proposal created, diff correct, apply updates the live tab.

- [ ] **Step 6: Commit**

```bash
git add src/components/EditTabsLink.tsx src/app/contribute/edit-tabs/page.tsx src/components/EntityDetail.tsx
git commit -m "feat(wiki): Edit tabs hub + entry point (loot/cost editing live)"
```

---

## Task 7: `uniqueRecipeSlug` generator

**Files:**
- Modify: `src/lib/recipe-proposal.ts` (add export)
- Modify: `src/lib/recipe-proposal.test.ts` (add tests)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/recipe-proposal.test.ts`:

```ts
import { uniqueRecipeSlug } from "./recipe-proposal";

describe("uniqueRecipeSlug", () => {
  it("returns the base slug when it is free", () => {
    expect(uniqueRecipeSlug("bolt", new Set())).toBe("bolt");
  });
  it("appends -2, -3 … on collision", () => {
    expect(uniqueRecipeSlug("bolt", new Set(["bolt"]))).toBe("bolt-2");
    expect(uniqueRecipeSlug("bolt", new Set(["bolt", "bolt-2"]))).toBe("bolt-3");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/recipe-proposal.test.ts`
Expected: FAIL — `uniqueRecipeSlug is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/recipe-proposal.ts`:

```ts
/** A recipe slug not already in `taken`: `base`, else `base-2`, `base-3`, … */
export function uniqueRecipeSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/recipe-proposal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipe-proposal.ts src/lib/recipe-proposal.test.ts
git commit -m "feat(wiki): uniqueRecipeSlug for contributor-added recipes"
```

---

## Task 8: `Recipe.curated` flag + seed protection

**Files:**
- Modify: `prisma/schema.prisma:97-106`
- Modify: `prisma/seed.ts:124-137`

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, add to the `Recipe` model (after `craftTimeSeconds`):

```prisma
  curated          Boolean @default(false)
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name recipe_curated`
Expected: a new migration under `prisma/migrations/`, client regenerated, no errors.

> If the Directus snapshot needs to track this column, run `npm run directus:snapshot` after the DB is up (see AGENTS.md / memory notes on Directus). Not required for the app to build.

- [ ] **Step 3: Protect curated recipes in the seed**

In `prisma/seed.ts`, replace the recipe block (lines ~124-137) with:

```ts
  // --- Recipes: line rows are scraper-owned → recreate; recipe rows keep stable ids.
  // Contributor-curated recipes (curated=true) are skipped so a reseed never clobbers
  // community-applied recipe edits / additions. ---
  const curatedSlugs = new Set(
    (await prisma.recipe.findMany({ where: { curated: true }, select: { slug: true } })).map((r) => r.slug),
  );
  await prisma.recipeInput.deleteMany({ where: { recipe: { curated: false } } });
  await prisma.recipeOutput.deleteMany({ where: { recipe: { curated: false } } });
  for (const r of data.recipes) {
    if (curatedSlugs.has(r.slug)) continue;
    const scraped = { workbench: opt(r.workbench), tier: opt(r.tier), craftTimeSeconds: opt(r.craftTimeSeconds) };
    const lines = {
      inputs: { create: r.inputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
      outputs: { create: r.outputs.map((l) => ({ itemId: need(l.item), amount: l.amount })) },
    };
    await prisma.recipe.upsert({
      where: { slug: r.slug },
      create: { slug: r.slug, ...scraped, ...lines },
      update: { ...scraped, ...lines },
    });
  }
```

> Verify the surrounding variable names (`opt`, `need`, `data.recipes`, the `lines` shape) match the current file before saving — copy the existing block's exact line bodies if they differ.

- [ ] **Step 4: Verify seed compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts
git commit -m "feat(wiki): Recipe.curated flag + reseed protection for community recipes"
```

---

## Task 9: Parameterize `RecipeEditForm` for reuse

**Files:**
- Modify: `src/components/RecipeEditForm.tsx`

> The current `RecipeEditForm` already imports `submitRecipeEdit` and the `form-styles` constants, hardcodes `action={submitRecipeEdit}`, renders `<input type="hidden" name="slug" value={slug} />`, and has a footer `<button type="submit" className={btnPrimary}>Submit correction</button>` next to a `<Link href={backHref} className={btnGhost}>Cancel</Link>`. We make `action`/`slug`/`submitLabel` configurable while preserving all existing behavior (the existing `edit-recipe` page passes only `slug`/`snapshot`/`items`/`workbenches`/`backHref` and must keep working unchanged).

- [ ] **Step 1: Add a `RecipeAction` type alias**

After the existing imports in `src/components/RecipeEditForm.tsx` (just below the `form-styles` import), add:

```ts
type RecipeAction = (formData: FormData) => void | Promise<void>;
```

- [ ] **Step 2: Make `action` / `slug` / `submitLabel` configurable**

Update the component signature to add the three props (`slug` becomes optional, `action`/`submitLabel` get defaults):

```tsx
export function RecipeEditForm({
  slug,
  snapshot,
  items,
  workbenches,
  backHref,
  action = submitRecipeEdit,
  submitLabel = "Submit correction",
}: {
  slug?: string;
  snapshot: RecipeSnapshot;
  items: ItemOption[];
  workbenches: string[];
  backHref: string;
  action?: RecipeAction;
  submitLabel?: string;
}) {
```

Change the `<form>` to use the prop, and guard the hidden slug input:

```tsx
    <form action={action} className="space-y-5 max-w-2xl">
      {slug && <input type="hidden" name="slug" value={slug} />}
```

Change the footer submit button to use the label prop (keep the existing `btnPrimary` class and the adjacent Cancel link as-is):

```tsx
        <button type="submit" className={btnPrimary}>{submitLabel}</button>
```

- [ ] **Step 3: Verify it typechecks (existing edit-recipe page still works)**

Run: `npx tsc --noEmit`
Expected: no errors. `src/app/contribute/edit-recipe/page.tsx` still passes `slug` and gets the default `action`/`submitLabel`.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecipeEditForm.tsx
git commit -m "refactor(wiki): parameterize RecipeEditForm action/slug for reuse"
```

---

## Task 10: `submitNewRecipe` + `submitDeleteRecipe` actions + new-recipe page

**Files:**
- Modify: `src/components/RecipeEditForm.tsx` (add `hiddenFields` prop)
- Modify: `src/app/contribute/actions.ts` (two new exports)
- Create: `src/app/contribute/new-recipe/page.tsx`

- [ ] **Step 1: Add a `hiddenFields` prop to `RecipeEditForm`**

The new-recipe and delete flows carry a back-target (`backType`/`backSlug`) the action reads from the form. Add a generic hidden-fields passthrough to `RecipeEditForm`. Add `hiddenFields?: Record<string, string>` to its props type, and immediately after the `{slug && <input ... />}` hidden-slug line render:

```tsx
      {Object.entries(hiddenFields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
```

- [ ] **Step 2: Add the two actions**

Append to `src/app/contribute/actions.ts`:

```ts
export async function submitNewRecipe(formData: FormData) {
  const note = (String(formData.get("note") ?? "").trim() || null) as string | null;
  const backType = String(formData.get("backType") ?? "item");
  const backSlug = String(formData.get("backSlug") ?? "");

  const session = await requireUser("/contribute/new");
  await assertUnderQuota(session.steamId);

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true } });
  const nameBySlug = new Map(items.map((i) => [i.slug, i.name]));

  const workbench = resolveEnumSubmission(
    String(formData.get("workbench") ?? ""),
    String(formData.get("workbench__custom") ?? ""),
  );
  const ip = parseRecipeLines(formData.getAll("inputSlug").map(String), formData.getAll("inputAmount").map(String), nameBySlug);
  if (ip.error) throw new Error(ip.error);
  const op = parseRecipeLines(formData.getAll("outputSlug").map(String), formData.getAll("outputAmount").map(String), nameBySlug);
  if (op.error) throw new Error(op.error);
  if (op.lines.length === 0) throw new Error("A recipe needs at least one output.");

  const newSnap: RecipeSnapshot = {
    workbench: coerceValue("string", workbench) as string | null,
    tier: coerceValue("int", String(formData.get("tier") ?? "")) as number | null,
    craftTimeSeconds: coerceFloat(String(formData.get("craftTimeSeconds") ?? "")),
    inputs: ip.lines,
    outputs: op.lines,
  };

  await prisma.proposal.create({
    data: {
      kind: "recipe_new",
      targetType: "recipe",
      changes: { new: newSnap } as object,
      note,
      proposerId: session.steamId,
    },
  });
  redirect(backSlug ? `${entityHref(backType, backSlug)}?proposed=1` : "/items?proposed=1");
}

export async function submitDeleteRecipe(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const backType = String(formData.get("backType") ?? "item");
  const backSlug = String(formData.get("backSlug") ?? "");
  const note = (String(formData.get("note") ?? "").trim() || null) as string | null;
  if (!slug) throw new Error("Missing recipe.");

  const session = await requireUser(`/contribute/edit-tabs?type=${backType}&slug=${backSlug}`);
  await assertUnderQuota(session.steamId);

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      inputs: { include: { entity: { select: { slug: true, name: true } } } },
      outputs: { include: { entity: { select: { slug: true, name: true } } } },
    },
  });
  if (!recipe) throw new Error("Recipe not found.");

  await prisma.proposal.create({
    data: {
      kind: "recipe_delete",
      targetType: "recipe",
      targetSlug: slug,
      changes: { old: recipeToSnapshot(recipe) } as object,
      note,
      proposerId: session.steamId,
    },
  });
  redirect(backSlug ? `${entityHref(backType, backSlug)}?proposed=1` : "/items?proposed=1");
}
```

- [ ] **Step 3: Create the new-recipe page**

Create `src/app/contribute/new-recipe/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { entityHref } from "@/lib/proposal-schema";
import { getRecipeWorkbenches } from "@/lib/proposal-entity";
import { submitNewRecipe } from "@/app/contribute/actions";
import { RecipeEditForm } from "@/components/RecipeEditForm";
import type { RecipeSnapshot } from "@/lib/recipe-proposal";

type SP = Promise<{ type?: string; slug?: string; side?: string }>;

export default async function NewRecipePage({ searchParams }: { searchParams: SP }) {
  const { type = "item", slug = "", side = "output" } = await searchParams;
  if (!slug) notFound();
  await requireUser(`/contribute/new-recipe?type=${type}&slug=${slug}&side=${side}`);

  const entity = await prisma.entity.findUnique({ where: { slug }, select: { slug: true, name: true } });
  if (!entity) notFound();

  const items = await prisma.entity.findMany({ where: { kind: "item" }, select: { slug: true, name: true }, orderBy: { name: "asc" } });
  const workbenches = await getRecipeWorkbenches();
  const back = entityHref(type, slug);

  // Pre-fill the originating entity on the relevant side.
  const seedLine = { slug: entity.slug, name: entity.name, amount: 1 };
  const snapshot: RecipeSnapshot = {
    workbench: null, tier: null, craftTimeSeconds: null,
    inputs: side === "input" ? [seedLine] : [],
    outputs: side === "output" ? [seedLine] : [],
  };

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Propose a new recipe — {entity.name}</h1>
      <p className="text-muted-foreground">Describe the recipe. An admin reviews every change before it goes live.</p>
      <RecipeEditForm
        snapshot={snapshot}
        items={items}
        workbenches={workbenches}
        backHref={back}
        action={submitNewRecipe}
        submitLabel="Submit new recipe"
        hiddenFields={{ backType: type, backSlug: slug }}
      />
    </article>
  );
}
```

(The `backType` / `backSlug` hidden inputs are rendered by `RecipeEditForm` via the `hiddenFields` prop added in Step 1; `submitNewRecipe` reads them.)

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/contribute/actions.ts src/app/contribute/new-recipe/page.tsx src/components/RecipeEditForm.tsx
git commit -m "feat(wiki): submitNewRecipe + submitDeleteRecipe actions + new-recipe page"
```

---

## Task 11: Apply + admin review for `recipe_new` / `recipe_delete`

**Files:**
- Modify: `src/lib/proposal-apply.ts` (imports + two exports)
- Modify: `src/app/admin/proposals/actions.ts` (route two kinds)
- Modify: `src/app/admin/proposals/[id]/page.tsx` (render two kinds)

- [ ] **Step 1: Implement the apply functions**

In `src/lib/proposal-apply.ts`, extend the recipe import:

```ts
import { buildLineCreates, uniqueRecipeSlug, type RecipeProposalChange } from "./recipe-proposal";
```

Add a small type for the new/delete change shapes near the top (after imports):

```ts
import type { RecipeSnapshot } from "./recipe-proposal";
type RecipeNewChange = { new: RecipeSnapshot };
type RecipeDeleteChange = { old: RecipeSnapshot };
```

Append the functions:

```ts
/** Apply an approved recipe_new proposal: create a curated Recipe (so reseed won't
 *  clobber it) with a unique slug derived from its primary output. */
export async function applyRecipeNew(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "recipe_new" || !p.changes) {
      throw new Error("Proposal is not an applyable pending new recipe.");
    }
    const snap = (p.changes as unknown as RecipeNewChange).new;
    if (snap.outputs.length === 0) throw new Error("New recipe has no outputs.");

    const slugs = [...new Set([...snap.inputs, ...snap.outputs].map((l) => l.slug))];
    const items = await tx.entity.findMany({ where: { kind: "item", slug: { in: slugs } }, select: { id: true, slug: true } });
    const idBySlug = new Map(items.map((i) => [i.slug, i.id]));

    const inputCreates = buildLineCreates(snap.inputs, idBySlug);
    const outputCreates = buildLineCreates(snap.outputs, idBySlug);

    const existing = await tx.recipe.findMany({ select: { slug: true } });
    const slug = uniqueRecipeSlug(snap.outputs[0].slug, new Set(existing.map((r) => r.slug)));

    await tx.recipe.create({
      data: {
        slug,
        curated: true,
        workbench: snap.workbench,
        tier: snap.tier,
        craftTimeSeconds: snap.craftTimeSeconds,
        inputs: { create: inputCreates },
        outputs: { create: outputCreates },
      },
    });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}

/** Apply an approved recipe_delete proposal: delete the Recipe (cascades lines). */
export async function applyRecipeDelete(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "recipe_delete" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending recipe deletion.");
    }
    const recipe = await tx.recipe.findUnique({ where: { slug: p.targetSlug }, select: { id: true } });
    if (recipe) await tx.recipe.delete({ where: { id: recipe.id } });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
```

Also set `curated: true` on the existing `applyRecipeProposal` so admin-applied recipe *edits* survive a reseed. In `applyRecipeProposal`, change the `tx.recipe.update` data to include it:

```ts
    await tx.recipe.update({
      where: { id: recipe.id },
      data: { workbench: snap.workbench, tier: snap.tier, craftTimeSeconds: snap.craftTimeSeconds, curated: true },
    });
```

- [ ] **Step 2: Route the kinds in `approveProposal`**

In `src/app/admin/proposals/actions.ts`, extend the import:

```ts
import { applyProposal, applyRecipeProposal, applyLinksProposal, applyRecipeNew, applyRecipeDelete } from "@/lib/proposal-apply";
```

Add branches after the `links_edit` branch:

```ts
  } else if (p.kind === "recipe_new") {
    await applyRecipeNew(id, session.steamId);
  } else if (p.kind === "recipe_delete") {
    await applyRecipeDelete(id, session.steamId);
```

- [ ] **Step 3: Render the two kinds in the admin detail page**

In `src/app/admin/proposals/[id]/page.tsx`, reuse the recipe diff machinery. After the `recipeChange` block, add:

```ts
  // recipe_new shows everything as added (old = empty); recipe_delete shows everything as removed (new = empty).
  let recipeNewOrDelete: { old: RecipeProposalChange["old"]; new: RecipeProposalChange["new"] } | null = null;
  if (p.kind === "recipe_new" && p.changes) {
    const snap = (p.changes as { new: RecipeProposalChange["new"] }).new;
    recipeNewOrDelete = { old: { workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] }, new: snap };
  }
  if (p.kind === "recipe_delete" && p.changes) {
    const snap = (p.changes as { old: RecipeProposalChange["old"] }).old;
    recipeNewOrDelete = { old: snap, new: { workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] } };
  }
```

> `RecipeProposalChange.old`/`.new` are both `RecipeSnapshot`; the empty-snapshot literal above must match `RecipeSnapshot`'s shape exactly (`workbench/tier/craftTimeSeconds/inputs/outputs`).

Add a render branch after the `links_edit` branch (before the new_page fallback), reusing the same tables as `recipe_edit`:

```tsx
      ) : (p.kind === "recipe_new" || p.kind === "recipe_delete") && recipeNewOrDelete ? (
        <div className="space-y-4">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Meta</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
            <tbody>
              {(["workbench", "tier", "craftTimeSeconds"] as const).map((k) => (
                <tr key={k}>
                  <td className={tdCls}>{k}</td>
                  <td className={`${tdCls} text-muted-foreground`}>{String(recipeNewOrDelete!.old[k] ?? "—")}</td>
                  <td className={`${tdCls} font-medium`}>{String(recipeNewOrDelete!.new[k] ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(["inputs", "outputs"] as const).map((sideKey) => (
            <div key={sideKey}>
              <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{sideKey}</h2>
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Item</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
                <tbody>
                  {diffRecipeLines(recipeNewOrDelete!.old[sideKey], recipeNewOrDelete!.new[sideKey]).map((row) => (
                    <tr key={row.slug} className={row.status === "same" ? "" : "bg-warning/10"}>
                      <td className={tdCls}>{row.name}{row.status !== "same" && <span className={tagWarn}>{row.status}</span>}</td>
                      <td className={`${tdCls} text-muted-foreground`}>{row.oldAmount ?? "—"}</td>
                      <td className={`${tdCls} font-medium`}>{row.newAmount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
```

Update the `<h1>` title chain to label these (extend the existing ternary):

```tsx
              : p.kind === "recipe_new"
                ? `New recipe`
                : p.kind === "recipe_delete"
                  ? `Delete recipe · ${p.targetSlug}`
                  : `New page · ${p.proposedName}`
```

(Slot these branches in place of the final `: \`New page · ${p.proposedName}\`` from Task 5's title chain.)

And simplify the note-display guard to cover every kind except `new_page` (keeping the current markup):

```tsx
      {p.note && p.kind !== "new_page" && (
        <p className="text-muted-foreground"><strong className="text-foreground">Note:</strong> {p.note}</p>
      )}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal-apply.ts src/app/admin/proposals/actions.ts "src/app/admin/proposals/[id]/page.tsx"
git commit -m "feat(wiki): apply + admin review for recipe_new / recipe_delete"
```

---

## Task 12: Recipe sections in the hub (items) + RECIPE_TAB_KINDS gate

**Files:**
- Modify: `src/app/contribute/edit-tabs/page.tsx`

- [ ] **Step 1: Load the entity's recipes and render Crafted-by / Used-in sections**

In `src/app/contribute/edit-tabs/page.tsx`, add the recipe-tab gate and section rendering. Add near the top (after imports):

```ts
import { getItemBySlug } from "@/lib/queries";

/** Kinds whose pages render recipe (Crafted-by / Used-in) tabs. Landmark crafting
 *  later adds "environment" here; no other hub change is needed. */
const RECIPE_TAB_KINDS = new Set(["item"]);
```

After the `role`/`items` loading and before the `return`, add recipe loading (only for recipe-tab kinds):

```ts
  const showRecipes = RECIPE_TAB_KINDS.has(entity.kind);
  const item = showRecipes ? await getItemBySlug(slug) : null;
```

In the JSX, after the `role ? (...)` block and before the Back link, add:

```tsx
      {showRecipes && item && (
        <>
          {(["craftedBy", "usedIn"] as const).map((key) => {
            const recipes = item[key];
            const side = key === "craftedBy" ? "output" : "input";
            const heading = key === "craftedBy" ? "Crafted by" : "Used in";
            return (
              <section key={key} className="space-y-3 border border-border bg-card p-4">
                <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{heading}</h2>
                {recipes.length === 0 && <p className="text-sm text-muted-foreground">No recipes yet.</p>}
                <ul className="space-y-2">
                  {recipes.map((r) => (
                    <li key={r.slug} className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 text-sm">{r.workbench ?? "Recipe"}{r.tier != null ? ` · T${r.tier}` : ""}</span>
                      <Link href={`/contribute/edit-recipe?slug=${r.slug}`} className={`${btnGhost} ${btnSm}`}>Edit</Link>
                      <form action={submitDeleteRecipe} className="inline">
                        <input type="hidden" name="slug" value={r.slug} />
                        <input type="hidden" name="backType" value={type} />
                        <input type="hidden" name="backSlug" value={slug} />
                        <button type="submit" className={`${btnDestructive} ${btnSm}`}>Delete</button>
                      </form>
                    </li>
                  ))}
                </ul>
                <Link href={`/contribute/new-recipe?type=${type}&slug=${slug}&side=${side}`} className={`${btnSecondary} ${btnSm}`}>
                  + Propose a new recipe that {key === "craftedBy" ? "crafts" : "uses"} this
                </Link>
              </section>
            );
          })}
          <p className="text-sm text-muted-foreground">
            Ammo / Used-by tabs are derived from this item&apos;s ammo &amp; category fields — edit those via &ldquo;Suggest a correction&rdquo;.
          </p>
        </>
      )}
```

Add the action import, and extend the existing `form-styles` import (Task 6 imported only `btnGhost`) to include the button variants used here:

```ts
import { submitDeleteRecipe } from "@/app/contribute/actions";
// extend the existing form-styles import:
import { btnGhost, btnSecondary, btnDestructive, btnSm } from "@/components/form-styles";
```

> `getItemBySlug` returns `craftedBy` / `usedIn` as recipe cards. Confirm the card objects expose `slug`, `workbench`, and `tier`; if a card uses different property names, read them from the card's actual shape (check `toRecipeCard` in `queries.ts`) and adjust the `<li>` accordingly.

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (If recipe-card property names differ, fix per the note above.)

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`. On an item page → **Edit tabs**: confirm Crafted-by and Used-in sections list recipes with Edit/Delete and a "Propose a new recipe" button. Submit a new recipe and a delete; confirm both appear in `/admin/proposals` with correct diffs and apply correctly.
Expected: recipe_new creates a curated recipe on the item's Crafted-by tab; recipe_delete removes one.

- [ ] **Step 4: Commit**

```bash
git add src/app/contribute/edit-tabs/page.tsx
git commit -m "feat(wiki): recipe sections in Edit tabs hub (items) gated by RECIPE_TAB_KINDS"
```

---

## Task 13: Cleanup — remove per-recipe SuggestRecipeLink

**Files:**
- Modify: `src/components/CraftTable.tsx`, `src/components/UsedInTable.tsx`
- Modify: `src/app/items/[slug]/page.tsx` (drop `canSuggest` plumbing into the recipe tables if it becomes unused)

- [ ] **Step 1: Find the usages**

Run: `grep -rn "SuggestRecipeLink" src/`
Expected: references in `CraftTable.tsx` and `UsedInTable.tsx` (and the component file itself).

- [ ] **Step 2: Remove the per-recipe links**

Both `src/components/CraftTable.tsx` and `src/components/UsedInTable.tsx` render via `SortableTable` and add a `canSuggest`-conditional "Edit" column carrying `<SuggestRecipeLink>`. In **each** file, remove:
- the `import { SuggestRecipeLink } from "@/components/SuggestRecipeLink";` line;
- the conditional column: the `...(canSuggest ? [{ label: "Edit", alignRight: true, sortable: false } as SortColumn] : [])` entry in `columns`;
- the conditional key + cell: `...(canSuggest ? [null] : [])` in `keys` and `...(canSuggest ? [<SuggestRecipeLink key="e" slug={r.slug} />] : [])` in `cells`;
- the now-unused prop: change the signature from `{ recipes, canSuggest = false }: { recipes: RecipeCard[]; canSuggest?: boolean }` to `{ recipes }: { recipes: RecipeCard[] }`.

Then in `src/app/items/[slug]/page.tsx`, drop `canSuggest={canSuggest}` from the `<CraftTable .../>` and `<UsedInTable .../>` usages in the `tabContent` map (the `crafted-by` / `used-in` entries).

> Do NOT remove the page's own `canSuggest` (from `getSession()`) or `EntityDetail`'s `canSuggest` — they still gate the "Suggest a correction" / "Edit tabs" buttons. Only the recipe-table plumbing goes.

- [ ] **Step 3: Delete the now-unused component (if no references remain)**

Run: `grep -rn "SuggestRecipeLink" src/`
If only `src/components/SuggestRecipeLink.tsx` itself matches, delete it: `git rm src/components/SuggestRecipeLink.tsx`.

- [ ] **Step 4: Verify it typechecks and tests pass**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(wiki): route recipe editing through Edit tabs hub; drop per-recipe links"
```

---

## Final verification

- [ ] Run the full unit suite: `npm test` → all green.
- [ ] Typecheck: `npx tsc --noEmit` → no errors.
- [ ] Manual end-to-end (dev server):
  - Environment page → Edit tabs → add/edit/remove a Loot row → proposal → admin diff → approve → Loot tab updates.
  - Trampler page → Edit tabs → edit a Build Cost row → approve → tab updates.
  - Item page → Edit tabs → edit existing recipe (existing flow), propose a new recipe, propose a delete → all three show correct admin diffs → approve → Crafted-by/Used-in update.
  - Reseed (`npm run db:seed` against a scratch DB) → confirm a curated (contributor-applied) recipe keeps its lines while scraper recipes refresh.
```
