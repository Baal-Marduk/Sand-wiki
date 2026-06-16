# Admin Link-Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The React component work in Tasks 3–4 should follow the **frontend-design:frontend-design** skill (dark-only theme, squared editorial inputs, reuse `ItemIcon` + rarity colors).

**Goal:** Replace the native-`<select>` row editor inside `LinkEditForm` with a search-to-add picker — type-to-filter search showing entity icons and rarity-colored names, selected items as compact cards with role-driven inline fields — without changing the FormData submission contract.

**Architecture:** Pure filter/sort logic lives in a vitest-tested helper (`src/lib/link-picker.ts`). A thin client component (`src/components/LinkPicker.tsx`) renders the search box + selected rows and emits the *exact same* index-aligned FormData arrays (`linkSlug`/`linkName`/`linkAmount`/`linkTier`/`linkValue1`) the server already parses, so `parseLinkRows`, the proposal pipeline, and `link-proposal.test.ts` are untouched. `LinkEditForm` keeps its `DirtyForm` + note + submit chrome and delegates the row area to `LinkPicker`. Two queries widen their select to provide `rarity`/`icon`/`category` for the picker.

**Tech Stack:** Next.js 16 (React, App Router, server actions), TypeScript, Tailwind (editorial token set in `form-styles.ts`), Prisma 6, vitest. No new dependencies.

---

## File Structure

- **Create** `src/lib/link-picker.ts` — `LinkOption` type + pure `filterLinkOptions` / `hasExactOptionMatch` helpers.
- **Create** `src/lib/link-picker.test.ts` — vitest tests for the helpers.
- **Create** `src/components/LinkPicker.tsx` — client search-to-add component (icons, rarity color, inline fields, custom fallback, keyboard nav). Emits FormData.
- **Modify** `src/components/LinkEditForm.tsx` — strip the row UI; render `<LinkPicker>`; change `items` prop type to `LinkOption[]`.
- **Modify** `src/lib/queries.ts` (`listLootSources`, ~line 222) — widen select to `rarity`/`icon`/`category`, return `LinkOption[]`.
- **Modify** `src/app/contribute/edit-tabs/page.tsx` (~lines 46-52) — widen the `kind: "item"` `findMany` select to include `rarity`/`icon`/`category`.

**Unchanged (do not touch):** `src/lib/link-proposal.ts`, `src/app/contribute/actions.ts`, `src/lib/proposal-apply.ts`, `src/lib/entity-links.ts`, the Prisma schema.

---

### Task 1: Pure picker helpers + tests

**Files:**
- Create: `sand-wiki/src/lib/link-picker.ts`
- Test: `sand-wiki/src/lib/link-picker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sand-wiki/src/lib/link-picker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterLinkOptions, hasExactOptionMatch, type LinkOption } from "./link-picker";

const opt = (slug: string, name: string, rarity: string | null = null): LinkOption => ({
  slug, name, rarity, icon: null, category: null,
});

const ITEMS: LinkOption[] = [
  opt("scrap-metal", "Scrap Metal", "Common"),
  opt("scrap-alloy", "Scrap Alloy", "Noteworthy"),
  opt("copper-wire", "Copper Wire", "Uncommon"),
];

describe("filterLinkOptions", () => {
  it("filters by case-insensitive substring on name", () => {
    const r = filterLinkOptions(ITEMS, "scrap", []);
    expect(r.map((o) => o.slug)).toEqual(["scrap-metal", "scrap-alloy"]);
  });

  it("returns all options (rarity-then-name sorted) for an empty query", () => {
    const r = filterLinkOptions(ITEMS, "", []);
    // Common(1) < Uncommon(2) < Noteworthy(4)
    expect(r.map((o) => o.slug)).toEqual(["scrap-metal", "copper-wire", "scrap-alloy"]);
  });

  it("excludes already-selected slugs", () => {
    const r = filterLinkOptions(ITEMS, "", ["scrap-metal"]);
    expect(r.map((o) => o.slug)).toEqual(["copper-wire", "scrap-alloy"]);
  });

  it("sorts equal-rarity matches alphabetically", () => {
    const r = filterLinkOptions(ITEMS, "scrap", []); // Common vs Noteworthy → tier order
    expect(r.map((o) => o.name)).toEqual(["Scrap Metal", "Scrap Alloy"]);
  });
});

describe("hasExactOptionMatch", () => {
  it("is true for a case-insensitive exact name match", () => {
    expect(hasExactOptionMatch(ITEMS, "scrap metal")).toBe(true);
  });
  it("is false for a partial match", () => {
    expect(hasExactOptionMatch(ITEMS, "scrap")).toBe(false);
  });
  it("is false for an empty/blank query", () => {
    expect(hasExactOptionMatch(ITEMS, "  ")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sand-wiki && npx vitest run src/lib/link-picker.test.ts`
Expected: FAIL — cannot resolve `./link-picker` (module not found).

- [ ] **Step 3: Write the implementation**

Create `sand-wiki/src/lib/link-picker.ts`:

```ts
import { byRarityThenName } from "@/lib/rarity";

/** A catalog option the picker can render and link to. `category` feeds ItemIcon's
 *  `categorySlug` fallback; `rarity`/`icon` drive the tile + name color. */
export interface LinkOption {
  slug: string;
  name: string;
  rarity: string | null;
  icon: string | null;
  category: string | null;
}

/** Catalog options matching `query` (case-insensitive substring on name), minus any
 *  slug in `excludeSlugs`, sorted by rarity tier then name. Empty query → all (minus
 *  excluded). Pure — safe to unit test and call from render. */
export function filterLinkOptions(
  options: LinkOption[],
  query: string,
  excludeSlugs: string[],
): LinkOption[] {
  const q = query.trim().toLowerCase();
  const exclude = new Set(excludeSlugs);
  return options
    .filter((o) => !exclude.has(o.slug))
    .filter((o) => (q === "" ? true : o.name.toLowerCase().includes(q)))
    .sort(byRarityThenName);
}

/** True iff some option's name equals `query` exactly (case-insensitive). Drives whether
 *  the "add as custom / unlinked" fallback row is offered. False for a blank query. */
export function hasExactOptionMatch(options: LinkOption[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return false;
  return options.some((o) => o.name.toLowerCase() === q);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sand-wiki && npx vitest run src/lib/link-picker.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/link-picker.ts sand-wiki/src/lib/link-picker.test.ts
git commit -m "feat(link-editor): pure search/filter helpers for the link picker"
```

---

### Task 2: Widen the catalog queries to provide rarity/icon/category

This task only *adds* selected fields, so existing `LinkEditForm` (still reading slug/name) keeps compiling. Do it before the component swap so the widened `items` shape is ready.

**Files:**
- Modify: `sand-wiki/src/lib/queries.ts` (`listLootSources`, ~line 222)
- Modify: `sand-wiki/src/app/contribute/edit-tabs/page.tsx` (~lines 46-52)

- [ ] **Step 1: Widen `listLootSources`**

In `sand-wiki/src/lib/queries.ts`, replace the `listLootSources` function (currently returns `{ slug; name }[]`):

```ts
export async function listLootSources(): Promise<LinkOption[]> {
  return prisma.entity.findMany({
    where: { kind: "environment", category: { in: ["loot-containers", "landmarks"] } },
    select: { slug: true, name: true, rarity: true, icon: true, category: true },
    orderBy: { name: "asc" },
  });
}
```

- [ ] **Step 2: Add the `LinkOption` import to `queries.ts`**

At the top of `sand-wiki/src/lib/queries.ts`, add to the existing imports:

```ts
import type { LinkOption } from "@/lib/link-picker";
```

- [ ] **Step 3: Widen the item catalog query in the edit-tabs page**

In `sand-wiki/src/app/contribute/edit-tabs/page.tsx`, change the `items` query (currently `select: { slug: true, name: true }`):

```ts
  const items = roles.length
    ? await prisma.entity.findMany({
        where: { kind: "item" },
        select: { slug: true, name: true, rarity: true, icon: true, category: true },
        orderBy: { name: "asc" },
      })
    : [];
```

- [ ] **Step 4: Verify it still typechecks**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: PASS — no errors. (`LinkEditForm` still declares its own `{ slug; name }` `items` type and only reads those two fields, so passing the wider object is assignable.)

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/lib/queries.ts sand-wiki/src/app/contribute/edit-tabs/page.tsx
git commit -m "feat(link-editor): widen catalog queries with rarity/icon/category"
```

---

### Task 3: Build the `LinkPicker` component

**Files:**
- Create: `sand-wiki/src/components/LinkPicker.tsx`

- [ ] **Step 1: Write the component**

Create `sand-wiki/src/components/LinkPicker.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { CUSTOM_TARGET, type LinkRowDraft } from "@/lib/link-proposal";
import type { LinkField } from "@/lib/entity-links";
import { filterLinkOptions, hasExactOptionMatch, type LinkOption } from "@/lib/link-picker";
import { ItemIcon } from "@/components/ItemIcon";
import { rarityColor } from "@/lib/rarity";
import { labelCls, inputCls, selectCls, btnGhost, btnSm } from "@/components/form-styles";

const TIERS = ["Normal", "Rare", "Very Rare"];
const MAX_RESULTS = 50;

let nextKey = 0;
type Row = LinkRowDraft & { key: number };
const toRow = (r: LinkRowDraft): Row => ({ ...r, key: nextKey++ });

/** Search-to-add editor for one link role. Renders selected rows as compact cards with
 *  role-driven inline fields and a type-to-filter catalog search. Emits the same
 *  index-aligned FormData arrays the server action parses (one set per selected row):
 *  linkSlug / linkName / linkAmount / linkTier / linkValue1. */
export function LinkPicker({
  label,
  fields,
  rows: initialRows,
  items,
  optionNoun = "item",
  allowCustom = true,
}: {
  label: string;
  fields: readonly LinkField[];
  rows: LinkRowDraft[];
  items: LinkOption[];
  optionNoun?: string;
  allowCustom?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows.map(toRow));
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const optBySlug = useMemo(() => new Map(items.map((o) => [o.slug, o])), [items]);

  const results = useMemo(() => {
    const selected = rows
      .map((r) => r.targetSlug)
      .filter((s): s is string => s !== null);
    return filterLinkOptions(items, query, selected).slice(0, MAX_RESULTS);
  }, [items, query, rows]);

  const showCustom = allowCustom && query.trim() !== "" && !hasExactOptionMatch(items, query);
  const open = query.trim() !== "" && (results.length > 0 || showCustom);
  const count = results.length + (showCustom ? 1 : 0);

  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows(rows.filter((_, j) => j !== i));

  const addOption = (o: LinkOption) => {
    setRows([...rows, toRow({ targetSlug: o.slug, name: o.name, amount: 1, tier: "", value1: "" })]);
    setQuery(""); setHi(0); searchRef.current?.focus();
  };
  const addCustom = () => {
    const name = query.trim();
    if (!name) return;
    setRows([...rows, toRow({ targetSlug: null, name, amount: 1, tier: "", value1: "" })]);
    setQuery(""); setHi(0); searchRef.current?.focus();
  };
  const choose = (idx: number) => {
    if (idx < results.length) addOption(results[idx]);
    else if (showCustom) addCustom();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, count - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(hi); }
    else if (e.key === "Escape") { setQuery(""); }
  };

  return (
    <fieldset className="space-y-2">
      <legend className={`mb-1 ${labelCls}`}>{label}</legend>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const isCustom = r.targetSlug === null;
            const opt = r.targetSlug ? optBySlug.get(r.targetSlug) : undefined;
            const color = rarityColor(opt?.rarity) ?? undefined;
            return (
              <li key={r.key} className="flex items-center gap-2 border border-border bg-background px-2 py-1.5">
                <ItemIcon
                  name={r.name}
                  size="sm"
                  decorative
                  icon={opt?.icon}
                  rarity={opt?.rarity}
                  categorySlug={opt?.category}
                />

                {/* Contract: linkSlug + linkName index-aligned with the field arrays below. */}
                <input type="hidden" name="linkSlug" value={isCustom ? CUSTOM_TARGET : r.targetSlug!} />
                <input type="hidden" name="linkName" value={isCustom ? r.name : ""} />

                {isCustom ? (
                  <input
                    aria-label="Custom name"
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Custom name"
                    className={`${inputCls} flex-1`}
                  />
                ) : (
                  <span className="flex-1 text-sm" style={{ color }}>{r.name}</span>
                )}

                {fields.includes("amount") && (
                  <input
                    name="linkAmount"
                    type="number"
                    min={1}
                    value={r.amount ?? 1}
                    onChange={(e) => update(i, { amount: Number(e.target.value) })}
                    className={`${inputCls} w-16 text-center`}
                    aria-label="Amount"
                  />
                )}
                {fields.includes("tier") && (
                  <select
                    name="linkTier"
                    value={r.tier ?? ""}
                    onChange={(e) => update(i, { tier: e.target.value })}
                    className={`${selectCls} w-32`}
                    aria-label="Tier"
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
                    className={`${inputCls} w-24`}
                    aria-label="Drop range"
                  />
                )}

                <button
                  type="button"
                  aria-label="Remove row"
                  className={`${btnGhost} ${btnSm}`}
                  onClick={() => remove(i)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHi(0); }}
          onKeyDown={onKeyDown}
          placeholder={`Add a ${optionNoun}…`}
          className={inputCls}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {open && (
          <ul
            className="absolute z-10 mt-1 max-h-64 w-full overflow-auto border border-border-strong bg-card shadow-lg"
            role="listbox"
          >
            {results.map((o, idx) => (
              <li
                key={o.slug}
                role="option"
                aria-selected={idx === hi}
                onMouseEnter={() => setHi(idx)}
                onMouseDown={(e) => { e.preventDefault(); addOption(o); }}
                className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 ${idx === hi ? "bg-card-elevated" : ""}`}
              >
                <ItemIcon name={o.name} size="sm" decorative icon={o.icon} rarity={o.rarity} categorySlug={o.category} />
                <span className="text-sm" style={{ color: rarityColor(o.rarity) ?? undefined }}>{o.name}</span>
              </li>
            ))}
            {showCustom && (
              <li
                role="option"
                aria-selected={hi === results.length}
                onMouseEnter={() => setHi(results.length)}
                onMouseDown={(e) => { e.preventDefault(); addCustom(); }}
                className={`flex cursor-pointer items-center gap-2 border-t border-dashed border-border-strong px-2 py-1.5 italic text-muted-foreground ${hi === results.length ? "bg-card-elevated" : ""}`}
              >
                ＋ Add “{query.trim()}” as custom / unlinked
              </li>
            )}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: PASS — no errors. (The component isn't imported anywhere yet; this just confirms it compiles.)

- [ ] **Step 3: Commit**

```bash
git add sand-wiki/src/components/LinkPicker.tsx
git commit -m "feat(link-editor): add search-to-add LinkPicker component"
```

---

### Task 4: Wire `LinkEditForm` to use `LinkPicker`

**Files:**
- Modify: `sand-wiki/src/components/LinkEditForm.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `LinkEditForm`**

Replace the entire contents of `sand-wiki/src/components/LinkEditForm.tsx` with:

```tsx
"use client";

import { submitLinksEdit } from "@/app/contribute/actions";
import { DirtyForm, DirtySubmit } from "@/components/DirtyForm";
import { LinkPicker } from "@/components/LinkPicker";
import type { LinkOption } from "@/lib/link-picker";
import type { LinkRowDraft } from "@/lib/link-proposal";
import type { LinkField } from "@/lib/entity-links";
import { labelCls, textareaCls } from "@/components/form-styles";

/** One role's tab editor: hidden type/slug/role, the search-to-add LinkPicker, an
 *  optional source note, and a dirty-gated submit. The picker emits the index-aligned
 *  link* FormData arrays the server action (default `submitLinksEdit`) parses. */
export function LinkEditForm({
  type,
  slug,
  role,
  label,
  fields,
  rows,
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
  items: LinkOption[];
  action?: (formData: FormData) => void | Promise<void>;
  optionNoun?: string;
  allowCustom?: boolean;
}) {
  return (
    <DirtyForm action={action} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="role" value={role} />

      <LinkPicker
        label={label}
        fields={fields}
        rows={rows}
        items={items}
        optionNoun={optionNoun}
        allowCustom={allowCustom}
      />

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Note / source (optional)</span>
        <textarea name="note" className={textareaCls} rows={2} placeholder="Where did you confirm this?" />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <DirtySubmit>Submit {label} change</DirtySubmit>
      </div>
    </DirtyForm>
  );
}
```

- [ ] **Step 2: Verify the whole app typechecks**

Run: `cd sand-wiki && npx tsc --noEmit`
Expected: PASS. The `items` prop is now `LinkOption[]`, matching what the widened queries in Task 2 return (edit-tabs page + `listLootSources`).

- [ ] **Step 3: Run lint and the full unit suite**

Run: `cd sand-wiki && npm run lint && npm test`
Expected: lint clean; vitest green including the unchanged `link-proposal.test.ts` and the new `link-picker.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/components/LinkEditForm.tsx
git commit -m "feat(link-editor): swap LinkEditForm row UI for the LinkPicker"
```

---

### Task 5: Manual verification

No code changes unless a defect is found. The component layer has no unit-test harness in this repo (vitest has no jsdom/testing-library), so verify in the running app.

- [ ] **Step 1: Start the dev server**

Run: `cd sand-wiki && npm run dev`
Open the app and sign in as an admin.

- [ ] **Step 2: Verify each role's panel**

Visit these editors and confirm the search-to-add UX:

1. **Build cost** — `/contribute/edit-tabs?type=tramplerPart&slug=<a-trampler-part-slug>`: search filters parts/items, results show icon + rarity color, adding a row shows an amount input. Submit → redirects/creates a `links_edit` proposal.
2. **Loot + keys** — `/contribute/edit-tabs?type=envEntity&slug=<a-location-slug>`: the Loot panel shows tier select + range input per row; `Requires Key` / `Key Reward` panels show **no** custom fallback when typing an unknown name (catalog-only), and **no** extra field inputs.
3. **Item "Found in"** — `/contribute/edit-tabs?type=item&slug=<an-item-slug>`: search lists only loot sources (containers/landmarks); confirm no custom fallback (allowCustom=false), and submitting creates a proposal.

- [ ] **Step 3: Verify the custom/unlinked path**

In the Loot panel, type a name with no exact match (e.g. "Ancient Whatsit"), confirm the dashed "+ Add … as custom / unlinked" row appears, add it, submit, and confirm the resulting proposal's `changes.new` contains a row with `targetSlug: null` and that name.

- [ ] **Step 4: Verify dirty-gating + keyboard nav**

Confirm the submit button is disabled until a row is added/removed/edited, and that ↑/↓/Enter select results in the dropdown and Esc clears the query.

- [ ] **Step 5: Confirm no regression in the proposal contract**

Apply one pending proposal via the existing admin review flow and confirm the links render correctly on the entity's public page (icons, rarity, amounts/tiers/ranges intact).

---

## Self-Review Notes

- **Spec coverage:** search bar (Task 3 search input + Task 1 filter), icons + rarity color (Task 3 `ItemIcon` + `rarityColor`, fed by Task 2 queries), panel grouping (existing per-role `<section>` cards, unchanged), simpler edit / no blank rows (search-to-add, rows start from `initialRows` only). Custom/unlinked fallback and key-role suppression covered (Task 3 `showCustom` + `allowCustom`). Drop-in contract preserved (Task 3 hidden `linkSlug`/`linkName` + field inputs; `parseLinkRows` untouched).
- **Type consistency:** `LinkOption` defined once in `link-picker.ts`, consumed by `queries.ts`, `edit-tabs/page.tsx` (via Prisma select shape), `LinkPicker.tsx`, and `LinkEditForm.tsx`. Helper names `filterLinkOptions` / `hasExactOptionMatch` used identically in test and component. Field names `linkSlug`/`linkName`/`linkAmount`/`linkTier`/`linkValue1` and the `CUSTOM_TARGET` sentinel match `parseLinkRows`'s `getAll` reads exactly.
- **Out of scope (unchanged):** drag-reordering, `cmdk`/popover deps, server actions, proposal-apply, schema, recipe tabs, admin create/image/disable flows.
