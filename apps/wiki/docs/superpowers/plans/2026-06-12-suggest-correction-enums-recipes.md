# Suggest-Correction: Enum Selects, Recipe Editing & Cancel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make community corrections richer — dropdown selects for enum-like fields (DB-derived, with an "Other…" escape hatch), full structured editing of recipes with one-click auto-apply, and a Cancel button on the forms.

**Architecture:** Keep all pure logic (type coercion, enum resolution, recipe parse/validate/diff) in plain modules with vitest unit tests; keep DB/UI glue thin and verify it by build/lint (matching this repo, where `applyProposal`/`submitEdit`/`getEntityFields` are not unit-tested). Recipe corrections use a new `Proposal.kind = "recipe_edit"` storing `{old,new}` snapshots; approval transactionally full-replaces the recipe's relation rows. No DB migration: `category`/`researchTier` columns already exist, and `kind` is a free-form string.

**Tech Stack:** Next.js (vendored, non-standard — read `node_modules/next/dist/docs/` before touching framework APIs), React server + `"use client"` components, Prisma 6 (Postgres/Neon), vitest, daisyUI/Tailwind classes.

**Reference spec:** [docs/superpowers/specs/2026-06-12-suggest-correction-enums-recipes-design.md](../specs/2026-06-12-suggest-correction-enums-recipes-design.md)

---

## File Structure

**Created:**
- `src/lib/recipe-proposal.ts` — pure recipe types + snapshot mapping, line parsing/validation, equality, line-diff, create-row builder.
- `src/lib/recipe-proposal.test.ts` — unit tests for the above.
- `src/components/EnumField.tsx` — `"use client"` select + "Other…" text reveal.
- `src/components/RecipeEditForm.tsx` — `"use client"` recipe editor (meta + dynamic input/output lines).
- `src/components/SuggestRecipeLink.tsx` — per-recipe "Suggest a correction" link.
- `src/app/contribute/edit-recipe/page.tsx` — recipe edit page (loads recipe + item list).

**Modified:**
- `src/lib/proposal-schema.ts` — `"enum"` field type, `enumValueType`, whitelist edits, `OTHER_OPTION`, `baseType`, `resolveEnumSubmission`, `coerceFloat`, `entityHref`.
- `src/lib/proposal-schema.test.ts` — update `rarity` type expectation; add enum/helper tests.
- `src/lib/proposal-entity.ts` — `getFieldOptions`, `getRecipeWorkbenches`.
- `src/components/EditProposalForm.tsx` — enum branch, `options` prop, Cancel link.
- `src/app/contribute/edit/page.tsx` — fetch enum options, pass to form.
- `src/app/contribute/actions.ts` — enum resolution in `submitEdit`, new `submitRecipeEdit`, use `entityHref`.
- `src/lib/proposal-apply.ts` — `applyRecipeProposal`.
- `src/app/admin/proposals/actions.ts` — `recipe_edit` branch in `approveProposal`.
- `src/app/admin/proposals/[id]/page.tsx` — `recipe_edit` diff rendering.
- `src/components/CraftTable.tsx`, `src/components/UsedInTable.tsx` — add the recipe link column.

**Commands** (run from `sand-wiki/`):
- Unit tests: `npm test` (vitest, single run)
- Focused test file: `npx vitest run src/lib/<file>.test.ts`
- Lint: `npm run lint`
- Typecheck: `npx tsc --noEmit`

---

## Task 1: Shared `entityHref` + Cancel button

**Files:**
- Modify: `src/lib/proposal-schema.ts`
- Modify: `src/lib/proposal-schema.test.ts`
- Modify: `src/app/contribute/actions.ts:43`
- Modify: `src/components/EditProposalForm.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/proposal-schema.test.ts` inside the existing `describe("proposal schema", ...)` block:

```ts
import { entityHref } from "./proposal-schema"; // add to the existing import line

it("maps target types to their public route", () => {
  expect(entityHref("item", "iron")).toBe("/items/iron");
  expect(entityHref("envEntity", "cave")).toBe("/environment/cave");
  expect(entityHref("tramplerPart", "wheel")).toBe("/tramplers/wheel");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/proposal-schema.test.ts`
Expected: FAIL — `entityHref is not a function` / no export.

- [ ] **Step 3: Implement `entityHref`**

Append to `src/lib/proposal-schema.ts`:

```ts
/** Public route for a correctable entity. Mirrors the segment names used by the
 *  app router (envEntity → /environment, item → /items, else /tramplers). */
export function entityHref(type: string, slug: string): string {
  const seg = type === "envEntity" ? "environment" : type === "item" ? "items" : "tramplers";
  return `/${seg}/${slug}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/proposal-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Use `entityHref` in `submitEdit`'s redirect**

In `src/app/contribute/actions.ts`, add `entityHref` to the existing import from `@/lib/proposal-schema`, then replace the final redirect of `submitEdit` (currently line 43):

```ts
  redirect(`${entityHref(type, slug)}?proposed=1`);
```

- [ ] **Step 6: Add the Cancel link to `EditProposalForm`**

In `src/components/EditProposalForm.tsx`, add imports at top:

```ts
import Link from "next/link";
import { entityHref } from "@/lib/proposal-schema";
```

Replace the lone submit button (currently the last element before `</form>`) with a button row:

```tsx
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Submit correction</button>
        <Link href={entityHref(type, slug)} className="btn btn-ghost">Cancel</Link>
      </div>
```

- [ ] **Step 7: Verify lint + typecheck**

Run: `npm run lint` then `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/proposal-schema.ts src/lib/proposal-schema.test.ts src/app/contribute/actions.ts src/components/EditProposalForm.tsx
git commit -m "feat(wiki): shared entityHref + Cancel button on correction form"
```

---

## Task 2: Enum field type + schema helpers

**Files:**
- Modify: `src/lib/proposal-schema.ts`
- Modify: `src/lib/proposal-schema.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/proposal-schema.test.ts`: update the existing rarity assertion and add new cases. Change the `"looks up a field definition"` test's first line to:

```ts
    expect(fieldDef("item", "rarity")?.type).toBe("enum");
```

Add these tests inside the `describe("proposal schema", ...)` block (extend the import to include `baseType, resolveEnumSubmission, coerceFloat, OTHER_OPTION`):

```ts
it("marks rarity/workbenchTier/category as enum and exposes value type", () => {
  expect(fieldDef("item", "rarity")).toMatchObject({ type: "enum", enumValueType: "string" });
  expect(fieldDef("item", "workbenchTier")).toMatchObject({ type: "enum", enumValueType: "int" });
  expect(fieldDef("item", "category")?.type).toBe("enum");
  expect(fieldDef("tramplerPart", "researchTier")).toMatchObject({ type: "enum", enumValueType: "int" });
});

it("reduces an enum field to its underlying scalar type for coercion", () => {
  expect(baseType(fieldDef("item", "rarity")!)).toBe("string");
  expect(baseType(fieldDef("item", "workbenchTier")!)).toBe("int");
  expect(baseType(fieldDef("item", "description")!)).toBe("text");
});

it("resolves an enum submission, preferring custom text when Other is picked", () => {
  expect(resolveEnumSubmission("Rare", "")).toBe("Rare");
  expect(resolveEnumSubmission(OTHER_OPTION, "Mythic")).toBe("Mythic");
});

it("coerces floats, blanking empties and non-numbers to null", () => {
  expect(coerceFloat("2.5")).toBe(2.5);
  expect(coerceFloat("")).toBeNull();
  expect(coerceFloat("abc")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/proposal-schema.test.ts`
Expected: FAIL — `enum` not assignable / `baseType` undefined / rarity still `"string"`.

- [ ] **Step 3: Implement the schema changes**

In `src/lib/proposal-schema.ts`, change the `FieldType` union and `EditableField`:

```ts
export type FieldType = "string" | "text" | "int" | "enum";

export interface EditableField {
  field: string;
  label: string;
  type: FieldType;
  /** Only for type "enum": the scalar type the chosen value coerces to. */
  enumValueType?: "string" | "int";
}

/** Sentinel select value meaning "let me type a value not in the list". */
export const OTHER_OPTION = "__other__";
```

In `EDITABLE_FIELDS`, change the `item.rarity` and `item.workbenchTier` entries and add `category`:

```ts
  item: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
    { field: "category", label: "Category", type: "enum", enumValueType: "string" },
    { field: "rarity", label: "Rarity", type: "enum", enumValueType: "string" },
    { field: "storageStack", label: "Storage stack", type: "int" },
    { field: "workbenchTier", label: "Workbench tier", type: "enum", enumValueType: "int" },
    { field: "statValue", label: "Value", type: "int" },
    { field: "damage", label: "Damage", type: "int" },
    { field: "playerDamage", label: "Player damage", type: "int" },
    { field: "tramplerDamage", label: "Trampler damage", type: "int" },
    { field: "splashDamage", label: "Splash damage", type: "int" },
    { field: "magazine", label: "Magazine", type: "int" },
    { field: "ammoName", label: "Ammo", type: "string" },
  ],
```

Add `category` to `envEntity` (after `description`):

```ts
    { field: "category", label: "Category", type: "enum", enumValueType: "string" },
```

Add `category` (after `description`) and `researchTier` (after `itemSlots`) to `tramplerPart`:

```ts
    { field: "category", label: "Category", type: "enum", enumValueType: "string" },
```
```ts
    { field: "researchTier", label: "Research tier", type: "enum", enumValueType: "int" },
```

Append the three new helper functions (alongside `coerceValue`):

```ts
/** Underlying scalar type used to coerce a field's submitted value. Enum fields
 *  defer to their enumValueType (default string); others use their own type. */
export function baseType(def: EditableField): FieldType {
  return def.type === "enum" ? (def.enumValueType ?? "string") : def.type;
}

/** Resolve an enum submission: the free-text custom value wins when the select
 *  value is the OTHER_OPTION sentinel. */
export function resolveEnumSubmission(raw: string, custom: string): string {
  return raw === OTHER_OPTION ? custom : raw;
}

/** Coerce a raw form string to a float. Empty/blank/non-numeric → null. */
export function coerceFloat(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/proposal-schema.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify the whole suite still passes (catch fallout)**

Run: `npm test`
Expected: PASS. (`applyableUpdate`/`detectStale` still work — enum fields remain in the whitelist, so `fieldDef` returns them.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/proposal-schema.ts src/lib/proposal-schema.test.ts
git commit -m "feat(wiki): enum field type + category/researchTier in edit whitelist"
```

---

## Task 3: DB-derived option sources

**Files:**
- Modify: `src/lib/proposal-entity.ts`

No unit test — this is thin Prisma glue, consistent with `getEntityFields` (also untested). Verified by build/typecheck and used by Task 4.

- [ ] **Step 1: Implement `getFieldOptions` and `getRecipeWorkbenches`**

Append to `src/lib/proposal-entity.ts`:

```ts
/** Distinct existing non-empty values for a whitelisted column, for building a
 *  select. Fetches full rows then plucks/dedupes (mirrors getEntityFields, which
 *  avoids a dynamically-built `select` that can't be typed against Prisma).
 *  Numeric values sort ascending; strings sort lexically. */
export async function getFieldOptions(type: string, field: string): Promise<string[]> {
  if (!isEditableTarget(type)) return [];
  const rows =
    type === "item"
      ? await prisma.item.findMany()
      : type === "envEntity"
        ? await prisma.envEntity.findMany()
        : await prisma.tramplerPart.findMany();

  const set = new Set<string | number>();
  for (const r of rows as unknown as Record<string, unknown>[]) {
    const v = r[field];
    if (v !== null && v !== undefined && v !== "") set.add(v as string | number);
  }
  const vals = [...set];
  const allNum = vals.every((v) => typeof v === "number");
  const sorted = allNum
    ? (vals as number[]).sort((a, b) => a - b)
    : (vals as (string | number)[]).map(String).sort();
  return sorted.map(String);
}

/** Distinct workbench names used by existing recipes (for the recipe editor). */
export async function getRecipeWorkbenches(): Promise<string[]> {
  const rows = await prisma.recipe.findMany({ select: { workbench: true } });
  const set = new Set<string>();
  for (const r of rows) if (r.workbench) set.add(r.workbench);
  return [...set].sort();
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/proposal-entity.ts
git commit -m "feat(wiki): DB-derived option sources for enum selects + recipe workbenches"
```

---

## Task 4: Enum select in the edit form

**Files:**
- Create: `src/components/EnumField.tsx`
- Modify: `src/components/EditProposalForm.tsx`
- Modify: `src/app/contribute/edit/page.tsx`
- Modify: `src/app/contribute/actions.ts`

No unit test (client UI + server action glue). Verified by build/typecheck; manual check noted at the end.

- [ ] **Step 1: Create `EnumField`**

Create `src/components/EnumField.tsx`:

```tsx
"use client";

import { useState } from "react";
import { OTHER_OPTION } from "@/lib/proposal-schema";

/** A select of known values plus an "Other…" option that reveals a free-text
 *  input. The select posts `name`; the reveal posts `name__custom`. The server
 *  (resolveEnumSubmission) takes the custom value when OTHER_OPTION is chosen. */
export function EnumField({ field, value, options }: { field: string; value: string; options: string[] }) {
  const isKnown = value !== "" && options.includes(value);
  const [sel, setSel] = useState(value === "" ? "" : isKnown ? value : OTHER_OPTION);
  return (
    <>
      <select
        name={field}
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="select select-bordered w-full"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={OTHER_OPTION}>Other…</option>
      </select>
      {sel === OTHER_OPTION && (
        <input
          name={`${field}__custom`}
          defaultValue={isKnown ? "" : value}
          placeholder="Type a new value"
          className="input input-bordered w-full mt-1"
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Render enum fields in `EditProposalForm`**

In `src/components/EditProposalForm.tsx`, add the import and `options` prop, and an enum branch. The component becomes:

```tsx
import Link from "next/link";
import { submitEdit } from "@/app/contribute/actions";
import { entityHref, type EditableField } from "@/lib/proposal-schema";
import { EnumField } from "@/components/EnumField";

export function EditProposalForm({
  type,
  slug,
  fields,
  values,
  options,
}: {
  type: string;
  slug: string;
  fields: EditableField[];
  values: Record<string, string | number | null>;
  options: Record<string, string[]>;
}) {
  return (
    <form action={submitEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      {fields.map((f) => (
        <label key={f.field} className="block space-y-1">
          <span className="text-sm font-medium">{f.label}</span>
          {f.type === "enum" ? (
            <EnumField field={f.field} value={String(values[f.field] ?? "")} options={options[f.field] ?? []} />
          ) : f.type === "text" ? (
            <textarea name={f.field} defaultValue={values[f.field] ?? ""} className="textarea textarea-bordered w-full" rows={3} />
          ) : (
            <input
              name={f.field}
              type={f.type === "int" ? "number" : "text"}
              defaultValue={values[f.field] ?? ""}
              className="input input-bordered w-full"
            />
          )}
        </label>
      ))}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Note / source (optional)</span>
        <textarea name="note" className="textarea textarea-bordered w-full" rows={2} placeholder="Where did you confirm this?" />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Submit correction</button>
        <Link href={entityHref(type, slug)} className="btn btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}
```

(Note: this supersedes Task 1 Step 6's button-row edit — same markup, now with the enum import already present.)

- [ ] **Step 3: Fetch options in the edit page**

In `src/app/contribute/edit/page.tsx`, import `getFieldOptions` and build the options map. Replace the body after `if (!current) notFound();`:

```tsx
  const fields = editableFields(type);
  const options: Record<string, string[]> = {};
  for (const f of fields) {
    if (f.type === "enum") options[f.field] = await getFieldOptions(type, f.field);
  }

  return (
    <article className="py-6 space-y-6">
      <h1 className="font-display text-2xl font-bold">Suggest a correction — {current.name}</h1>
      <p className="text-base-content/70">Change only what is wrong. An admin reviews every change before it goes live.</p>
      <EditProposalForm type={type} slug={slug} fields={fields} values={current.values} options={options} />
    </article>
  );
```

Add `getFieldOptions` to the existing `@/lib/proposal-entity` import.

- [ ] **Step 4: Resolve enum submissions in `submitEdit`**

In `src/app/contribute/actions.ts`, extend the `@/lib/proposal-schema` import to include `baseType, resolveEnumSubmission`. Replace the coercion loop in `submitEdit`:

```ts
  const submitted: Record<string, string | number | null> = {};
  for (const f of editableFields(type)) {
    const def = fieldDef(type, f.field)!;
    let raw = String(formData.get(f.field) ?? "");
    if (def.type === "enum") {
      raw = resolveEnumSubmission(raw, String(formData.get(`${f.field}__custom`) ?? ""));
    }
    submitted[f.field] = coerceValue(baseType(def), raw);
  }
```

- [ ] **Step 5: Verify typecheck + lint + suite**

Run: `npx tsc --noEmit` then `npm run lint` then `npm test`
Expected: no errors; tests pass.

- [ ] **Step 6: Manual smoke (note for executor)**

Start `npm run dev`, open `/contribute/edit?type=item&slug=<an item slug>`, confirm Rarity/Category/Workbench-tier render as selects with existing values + "Other…", and that picking "Other…" reveals a text box. Submit a change and confirm the proposal appears in `/admin/proposals`.

- [ ] **Step 7: Commit**

```bash
git add src/components/EnumField.tsx src/components/EditProposalForm.tsx src/app/contribute/edit/page.tsx src/app/contribute/actions.ts
git commit -m "feat(wiki): enum select fields with Other escape hatch in correction form"
```

---

## Task 5: Recipe-proposal pure logic

**Files:**
- Create: `src/lib/recipe-proposal.ts`
- Create: `src/lib/recipe-proposal.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recipe-proposal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  recipeToSnapshot,
  parseRecipeLines,
  snapshotsEqual,
  buildLineCreates,
  diffRecipeLines,
  type RecipeSnapshot,
} from "./recipe-proposal";

const names = new Map([["iron", "Iron"], ["bolt", "Bolt"], ["screw", "Screw"]]);

describe("recipeToSnapshot", () => {
  it("flattens a recipe row with included items into a snapshot", () => {
    const snap = recipeToSnapshot({
      workbench: "Forge",
      tier: 1,
      craftTimeSeconds: 5,
      inputs: [{ amount: 2, item: { slug: "iron", name: "Iron" } }],
      outputs: [{ amount: 1, item: { slug: "bolt", name: "Bolt" } }],
    });
    expect(snap).toEqual({
      workbench: "Forge",
      tier: 1,
      craftTimeSeconds: 5,
      inputs: [{ slug: "iron", name: "Iron", amount: 2 }],
      outputs: [{ slug: "bolt", name: "Bolt", amount: 1 }],
    });
  });
});

describe("parseRecipeLines", () => {
  it("pairs slugs/amounts, drops blank rows, resolves names", () => {
    const r = parseRecipeLines(["iron", "", "bolt"], ["2", "9", "1"], names);
    expect(r.error).toBeNull();
    expect(r.lines).toEqual([
      { slug: "iron", name: "Iron", amount: 2 },
      { slug: "bolt", name: "Bolt", amount: 1 },
    ]);
  });

  it("rejects an unknown slug", () => {
    const r = parseRecipeLines(["mystery"], ["1"], names);
    expect(r.lines).toEqual([]);
    expect(r.error).toMatch(/unknown item/i);
  });

  it("rejects a non-positive or non-integer amount", () => {
    expect(parseRecipeLines(["iron"], ["0"], names).error).toMatch(/positive whole number/i);
    expect(parseRecipeLines(["iron"], ["1.5"], names).error).toMatch(/positive whole number/i);
    expect(parseRecipeLines(["iron"], [""], names).error).toMatch(/positive whole number/i);
  });
});

describe("snapshotsEqual", () => {
  const base: RecipeSnapshot = {
    workbench: "Forge", tier: 1, craftTimeSeconds: 5,
    inputs: [{ slug: "iron", name: "Iron", amount: 2 }],
    outputs: [{ slug: "bolt", name: "Bolt", amount: 1 }],
  };
  it("is true for identical snapshots", () => {
    expect(snapshotsEqual(base, JSON.parse(JSON.stringify(base)))).toBe(true);
  });
  it("is false when an amount changes", () => {
    const b = JSON.parse(JSON.stringify(base)) as RecipeSnapshot;
    b.inputs[0].amount = 3;
    expect(snapshotsEqual(base, b)).toBe(false);
  });
  it("is false when meta changes", () => {
    const b = JSON.parse(JSON.stringify(base)) as RecipeSnapshot;
    b.tier = 2;
    expect(snapshotsEqual(base, b)).toBe(false);
  });
});

describe("buildLineCreates", () => {
  const ids = new Map([["iron", "id-iron"], ["bolt", "id-bolt"]]);
  it("resolves slugs to itemId create rows", () => {
    expect(buildLineCreates([{ slug: "iron", name: "Iron", amount: 2 }], ids)).toEqual([
      { itemId: "id-iron", amount: 2 },
    ]);
  });
  it("throws when a slug cannot be resolved", () => {
    expect(() => buildLineCreates([{ slug: "ghost", name: "Ghost", amount: 1 }], ids)).toThrow();
  });
});

describe("diffRecipeLines", () => {
  it("classifies added / removed / changed / same lines", () => {
    const oldL = [
      { slug: "iron", name: "Iron", amount: 2 },
      { slug: "bolt", name: "Bolt", amount: 1 },
    ];
    const newL = [
      { slug: "iron", name: "Iron", amount: 3 },
      { slug: "screw", name: "Screw", amount: 4 },
    ];
    const rows = diffRecipeLines(oldL, newL);
    expect(rows).toEqual([
      { slug: "iron", name: "Iron", oldAmount: 2, newAmount: 3, status: "changed" },
      { slug: "bolt", name: "Bolt", oldAmount: 1, newAmount: null, status: "removed" },
      { slug: "screw", name: "Screw", oldAmount: null, newAmount: 4, status: "added" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/recipe-proposal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/recipe-proposal.ts`**

```ts
export interface RecipeLineDraft {
  slug: string;
  name: string;
  amount: number;
}

export interface RecipeSnapshot {
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  inputs: RecipeLineDraft[];
  outputs: RecipeLineDraft[];
}

/** Stored shape of a recipe_edit proposal's `changes` JSON. */
export interface RecipeProposalChange {
  old: RecipeSnapshot;
  new: RecipeSnapshot;
}

/** A recipe row with its inputs/outputs and the related item's slug+name. */
interface RawRecipe {
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  inputs: { amount: number; item: { slug: string; name: string } }[];
  outputs: { amount: number; item: { slug: string; name: string } }[];
}

const toLine = (x: { amount: number; item: { slug: string; name: string } }): RecipeLineDraft => ({
  slug: x.item.slug,
  name: x.item.name,
  amount: x.amount,
});

/** Flatten a loaded recipe (with included items) into a comparable snapshot. */
export function recipeToSnapshot(r: RawRecipe): RecipeSnapshot {
  return {
    workbench: r.workbench,
    tier: r.tier,
    craftTimeSeconds: r.craftTimeSeconds,
    inputs: r.inputs.map(toLine),
    outputs: r.outputs.map(toLine),
  };
}

export interface ParsedLines {
  lines: RecipeLineDraft[];
  error: string | null;
}

/** Pair index-aligned slug/amount arrays into validated lines. Blank rows (no
 *  slug) are dropped. Returns an error if a kept row has an unknown slug or a
 *  non-positive / non-integer amount. */
export function parseRecipeLines(
  slugs: string[],
  amounts: string[],
  nameBySlug: Map<string, string>,
): ParsedLines {
  const lines: RecipeLineDraft[] = [];
  for (let i = 0; i < slugs.length; i++) {
    const slug = (slugs[i] ?? "").trim();
    if (slug === "") continue;
    const name = nameBySlug.get(slug);
    if (!name) return { lines: [], error: `Unknown item: ${slug}` };
    const n = Number((amounts[i] ?? "").trim());
    if (!Number.isInteger(n) || n <= 0) {
      return { lines: [], error: `Amount for ${name} must be a positive whole number.` };
    }
    lines.push({ slug, name, amount: n });
  }
  return { lines, error: null };
}

const linesEqual = (a: RecipeLineDraft[], b: RecipeLineDraft[]): boolean =>
  a.length === b.length && a.every((l, i) => l.slug === b[i].slug && l.amount === b[i].amount);

/** True when two snapshots match on meta and ordered lines. */
export function snapshotsEqual(a: RecipeSnapshot, b: RecipeSnapshot): boolean {
  return (
    a.workbench === b.workbench &&
    a.tier === b.tier &&
    a.craftTimeSeconds === b.craftTimeSeconds &&
    linesEqual(a.inputs, b.inputs) &&
    linesEqual(a.outputs, b.outputs)
  );
}

/** Resolve draft lines to {itemId, amount} create rows. Throws on a missing slug. */
export function buildLineCreates(
  lines: RecipeLineDraft[],
  idBySlug: Map<string, string>,
): { itemId: string; amount: number }[] {
  return lines.map((l) => {
    const itemId = idBySlug.get(l.slug);
    if (!itemId) throw new Error(`Cannot resolve item ${l.slug}`);
    return { itemId, amount: l.amount };
  });
}

export interface LineDiffRow {
  slug: string;
  name: string;
  oldAmount: number | null;
  newAmount: number | null;
  status: "added" | "removed" | "changed" | "same";
}

/** Per-slug diff of two line lists (old order first, then new-only slugs). */
export function diffRecipeLines(oldLines: RecipeLineDraft[], newLines: RecipeLineDraft[]): LineDiffRow[] {
  const oldBy = new Map(oldLines.map((l) => [l.slug, l]));
  const newBy = new Map(newLines.map((l) => [l.slug, l]));
  const slugs = [...new Set([...oldLines.map((l) => l.slug), ...newLines.map((l) => l.slug)])];
  return slugs.map((slug) => {
    const o = oldBy.get(slug);
    const n = newBy.get(slug);
    const name = (n ?? o)!.name;
    const status: LineDiffRow["status"] = !o ? "added" : !n ? "removed" : o.amount !== n.amount ? "changed" : "same";
    return { slug, name, oldAmount: o?.amount ?? null, newAmount: n?.amount ?? null, status };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/recipe-proposal.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipe-proposal.ts src/lib/recipe-proposal.test.ts
git commit -m "feat(wiki): pure recipe-proposal logic (snapshot, parse, diff, creates)"
```

---

## Task 6: Recipe correction entry point

**Files:**
- Create: `src/components/SuggestRecipeLink.tsx`
- Modify: `src/components/CraftTable.tsx`
- Modify: `src/components/UsedInTable.tsx`

- [ ] **Step 1: Create `SuggestRecipeLink`**

Create `src/components/SuggestRecipeLink.tsx` (mirrors `SuggestCorrectionLink`):

```tsx
import Link from "next/link";

export function SuggestRecipeLink({ slug }: { slug: string }) {
  return (
    <Link href={`/contribute/edit-recipe?slug=${slug}`} className="btn btn-ghost btn-xs">
      Suggest a correction
    </Link>
  );
}
```

- [ ] **Step 2: Add the link column to `CraftTable`**

In `src/components/CraftTable.tsx`, import the link and add a trailing column. The `null` sort key makes the column inert (clicking its header does not reorder). Updated body:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";
import { SuggestRecipeLink } from "@/components/SuggestRecipeLink";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function CraftTable({ recipes }: { recipes: RecipeCard[] }) {
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.inputs), r.craftTimeSeconds, workbenchKey(r), null],
    cells: [
      <IngredientList key="i" rows={r.inputs} />,
      <span key="t" className="whitespace-nowrap">{r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—"}</span>,
      <WorkbenchBadge key="w" recipe={r} />,
      <SuggestRecipeLink key="e" slug={r.slug} />,
    ],
  }));
  return (
    <SortableTable
      caption="Recipes that craft this item"
      columns={[{ label: "Ingredients" }, { label: "Time" }, { label: "Workbench" }, { label: "Edit", alignRight: true }]}
      rows={rows}
    />
  );
}
```

- [ ] **Step 3: Add the link column to `UsedInTable`**

In `src/components/UsedInTable.tsx`, the same pattern. Updated body:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";
import { SuggestRecipeLink } from "@/components/SuggestRecipeLink";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function UsedInTable({ recipes }: { recipes: RecipeCard[] }) {
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.outputs), names(r.inputs), workbenchKey(r), null],
    cells: [
      <IngredientList key="o" rows={r.outputs} />,
      <IngredientList key="i" rows={r.inputs} />,
      <WorkbenchBadge key="w" recipe={r} />,
      <SuggestRecipeLink key="e" slug={r.slug} />,
    ],
  }));
  return (
    <SortableTable
      caption="Recipes that use this item"
      columns={[{ label: "Produces" }, { label: "Ingredients" }, { label: "Workbench" }, { label: "Edit", alignRight: true }]}
      rows={rows}
    />
  );
}
```

- [ ] **Step 4: Verify typecheck + lint + suite**

Run: `npx tsc --noEmit` then `npm run lint` then `npm test`
Expected: no errors; tests pass. (`SortableTableRow.keys` accepts `null` — `workbenchKey` already returns `string | null`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/SuggestRecipeLink.tsx src/components/CraftTable.tsx src/components/UsedInTable.tsx
git commit -m "feat(wiki): per-recipe Suggest-a-correction link in craft/used-in tables"
```

---

## Task 7: Recipe edit page, form & submit action

**Files:**
- Create: `src/components/RecipeEditForm.tsx`
- Create: `src/app/contribute/edit-recipe/page.tsx`
- Modify: `src/app/contribute/actions.ts`

No unit test (UI + DB action). Verified by build/typecheck + manual smoke.

- [ ] **Step 1: Create `RecipeEditForm`**

Create `src/components/RecipeEditForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { submitRecipeEdit } from "@/app/contribute/actions";
import { EnumField } from "@/components/EnumField";
import type { RecipeLineDraft, RecipeSnapshot } from "@/lib/recipe-proposal";

type ItemOption = { slug: string; name: string };
type Side = "input" | "output";

function blankLine(): RecipeLineDraft {
  return { slug: "", name: "", amount: 1 };
}

function LineEditor({
  side,
  lines,
  setLines,
  items,
}: {
  side: Side;
  lines: RecipeLineDraft[];
  setLines: (next: RecipeLineDraft[]) => void;
  items: ItemOption[];
}) {
  const update = (i: number, patch: Partial<RecipeLineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{side === "input" ? "Inputs" : "Outputs"}</legend>
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            name={`${side}Slug`}
            value={l.slug}
            onChange={(e) => update(i, { slug: e.target.value })}
            className="select select-bordered select-sm grow"
          >
            <option value="">— select item —</option>
            {items.map((it) => (
              <option key={it.slug} value={it.slug}>{it.name}</option>
            ))}
          </select>
          <input
            name={`${side}Amount`}
            type="number"
            min={1}
            value={l.amount}
            onChange={(e) => update(i, { amount: Number(e.target.value) })}
            className="input input-bordered input-sm w-24"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setLines([...lines, blankLine()])}>
        Add {side}
      </button>
    </fieldset>
  );
}

export function RecipeEditForm({
  slug,
  snapshot,
  items,
  workbenches,
  backHref,
}: {
  slug: string;
  snapshot: RecipeSnapshot;
  items: ItemOption[];
  workbenches: string[];
  backHref: string;
}) {
  const [inputs, setInputs] = useState<RecipeLineDraft[]>(snapshot.inputs.length ? snapshot.inputs : [blankLine()]);
  const [outputs, setOutputs] = useState<RecipeLineDraft[]>(snapshot.outputs.length ? snapshot.outputs : [blankLine()]);

  return (
    <form action={submitRecipeEdit} className="space-y-5 max-w-2xl">
      <input type="hidden" name="slug" value={slug} />

      <label className="block space-y-1">
        <span className="text-sm font-medium">Workbench</span>
        <EnumField field="workbench" value={snapshot.workbench ?? ""} options={workbenches} />
      </label>
      <div className="flex gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Tier</span>
          <input name="tier" type="number" defaultValue={snapshot.tier ?? ""} className="input input-bordered w-28" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Craft time (sec)</span>
          <input name="craftTimeSeconds" type="number" step="any" defaultValue={snapshot.craftTimeSeconds ?? ""} className="input input-bordered w-36" />
        </label>
      </div>

      <LineEditor side="input" lines={inputs} setLines={setInputs} items={items} />
      <LineEditor side="output" lines={outputs} setLines={setOutputs} items={items} />

      <label className="block space-y-1">
        <span className="text-sm font-medium">Note / source (optional)</span>
        <textarea name="note" className="textarea textarea-bordered w-full" rows={2} placeholder="Where did you confirm this?" />
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Submit correction</button>
        <Link href={backHref} className="btn btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Add `submitRecipeEdit` to the actions file**

In `src/app/contribute/actions.ts`: extend the `@/lib/proposal-schema` import to include `coerceFloat`, add an import for the recipe helpers, then append the action.

Add import:

```ts
import { recipeToSnapshot, parseRecipeLines, snapshotsEqual, type RecipeSnapshot } from "@/lib/recipe-proposal";
```

Append:

```ts
export async function submitRecipeEdit(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const note = (String(formData.get("note") ?? "").trim() || null) as string | null;
  if (!slug) throw new Error("Missing recipe.");

  const session = await requireUser(`/contribute/edit-recipe?slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      inputs: { include: { item: { select: { slug: true, name: true } } } },
      outputs: { include: { item: { select: { slug: true, name: true } } } },
    },
  });
  if (!recipe) throw new Error("Recipe not found.");

  const items = await prisma.item.findMany({ select: { slug: true, name: true } });
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
  const oldSnap = recipeToSnapshot(recipe);
  if (snapshotsEqual(oldSnap, newSnap)) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: {
      kind: "recipe_edit",
      targetType: "recipe",
      targetSlug: slug,
      changes: { old: oldSnap, new: newSnap } as object,
      note,
      proposerId: session.steamId,
    },
  });

  const out = newSnap.outputs[0]?.slug ?? oldSnap.outputs[0]?.slug;
  redirect(out ? `${entityHref("item", out)}?proposed=1` : "/items?proposed=1");
}
```

(`entityHref`, `resolveEnumSubmission`, `coerceValue` are already imported from earlier tasks; add `coerceFloat` to that import.)

- [ ] **Step 3: Create the recipe edit page**

Create `src/app/contribute/edit-recipe/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { entityHref } from "@/lib/proposal-schema";
import { getRecipeWorkbenches } from "@/lib/proposal-entity";
import { recipeToSnapshot } from "@/lib/recipe-proposal";
import { RecipeEditForm } from "@/components/RecipeEditForm";

type SP = Promise<{ slug?: string }>;

export default async function EditRecipePage({ searchParams }: { searchParams: SP }) {
  const { slug = "" } = await searchParams;
  if (!slug) notFound();
  await requireUser(`/contribute/edit-recipe?slug=${slug}`);

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      inputs: { include: { item: { select: { slug: true, name: true } } } },
      outputs: { include: { item: { select: { slug: true, name: true } } } },
    },
  });
  if (!recipe) notFound();

  const snapshot = recipeToSnapshot(recipe);
  const items = await prisma.item.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } });
  const workbenches = await getRecipeWorkbenches();
  const primaryOutput = snapshot.outputs[0];
  const title = primaryOutput?.name ?? slug;
  const backHref = primaryOutput ? entityHref("item", primaryOutput.slug) : "/items";

  return (
    <article className="py-6 space-y-6">
      <h1 className="font-display text-2xl font-bold">Suggest a recipe correction — {title}</h1>
      <p className="text-base-content/70">Edit the workbench, timing, ingredients, or outputs. An admin reviews every change before it goes live.</p>
      <RecipeEditForm slug={slug} snapshot={snapshot} items={items} workbenches={workbenches} backHref={backHref} />
    </article>
  );
}
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual smoke (note for executor)**

`npm run dev`, open an item page that has a recipe, click "Suggest a correction" in the recipe row → confirm the form loads with current inputs/outputs/meta. Add an input line, change an amount, submit → confirm a `recipe_edit` proposal appears in `/admin/proposals`. Submitting with no change should error "No changes to submit."

- [ ] **Step 6: Commit**

```bash
git add src/components/RecipeEditForm.tsx src/app/contribute/edit-recipe/page.tsx src/app/contribute/actions.ts
git commit -m "feat(wiki): recipe edit page, form, and submit action"
```

---

## Task 8: Apply recipe proposals on approval

**Files:**
- Modify: `src/lib/proposal-apply.ts`
- Modify: `src/app/admin/proposals/actions.ts`

The pure resolution (`buildLineCreates`) is already tested in Task 5; this task is the transactional DB glue (untested, like `applyProposal`).

- [ ] **Step 1: Implement `applyRecipeProposal`**

In `src/lib/proposal-apply.ts`, add the import and the function. Add to imports:

```ts
import { buildLineCreates, type RecipeProposalChange } from "./recipe-proposal";
```

Append:

```ts
/** Apply an approved recipe_edit proposal: update meta and full-replace the
 *  recipe's input/output rows (these tables have no sortOrder, so replace is
 *  clean). Resolves item slugs to ids; throws if any referenced item is gone. */
export async function applyRecipeProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "recipe_edit" || p.targetType !== "recipe" || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending recipe edit.");
    }
    const snap = (p.changes as unknown as RecipeProposalChange).new;

    const recipe = await tx.recipe.findUnique({ where: { slug: p.targetSlug } });
    if (!recipe) throw new Error("Recipe not found.");

    const slugs = [...new Set([...snap.inputs, ...snap.outputs].map((l) => l.slug))];
    const items = await tx.item.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const idBySlug = new Map(items.map((i) => [i.slug, i.id]));

    // Resolve before any write so a missing item aborts the transaction cleanly.
    const inputCreates = buildLineCreates(snap.inputs, idBySlug).map((c) => ({ ...c, recipeId: recipe.id }));
    const outputCreates = buildLineCreates(snap.outputs, idBySlug).map((c) => ({ ...c, recipeId: recipe.id }));

    await tx.recipe.update({
      where: { id: recipe.id },
      data: { workbench: snap.workbench, tier: snap.tier, craftTimeSeconds: snap.craftTimeSeconds },
    });
    await tx.recipeInput.deleteMany({ where: { recipeId: recipe.id } });
    await tx.recipeOutput.deleteMany({ where: { recipeId: recipe.id } });
    if (inputCreates.length) await tx.recipeInput.createMany({ data: inputCreates });
    if (outputCreates.length) await tx.recipeOutput.createMany({ data: outputCreates });

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
```

- [ ] **Step 2: Route recipe_edit through `approveProposal`**

In `src/app/admin/proposals/actions.ts`, add to the import: `import { applyProposal, applyRecipeProposal } from "@/lib/proposal-apply";`. Replace the `if (p.kind === "edit") { ... } else { ... }` block in `approveProposal`:

```ts
  if (p.kind === "edit") {
    await applyProposal(id, session.steamId); // writes canonical row + marks applied
  } else if (p.kind === "recipe_edit") {
    await applyRecipeProposal(id, session.steamId); // rewrites relation rows + marks applied
  } else {
    // new_page: admin creates the row in Directus manually; just close it out.
    await prisma.proposal.update({
      where: { id },
      data: { status: "applied", reviewedById: session.steamId, reviewedAt: new Date() },
    });
  }
```

- [ ] **Step 3: Verify typecheck + lint + suite**

Run: `npx tsc --noEmit` then `npm run lint` then `npm test`
Expected: no errors; tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/proposal-apply.ts src/app/admin/proposals/actions.ts
git commit -m "feat(wiki): auto-apply recipe_edit proposals on approval"
```

---

## Task 9: Admin recipe-edit diff view

**Files:**
- Modify: `src/app/admin/proposals/[id]/page.tsx`

No unit test (the diff helpers `diffRecipeLines`/`snapshotsEqual` are tested in Task 5); this is rendering glue.

- [ ] **Step 1: Render the recipe_edit branch**

In `src/app/admin/proposals/[id]/page.tsx`, add imports:

```ts
import { recipeToSnapshot, snapshotsEqual, diffRecipeLines, type RecipeProposalChange } from "@/lib/recipe-proposal";
```

After the existing `if (p.kind === "edit" && ...)` block that computes `diff`/`current`/`stale`, add a recipe branch that loads the live recipe and computes the change + staleness:

```tsx
  let recipeChange: RecipeProposalChange | null = null;
  let recipeStale = false;
  if (p.kind === "recipe_edit" && p.targetSlug && p.changes) {
    recipeChange = p.changes as unknown as RecipeProposalChange;
    const live = await prisma.recipe.findUnique({
      where: { slug: p.targetSlug },
      include: {
        inputs: { include: { item: { select: { slug: true, name: true } } } },
        outputs: { include: { item: { select: { slug: true, name: true } } } },
      },
    });
    recipeStale = !live || !snapshotsEqual(recipeChange.old, recipeToSnapshot(live));
  }
```

Then, in the JSX, replace the current two-way render (`{p.kind === "edit" && diff ? (table) : (note)}`) with a three-way render that adds the recipe case. Use this block in place of the existing conditional:

```tsx
      {p.kind === "edit" && diff ? (
        <table className="table">
          <thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
          <tbody>
            {Object.entries(diff).map(([field, c]) => (
              <tr key={field} className={stale.includes(field) ? "bg-warning/20" : ""}>
                <td>{field}{stale.includes(field) && <span className="badge badge-warning badge-sm ml-2">base changed</span>}</td>
                <td>{String(current[field] ?? "—")}</td>
                <td className="font-medium">{String(c.new ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : p.kind === "recipe_edit" && recipeChange ? (
        <div className="space-y-4">
          {recipeStale && <div className="alert alert-warning">The recipe changed since this was proposed (base changed).</div>}
          <table className="table">
            <thead><tr><th>Meta</th><th>Current</th><th>Proposed</th></tr></thead>
            <tbody>
              {(["workbench", "tier", "craftTimeSeconds"] as const).map((k) => (
                <tr key={k} className={recipeChange!.old[k] !== recipeChange!.new[k] ? "bg-warning/10" : ""}>
                  <td>{k}</td>
                  <td>{String(recipeChange!.old[k] ?? "—")}</td>
                  <td className="font-medium">{String(recipeChange!.new[k] ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(["inputs", "outputs"] as const).map((side) => (
            <div key={side}>
              <h2 className="font-display text-lg font-semibold capitalize">{side}</h2>
              <table className="table">
                <thead><tr><th>Item</th><th>Current</th><th>Proposed</th></tr></thead>
                <tbody>
                  {diffRecipeLines(recipeChange!.old[side], recipeChange!.new[side]).map((row) => (
                    <tr key={row.slug} className={row.status === "same" ? "" : "bg-warning/10"}>
                      <td>{row.name}{row.status !== "same" && <span className="badge badge-sm ml-2">{row.status}</span>}</td>
                      <td>{row.oldAmount ?? "—"}</td>
                      <td className="font-medium">{row.newAmount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="whitespace-pre-wrap rounded-box border border-base-300 p-3">{p.note}</div>
      )}
```

Also update the page heading line (currently `{p.kind === "edit" ? ... : ...}`) to name recipe edits:

```tsx
        {p.kind === "edit"
          ? `Edit · ${p.targetType} · ${p.targetSlug}`
          : p.kind === "recipe_edit"
            ? `Recipe edit · ${p.targetSlug}`
            : `New page · ${p.proposedName}`}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual smoke (note for executor)**

As an admin, open the `recipe_edit` proposal created in Task 7 at `/admin/proposals/[id]`: confirm the meta + input/output diffs render with added/removed/changed badges. Click "Approve & apply", then reload the item page and confirm the recipe reflects the change. Edit the recipe in Directus between proposing and approving to confirm the "base changed" banner appears.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/proposals/[id]/page.tsx
git commit -m "feat(wiki): admin diff view for recipe_edit proposals"
```

---

## Final verification

- [ ] Run the full suite: `npm test` → all pass.
- [ ] Typecheck: `npx tsc --noEmit` → clean.
- [ ] Lint: `npm run lint` → clean.
- [ ] Build: `npm run build` → succeeds (catches server/client boundary issues the dev server tolerates).
- [ ] Walk the manual smoke notes from Tasks 4, 7, and 9 end-to-end once.

---

## Self-Review Notes (author)

- **Spec coverage:** Cancel button (T1) ✓; enum type + whitelist additions category/researchTier (T2) ✓; DB-derived options (T3) ✓; Other… escape hatch (T4 `EnumField`) ✓; recipe entry point (T6) ✓; structured recipe form meta+lines (T7) ✓; structured `{old,new}` storage (T7) ✓; submit validation + no-change + quota + redirect to primary output (T7) ✓; auto-apply full-replace (T8) ✓; admin recipe diff + stale warning (T9) ✓; testing of pure logic (T2, T5) ✓.
- **No migration:** confirmed — `category`/`researchTier` columns exist; `kind`/`targetType` are free strings.
- **Type consistency:** `RecipeSnapshot`/`RecipeLineDraft`/`RecipeProposalChange` defined in T5, consumed unchanged in T7/T8/T9. `baseType`/`resolveEnumSubmission`/`coerceFloat`/`entityHref`/`OTHER_OPTION` defined in T1–T2, consumed in T4/T7. `getFieldOptions`/`getRecipeWorkbenches` defined in T3, consumed in T4/T7.
- **Known follow-ups (out of scope):** typeahead item picker; loot-table/trampler-cost relational editing; statType/loot-tier enums.
