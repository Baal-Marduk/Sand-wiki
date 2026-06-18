# Wiki Polish: Ordered Selects, Auth-Gated Links, Sticky Sidebar & Item Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order/label the rarity & category selects in the correction form, hide the suggest-correction entry points from logged-out users, make the "Jump to" sidebar stay visible while scrolling, and let item descriptions link to other items via `[[slug]]`.

**Architecture:** Four independent slices. Pure logic (enum option ordering, `[[slug]]` parsing) lives in prisma-free modules with vitest unit tests; DB/UI glue is verified by typecheck/lint/build (repo convention). In-description linking is rendered by an async server component (`DescriptionText`) that batch-resolves referenced items.

**Tech Stack:** Next.js (vendored, NON-STANDARD — match existing file patterns, don't invent framework APIs), React server + `"use client"` components, Prisma 6, vitest, daisyUI/Tailwind.

**Reference spec:** [docs/superpowers/specs/2026-06-12-wiki-polish-links-auth-sidebar-design.md](../specs/2026-06-12-wiki-polish-links-auth-sidebar-design.md)

**Commands** (from `sand-wiki/`): unit `npm test`; focused `npx vitest run src/lib/<file>.test.ts`; types `npx tsc --noEmit`; lint `npm run lint` (2 pre-existing `directus/` warnings are acceptable; introduce no new errors); build `npm run build`.

---

## File Structure

**Created:**
- `src/lib/description-links.ts` + `.test.ts` — pure `[[slug]]` parser (`parseDescription`, `collectSlugs`).
- `src/components/ItemTextLink.tsx` — inline rarity-tinted item link.
- `src/components/DescriptionText.tsx` — async server component rendering a description with links.

**Modified:**
- `src/lib/proposal-schema.ts` — `SelectOption` type + pure `enumOptionsFor` (rarity tier order, category canonical order+labels). `.test.ts` gets coverage.
- `src/lib/proposal-entity.ts` — `getEnumOptions` (wraps DB fetch + `enumOptionsFor`).
- `src/components/EnumField.tsx` — `options: SelectOption[]`.
- `src/components/EditProposalForm.tsx` — `options` prop type; description authoring hint.
- `src/app/contribute/edit/page.tsx` — call `getEnumOptions`.
- `src/components/RecipeEditForm.tsx` — map `workbenches` to `SelectOption[]` for `EnumField`.
- `src/app/items/page.tsx`, `src/app/tramplers/page.tsx` — sidebar column `lg:self-stretch`.
- `src/components/EntityDetail.tsx` — `canSuggest` prop; render description via `DescriptionText`.
- `src/components/CraftTable.tsx`, `src/components/UsedInTable.tsx` — `canSuggest` prop (conditional Edit column).
- `src/app/items/[slug]/page.tsx`, `environment/[slug]/page.tsx`, `tramplers/[slug]/page.tsx` — compute `canSuggest` via `getSession`.
- `src/lib/queries.ts` — `getItemsBySlugs`.

---

## Task 1: `SelectOption` + `enumOptionsFor` (pure)

**Files:** Modify `src/lib/proposal-schema.ts`, `src/lib/proposal-schema.test.ts`.

- [ ] **Step 1: Write the failing tests**

Extend the import in `src/lib/proposal-schema.test.ts` to include `enumOptionsFor`, and add inside the `describe("proposal schema", …)` block:

```ts
describe("enumOptionsFor", () => {
  it("orders rarity by tier with name labels", () => {
    const opts = enumOptionsFor("item", "rarity", ["Rare", "Common"]);
    expect(opts.map((o) => o.value)).toEqual([
      "Common", "Uncommon", "Rare", "Noteworthy", "Remarkable", "Experimental",
    ]);
    expect(opts.every((o) => o.label === o.value)).toBe(true);
  });

  it("orders item categories canonically with friendly labels", () => {
    const opts = enumOptionsFor("item", "category", ["misc", "weapons"]);
    expect(opts.slice(0, 3)).toEqual([
      { value: "weapons", label: "Weapons" },
      { value: "artillery", label: "Artillery" },
      { value: "resources", label: "Resources" },
    ]);
  });

  it("uses the entity type's own category set", () => {
    expect(enumOptionsFor("tramplerPart", "category", [])[0]).toEqual({ value: "chassis", label: "Chassis" });
    expect(enumOptionsFor("envEntity", "category", [])[0]).toEqual({ value: "loot-containers", label: "Loot Containers" });
  });

  it("passes other fields through as value=label in the given order", () => {
    expect(enumOptionsFor("item", "workbenchTier", ["1", "2"])).toEqual([
      { value: "1", label: "1" },
      { value: "2", label: "2" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/proposal-schema.test.ts`
Expected: FAIL — `enumOptionsFor` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/proposal-schema.ts`, add imports at the top:

```ts
import { KNOWN_RARITY_NAMES } from "./rarity";
import { ITEM_CATEGORY_SLUGS, TRAMPLER_CATEGORY_SLUGS, ENV_CATEGORY_SLUGS, categoryLabel } from "./taxonomy";
```

Append:

```ts
export interface SelectOption {
  value: string;
  label: string;
}

/** Option set/order/labels for a correction-form enum select. rarity → tier order
 *  (closed set); category → the entity type's canonical slugs in declaration order,
 *  labelled; any other field → its distinct DB values (already sorted) as value=label. */
export function enumOptionsFor(type: string, field: string, dbValues: string[]): SelectOption[] {
  if (field === "rarity") {
    return KNOWN_RARITY_NAMES.map((n) => ({ value: n, label: n }));
  }
  if (field === "category") {
    const slugs =
      type === "item" ? ITEM_CATEGORY_SLUGS
      : type === "tramplerPart" ? TRAMPLER_CATEGORY_SLUGS
      : type === "envEntity" ? ENV_CATEGORY_SLUGS
      : [];
    return slugs.map((slug) => ({ value: slug, label: categoryLabel(slug) }));
  }
  return dbValues.map((v) => ({ value: v, label: v }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/proposal-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal-schema.ts src/lib/proposal-schema.test.ts
git commit -m "feat(wiki): enumOptionsFor — tier-ordered rarity, canonical labelled categories"
```

---

## Task 2: Wire ordered/labelled options through the selects

**Files:** Modify `src/lib/proposal-entity.ts`, `src/components/EnumField.tsx`, `src/components/EditProposalForm.tsx`, `src/app/contribute/edit/page.tsx`, `src/components/RecipeEditForm.tsx`.

No unit test (UI/DB glue). Verify by tsc + lint + full suite.

- [ ] **Step 1: Add `getEnumOptions` to `proposal-entity.ts`**

Add `enumOptionsFor, type SelectOption` to the existing import from `./proposal-schema`. Append:

```ts
/** Correction-form select options for an enum field: canonical order/labels for
 *  rarity & category (which ignore DB values), DB-derived values otherwise. The
 *  closed-set fields skip the table scan. */
export async function getEnumOptions(type: string, field: string): Promise<SelectOption[]> {
  const needsDb = field !== "rarity" && field !== "category";
  const dbValues = needsDb ? await getFieldOptions(type, field) : [];
  return enumOptionsFor(type, field, dbValues);
}
```

(Keep `getFieldOptions` as-is — `getEnumOptions` reuses it.)

- [ ] **Step 2: Change `EnumField` to `SelectOption[]`**

Replace `src/components/EnumField.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { OTHER_OPTION, type SelectOption } from "@/lib/proposal-schema";

export function EnumField({ field, value, options }: { field: string; value: string; options: SelectOption[] }) {
  const isKnown = value !== "" && options.some((o) => o.value === value);
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
          <option key={o.value} value={o.value}>{o.label}</option>
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

- [ ] **Step 3: Update `EditProposalForm` options prop type**

In `src/components/EditProposalForm.tsx`, change the `@/lib/proposal-schema` import to also bring in `type SelectOption`, and change the prop type `options: Record<string, string[]>` to `options: Record<string, SelectOption[]>`. Everything else (the `f.type === "enum"` branch passing `options={options[f.field] ?? []}`) stays.

- [ ] **Step 4: Call `getEnumOptions` in the edit page**

In `src/app/contribute/edit/page.tsx`: change the `@/lib/proposal-entity` import to `import { getEntityFields, getEnumOptions } from "@/lib/proposal-entity";`, add `import type { SelectOption } from "@/lib/proposal-schema";`, and change the options block to:

```tsx
  const fields = editableFields(type);
  const options: Record<string, SelectOption[]> = {};
  for (const f of fields) {
    if (f.type === "enum") options[f.field] = await getEnumOptions(type, f.field);
  }
```

- [ ] **Step 5: Adapt `RecipeEditForm`'s workbench select**

In `src/components/RecipeEditForm.tsx`, the workbench `EnumField` is currently `options={workbenches}` (a `string[]`). Change that one line to map to options:

```tsx
        <EnumField field="workbench" value={snapshot.workbench ?? ""} options={workbenches.map((w) => ({ value: w, label: w }))} />
```

(The `workbenches: string[]` prop and `getRecipeWorkbenches` are unchanged.)

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` then `npm run lint` then `npm test`
Expected: clean / 178 tests green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/proposal-entity.ts src/components/EnumField.tsx src/components/EditProposalForm.tsx src/app/contribute/edit/page.tsx src/components/RecipeEditForm.tsx
git commit -m "feat(wiki): ordered+labelled rarity/category selects in correction form"
```

---

## Task 3: Make the "Jump to" sidebar stick

**Files:** Modify `src/app/items/page.tsx`, `src/app/tramplers/page.tsx`.

No unit test (CSS). Verify by build + manual scroll check.

- [ ] **Step 1: Stretch the sidebar column on the items page**

In `src/app/items/page.tsx`, the sidebar wrapper is `<div className="order-1 lg:order-2">`. Change it to:

```tsx
        <div className="order-1 lg:order-2 lg:self-stretch">
```

(The grid keeps `items-start`; stretching only the sidebar cell gives the `lg:sticky` `CategoryQuickNav` a full-height containing block to travel within.)

- [ ] **Step 2: Same on the tramplers page**

In `src/app/tramplers/page.tsx`, change the matching sidebar wrapper `<div className="order-1 lg:order-2">` to:

```tsx
        <div className="order-1 lg:order-2 lg:self-stretch">
```

- [ ] **Step 3: Verify no clipping ancestor**

Check that neither the page wrapper nor `src/app/layout.tsx`'s main container sets `overflow-hidden`/`overflow-auto` on an ancestor of the grid (which would break `position: sticky`). Run: `npx tsc --noEmit` and `npm run build`. If a clipping `overflow-*` ancestor exists, remove it only if it isn't load-bearing; otherwise note it in your report.

- [ ] **Step 4: Manual smoke (note for executor)**

`npm run dev`, open `/items`, scroll the (long) item grid on a wide (`lg`) viewport, and confirm the "Jump to" category nav stays pinned ~4.5rem below the top instead of scrolling away. Repeat on `/tramplers`.

- [ ] **Step 5: Commit**

```bash
git add src/app/items/page.tsx src/app/tramplers/page.tsx
git commit -m "fix(wiki): keep the Jump-to sidebar sticky by stretching its grid column"
```

---

## Task 4: Hide suggest links when logged out

**Files:** Modify `src/components/EntityDetail.tsx`, `src/components/CraftTable.tsx`, `src/components/UsedInTable.tsx`, `src/app/items/[slug]/page.tsx`, `src/app/environment/[slug]/page.tsx`, `src/app/tramplers/[slug]/page.tsx`.

No unit test (UI/auth glue). Verify by tsc + lint + build + manual.

- [ ] **Step 1: Gate the link in `EntityDetail`**

In `src/components/EntityDetail.tsx`: add `canSuggest?: boolean;` to `EntityDetailProps` (after `suggest`). Destructure `canSuggest` in the component params. Change the top bar so the link only renders when `canSuggest`:

```tsx
      <div className="flex items-center justify-between gap-2">
        <Breadcrumb items={breadcrumb} />
        {canSuggest && <SuggestCorrectionLink type={suggest.type} slug={suggest.slug} />}
      </div>
```

- [ ] **Step 2: Conditional Edit column in `CraftTable`**

Replace `src/components/CraftTable.tsx` with:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow, type SortColumn } from "@/components/SortableTable";
import { SuggestRecipeLink } from "@/components/SuggestRecipeLink";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
// Sort token (not display text): a stable, monotonic key over (workbench, tier).
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function CraftTable({ recipes, canSuggest = false }: { recipes: RecipeCard[]; canSuggest?: boolean }) {
  const columns: SortColumn[] = [
    { label: "Ingredients" }, { label: "Time" }, { label: "Workbench" },
    ...(canSuggest ? [{ label: "Edit", alignRight: true, sortable: false } as SortColumn] : []),
  ];
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.inputs), r.craftTimeSeconds, workbenchKey(r), ...(canSuggest ? [null] : [])],
    cells: [
      <IngredientList key="i" rows={r.inputs} />,
      <span key="t" className="whitespace-nowrap">{r.craftTimeSeconds !== null ? `${r.craftTimeSeconds} sec` : "—"}</span>,
      <WorkbenchBadge key="w" recipe={r} />,
      ...(canSuggest ? [<SuggestRecipeLink key="e" slug={r.slug} />] : []),
    ],
  }));
  return (
    <SortableTable caption="Recipes that craft this item" columns={columns} rows={rows} />
  );
}
```

(If `SortColumn` is not already exported from `SortableTable.tsx`, add `export` to its `interface SortColumn` declaration.)

- [ ] **Step 3: Conditional Edit column in `UsedInTable`**

Replace `src/components/UsedInTable.tsx` with:

```tsx
import type { RecipeCard } from "@/lib/recipes";
import { IngredientList, WorkbenchBadge } from "@/components/recipe-cells";
import { SortableTable, type SortableTableRow, type SortColumn } from "@/components/SortableTable";
import { SuggestRecipeLink } from "@/components/SuggestRecipeLink";

const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(", ").toLowerCase();
const workbenchKey = (r: RecipeCard) =>
  r.workbench ? `${r.workbench}·T${r.tier ?? 0}` : null;

export function UsedInTable({ recipes, canSuggest = false }: { recipes: RecipeCard[]; canSuggest?: boolean }) {
  const columns: SortColumn[] = [
    { label: "Produces" }, { label: "Ingredients" }, { label: "Workbench" },
    ...(canSuggest ? [{ label: "Edit", alignRight: true, sortable: false } as SortColumn] : []),
  ];
  const rows: SortableTableRow[] = recipes.map((r) => ({
    keys: [names(r.outputs), names(r.inputs), workbenchKey(r), ...(canSuggest ? [null] : [])],
    cells: [
      <IngredientList key="o" rows={r.outputs} />,
      <IngredientList key="i" rows={r.inputs} />,
      <WorkbenchBadge key="w" recipe={r} />,
      ...(canSuggest ? [<SuggestRecipeLink key="e" slug={r.slug} />] : []),
    ],
  }));
  return (
    <SortableTable caption="Recipes that use this item" columns={columns} rows={rows} />
  );
}
```

- [ ] **Step 4: Compute `canSuggest` on the item detail page**

In `src/app/items/[slug]/page.tsx`: add `import { getSession } from "@/lib/auth";`. After the data is loaded (e.g. right before building `tabContent`), add `const canSuggest = !!(await getSession());`. Pass it to the tables and `EntityDetail`:

```tsx
    "crafted-by": <CraftTable recipes={crafts} canSuggest={canSuggest} />,
    "used-in": <UsedInTable recipes={usedInCrafts} canSuggest={canSuggest} />,
```
and on the `<EntityDetail … >` add the prop:
```tsx
      canSuggest={canSuggest}
```

- [ ] **Step 5: Compute `canSuggest` on the environment & trampler detail pages**

In `src/app/environment/[slug]/page.tsx` and `src/app/tramplers/[slug]/page.tsx`: add `import { getSession } from "@/lib/auth";`, add `const canSuggest = !!(await getSession());` before the return, and add `canSuggest={canSuggest}` to the `<EntityDetail … >` props (next to the existing `suggest={…}`).

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` then `npm run lint` then `npm test`
Expected: clean / green.

- [ ] **Step 7: Manual smoke (note for executor)**

Logged out: detail pages show no "Suggest a correction" link and recipe tables have no Edit column. Logged in (Steam): both reappear.

- [ ] **Step 8: Commit**

```bash
git add src/components/EntityDetail.tsx src/components/CraftTable.tsx src/components/UsedInTable.tsx "src/app/items/[slug]/page.tsx" "src/app/environment/[slug]/page.tsx" "src/app/tramplers/[slug]/page.tsx" src/components/SortableTable.tsx
git commit -m "feat(wiki): show suggest-correction entry points only when logged in"
```

---

## Task 5: `[[slug]]` description parser (pure)

**Files:** Create `src/lib/description-links.ts`, `src/lib/description-links.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/description-links.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDescription, collectSlugs } from "./description-links";

describe("parseDescription", () => {
  it("returns a single text segment when there are no links", () => {
    expect(parseDescription("just plain text")).toEqual([{ type: "text", value: "just plain text" }]);
  });

  it("parses a bare [[slug]] link with no explicit label", () => {
    expect(parseDescription("use [[iron-plate]] here")).toEqual([
      { type: "text", value: "use " },
      { type: "link", slug: "iron-plate" },
      { type: "text", value: " here" },
    ]);
  });

  it("parses [[slug|label]] with an explicit label", () => {
    expect(parseDescription("made of [[iron-plate|reinforced plates]].")).toEqual([
      { type: "text", value: "made of " },
      { type: "link", slug: "iron-plate", label: "reinforced plates" },
      { type: "text", value: "." },
    ]);
  });

  it("parses multiple links and trims slug whitespace", () => {
    const segs = parseDescription("[[a]] and [[ b | B ]]");
    expect(segs).toEqual([
      { type: "link", slug: "a" },
      { type: "text", value: " and " },
      { type: "link", slug: "b", label: "B" },
    ]);
  });

  it("treats empty [[]] as literal text", () => {
    expect(parseDescription("nothing [[]] here")).toEqual([{ type: "text", value: "nothing [[]] here" }]);
  });
});

describe("collectSlugs", () => {
  it("returns unique link slugs in first-seen order", () => {
    const segs = parseDescription("[[a]] [[b]] [[a]]");
    expect(collectSlugs(segs)).toEqual(["a", "b"]);
  });

  it("returns [] when there are no links", () => {
    expect(collectSlugs(parseDescription("plain"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/description-links.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/description-links.ts`**

```ts
export type Segment =
  | { type: "text"; value: string }
  | { type: "link"; slug: string; label?: string };

// [[slug]] or [[slug|label]] — slug excludes ] and |; label excludes ].
const LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Split one paragraph of text into text and item-link segments. A link's slug
 *  and explicit label are trimmed; an empty slug isn't a link (stays literal). */
export function parseDescription(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const slug = m[1].trim();
    if (slug === "") continue; // defensive; the regex already requires ≥1 char
    const start = m.index!;
    if (start > last) segments.push({ type: "text", value: text.slice(last, start) });
    const label = m[2]?.trim();
    segments.push(label ? { type: "link", slug, label } : { type: "link", slug });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments.length ? segments : [{ type: "text", value: text }];
}

/** Unique link slugs, in first-seen order. */
export function collectSlugs(segments: Segment[]): string[] {
  const seen = new Set<string>();
  for (const s of segments) if (s.type === "link") seen.add(s.slug);
  return [...seen];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/description-links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/description-links.ts src/lib/description-links.test.ts
git commit -m "feat(wiki): pure [[slug]] description-link parser"
```

---

## Task 6: `getItemsBySlugs` query

**Files:** Modify `src/lib/queries.ts`.

No unit test (DB). Verify by tsc + lint.

- [ ] **Step 1: Implement**

Append to `src/lib/queries.ts`:

```ts
/** Minimal item fields for the items referenced by `[[slug]]` links in a
 *  description, keyed by slug. Empty input → empty map (no query). */
export async function getItemsBySlugs(
  slugs: string[],
): Promise<Map<string, { slug: string; name: string; rarity: string | null }>> {
  if (slugs.length === 0) return new Map();
  const rows = await prisma.item.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true, rarity: true },
  });
  return new Map(rows.map((r) => [r.slug, r]));
}
```

(`prisma` is already imported in this file.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(wiki): getItemsBySlugs batch resolver for description links"
```

---

## Task 7: Render item links in descriptions

**Files:** Create `src/components/ItemTextLink.tsx`, `src/components/DescriptionText.tsx`; modify `src/components/EntityDetail.tsx`.

No unit test (the parser is tested in Task 5; this is rendering glue). Verify by tsc + lint + build + manual.

- [ ] **Step 1: Create `ItemTextLink`**

```tsx
import Link from "next/link";
import { rarityColor } from "@/lib/rarity";

/** Inline item link inside prose: app `link` style, tinted by the item's rarity
 *  color (theme link color when the rarity is unknown/absent). */
export function ItemTextLink({ slug, label, rarity }: { slug: string; label: string; rarity: string | null }) {
  return (
    <Link href={`/items/${slug}`} className="link" style={{ color: rarityColor(rarity) ?? undefined }}>
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Create `DescriptionText` (async server component)**

```tsx
import { parseDescription, collectSlugs } from "@/lib/description-links";
import { getItemsBySlugs } from "@/lib/queries";
import { ItemTextLink } from "@/components/ItemTextLink";

/** Renders a description as paragraphs, turning resolved [[slug]] links into
 *  ItemTextLinks. Unresolved slugs render as plain text. */
export async function DescriptionText({ text }: { text: string }) {
  const paragraphs = text.split(/\n+/).filter(Boolean);
  if (paragraphs.length === 0) return null;
  const parsed = paragraphs.map(parseDescription);
  const slugs = [...new Set(parsed.flatMap(collectSlugs))];
  const items = await getItemsBySlugs(slugs);

  return (
    <>
      {parsed.map((segments, i) => (
        <p key={i} className="text-base-content/80 max-w-prose">
          {segments.map((s, j) => {
            if (s.type === "text") return s.value;
            const item = items.get(s.slug);
            if (!item) return s.label ?? s.slug;
            return <ItemTextLink key={j} slug={item.slug} label={s.label ?? item.name} rarity={item.rarity} />;
          })}
        </p>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Use it in `EntityDetail`**

In `src/components/EntityDetail.tsx`: add `import { DescriptionText } from "@/components/DescriptionText";`. Remove the `const paragraphs = description ? … : [];` line. Replace the paragraph render:

```tsx
          {paragraphs.map((p, i) => (
            <p key={i} className="text-base-content/80 max-w-prose">{p}</p>
          ))}
```
with:
```tsx
          {description && <DescriptionText text={description} />}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` then `npm run lint` then `npm test` then `npm run build`
Expected: clean / green / build succeeds.

- [ ] **Step 5: Manual smoke (note for executor)**

Via Directus or the correction form, set an item description containing `[[some-real-slug]]`, `[[some-real-slug|custom text]]`, and `[[nonexistent-slug]]`. Confirm the first two render as inline links (rarity-tinted) to the item page and the bad slug renders as plain text. Confirm a plain description still renders normally.

- [ ] **Step 6: Commit**

```bash
git add src/components/ItemTextLink.tsx src/components/DescriptionText.tsx src/components/EntityDetail.tsx
git commit -m "feat(wiki): render [[slug]] item links inside descriptions"
```

---

## Task 8: Description authoring hint

**Files:** Modify `src/components/EditProposalForm.tsx`.

No unit test (UI). Verify by tsc + lint.

- [ ] **Step 1: Add the hint under the description field**

In `src/components/EditProposalForm.tsx`, inside the `fields.map((f) => …)` label block, after the field input rendering and before the label closes, add a per-field hint shown only for the `description` field:

```tsx
          {f.field === "description" && (
            <span className="text-xs text-base-content/50">
              Link an item with <code>[[item-slug]]</code>.
            </span>
          )}
```

Place it as the last child inside the `<label key={f.field} …>` (after the conditional input/textarea/EnumField block), so it appears beneath the field.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/EditProposalForm.tsx
git commit -m "feat(wiki): hint the [[item-slug]] link syntax under the description field"
```

---

## Final verification

- [ ] `npm test` → all green (adds `enumOptionsFor` + `description-links` tests to the existing suite).
- [ ] `npx tsc --noEmit` → clean.
- [ ] `npm run lint` → no new errors (2 pre-existing `directus/` warnings OK).
- [ ] `npm run build` → succeeds.
- [ ] Walk the manual smokes from Tasks 3, 4, and 7.

---

## Self-Review Notes (author)

- **Spec coverage:** §1 auth-gate → Task 4 ✓; §2 sticky sidebar → Task 3 ✓; §3 ordered/labelled selects → Tasks 1–2 ✓ (incl. `EnumField` `SelectOption[]`, recipe workbench mapping, category full canonical set, rarity tier order); §4 item links → Tasks 5 (parser), 6 (query), 7 (render+wire), 8 (authoring hint) ✓.
- **Type consistency:** `SelectOption` defined in proposal-schema (Task 1), consumed by `getEnumOptions`/`EnumField`/`EditProposalForm`/edit page (Task 2). `Segment` (optional `label`) defined in Task 5, consumed by `DescriptionText` (Task 7) via `s.label ?? …`. `getItemsBySlugs` Map shape (Task 6) matches `DescriptionText`'s `items.get(...).{slug,name,rarity}` and `ItemTextLink`'s props (Task 7). `canSuggest` prop consistent across EntityDetail/CraftTable/UsedInTable/pages (Task 4). `SortColumn` exported from SortableTable (Task 4 step 2 note).
- **No migration / no closed-set drift:** rarity/category are presentational option sets; no schema change.
- **Known deferred (out of scope):** item-picker UI for links; linking to non-item entities; markdown beyond `[[…]]`.
