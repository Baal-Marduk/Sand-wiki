# Enriched-Select Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. React component work should follow **frontend-design:frontend-design** (dark-only theme, squared editorial inputs, reuse `ItemIcon`/`CategoryIcon`/rarity colors).

**Goal:** Normalize all item selection onto one enriched search picker, switch recipe input/output editing to search-to-add, and give rarity + category selects swatch/icon styling — with no server/proposal/schema changes.

**Architecture:** Extract the enriched search UI from `LinkPicker` into a reusable `EntitySearchBox` (used by `LinkPicker` and the recipe editor). Add a small accessible `StyledSelect` custom listbox for closed enum sets, used as `RaritySelect`/`CategorySelect`. Recipe lines keep their `inputSlug`/`outputSlug`/`*Amount` FormData contract; enriched selects emit a hidden input with the chosen value. `EnumField` stays for wiki-sourced "Other…" sets.

**Tech Stack:** Next.js 16 (React client components), TypeScript, Tailwind (`form-styles.ts` tokens), Prisma 6, vitest. No new dependencies.

**Repo note:** Git root `D:/Documents/SandLabs`; the app is the `sand-wiki/` SUBFOLDER. All paths below are `sand-wiki/`-prefixed. Typecheck `cd sand-wiki && npx tsc --noEmit` (a pre-existing `layout.test.ts` crownsIcon error is expected and unrelated). Lint `cd sand-wiki && npm run lint`. Tests `cd sand-wiki && npm test`. Build `cd sand-wiki && npm run build`.

---

## File Structure

- **New** `sand-wiki/src/components/EntitySearchBox.tsx` — enriched search input + results dropdown; calls back `onSelect`/`onSelectCustom`. No FormData.
- **New** `sand-wiki/src/components/StyledSelect.tsx` — accessible custom listbox for closed enum sets + `RaritySelect`/`CategorySelect` wrappers. Emits a hidden input.
- **Modify** `sand-wiki/src/components/LinkPicker.tsx` — replace inline search block with `<EntitySearchBox>`.
- **Modify** `sand-wiki/src/components/RecipeEditForm.tsx` — `LineEditor` → search-to-add; `items` type → `LinkOption`.
- **Modify** `sand-wiki/src/app/contribute/new-recipe/page.tsx` + `edit-recipe/page.tsx` — widen `items` select.
- **Modify** `sand-wiki/src/components/CreateEntityForm.tsx` — rarity/category selects → `RaritySelect`/`CategorySelect`.
- **Modify** `sand-wiki/src/components/EditProposalForm.tsx` — branch rarity/category to styled selects.
- **Modify** `sand-wiki/instructions.md` — codify the rule.

**Unchanged:** all server actions, `parseRecipeLines`, `parseLinkRows`, `EnumField.tsx`, `link-picker.ts`, schema.

---

### Task 1: Extract `EntitySearchBox` and refactor `LinkPicker`

**Files:**
- Create: `sand-wiki/src/components/EntitySearchBox.tsx`
- Modify: `sand-wiki/src/components/LinkPicker.tsx`

- [ ] **Step 1: Create `EntitySearchBox.tsx`**

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { filterLinkOptions, hasExactOptionMatch, type LinkOption } from "@/lib/link-picker";
import { ItemIcon } from "@/components/ItemIcon";
import { rarityColor } from "@/lib/rarity";
import { inputCls } from "@/components/form-styles";

const MAX_RESULTS = 50;

/** Enriched search input + results dropdown for picking an entity. Owns its own query +
 *  highlight state; renders results with ItemIcon + rarity-colored name and an optional
 *  "add custom / unlinked" fallback. Emits NO FormData — it calls back to the parent, which
 *  owns the selected rows and their hidden inputs. */
export function EntitySearchBox({
  items,
  excludeSlugs,
  optionNoun = "item",
  allowCustom = false,
  onSelect,
  onSelectCustom,
}: {
  items: LinkOption[];
  excludeSlugs: string[];
  optionNoun?: string;
  allowCustom?: boolean;
  onSelect: (o: LinkOption) => void;
  onSelectCustom?: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => filterLinkOptions(items, query, excludeSlugs).slice(0, MAX_RESULTS),
    [items, query, excludeSlugs],
  );

  const showCustom =
    allowCustom && !!onSelectCustom && query.trim() !== "" && !hasExactOptionMatch(items, query);
  const open = query.trim() !== "" && (results.length > 0 || showCustom);
  const count = results.length + (showCustom ? 1 : 0);

  const pick = (o: LinkOption) => { onSelect(o); setQuery(""); setHi(0); searchRef.current?.focus(); };
  const pickCustom = () => {
    const name = query.trim();
    if (!name || !onSelectCustom) return;
    onSelectCustom(name); setQuery(""); setHi(0); searchRef.current?.focus();
  };
  const choose = (idx: number) => {
    if (idx < results.length) pick(results[idx]);
    else if (showCustom) pickCustom();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, count - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(hi); }
    else if (e.key === "Escape") { setQuery(""); }
  };

  return (
    <div className="relative">
      {/* eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- listbox is conditionally rendered with no stable id for aria-controls */}
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
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
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
              onMouseDown={(e) => { e.preventDefault(); pickCustom(); }}
              className={`flex cursor-pointer items-center gap-2 border-t border-dashed border-border-strong px-2 py-1.5 italic text-muted-foreground ${hi === results.length ? "bg-card-elevated" : ""}`}
            >
              ＋ Add &quot;{query.trim()}&quot; as custom / unlinked
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
```

Note: this is the same markup/behavior as the current `LinkPicker` search block, generalized. If the current `LinkPicker` uses a slightly different eslint-disable placement for the combobox aria rule, match whatever makes `npm run lint` pass.

- [ ] **Step 2: Refactor `LinkPicker.tsx` to use `EntitySearchBox`**

In `sand-wiki/src/components/LinkPicker.tsx`:
1. Remove the now-unused imports `filterLinkOptions, hasExactOptionMatch` and `useRef` (keep `useMemo`, `useState`). Keep `ItemIcon`, `rarityColor`, `CUSTOM_TARGET`/`LinkRowDraft`, `TIER_ORDER`, and the form-style imports. Add `import { EntitySearchBox } from "@/components/EntitySearchBox";`.
2. Delete the `query`, `hi`, `searchRef` state, the `results` useMemo, and `showCustom`/`open`/`count`/`onKeyDown` — they move into `EntitySearchBox`. KEEP the `selectedSlugs` useMemo (deps `[rows]`) and `optBySlug`.
3. Replace `addOption`/`addCustom` so they take their argument and only mutate rows (no query reset):

```tsx
  const addOption = (o: LinkOption) =>
    setRows([...rows, toRow({ targetSlug: o.slug, name: o.name, amount: 1, tier: "", value1: "" })]);
  const addCustom = (name: string) =>
    setRows([...rows, toRow({ targetSlug: null, name, amount: 1, tier: "", value1: "" })]);
```

4. Replace the entire `<div className="relative"> … </div>` search block (the input + dropdown `<ul>`) with:

```tsx
      <EntitySearchBox
        items={items}
        excludeSlugs={selectedSlugs}
        optionNoun={optionNoun}
        allowCustom={allowCustom}
        onSelect={addOption}
        onSelectCustom={addCustom}
      />
```

The selected-rows `<ul>` and the per-row hidden inputs (`linkSlug`/`linkName`/`linkAmount`/`linkTier`/`linkValue1`) stay exactly as they are. `selectedSlugs` must be computed via the existing memo (derive `rows.map(r => r.targetSlug).filter(...)`).

- [ ] **Step 3: Verify**

Run: `cd sand-wiki && npx tsc --noEmit` (only the known crownsIcon error), `npm run lint` (clean), `npm test` (295 green — pure helpers unchanged).

- [ ] **Step 4: Manually confirm no behavior change**

Re-read `LinkPicker.tsx`: every selected row still emits `linkSlug` + `linkName` (+ role fields), and the search now delegates to `EntitySearchBox` with `excludeSlugs={selectedSlugs}` and `allowCustom`/`onSelectCustom` wired. There must be no leftover dead code (no orphan `onKeyDown`, `results`, etc.).

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/components/EntitySearchBox.tsx sand-wiki/src/components/LinkPicker.tsx
git commit -m "refactor(select): extract EntitySearchBox; LinkPicker uses it"
```

---

### Task 2: Recipe editor → search-to-add

**Files:**
- Modify: `sand-wiki/src/components/RecipeEditForm.tsx`
- Modify: `sand-wiki/src/app/contribute/new-recipe/page.tsx`
- Modify: `sand-wiki/src/app/contribute/edit-recipe/page.tsx`

- [ ] **Step 1: Widen the recipe pages' item queries**

In BOTH `new-recipe/page.tsx` (the `const items = await prisma.entity.findMany(...)` line) and `edit-recipe/page.tsx` (likewise), change the select to:

```ts
  const items = await prisma.entity.findMany({
    where: { kind: "item" },
    select: { slug: true, name: true, rarity: true, icon: true, category: true },
    orderBy: { name: "asc" },
  });
```

(Leave everything else in those files unchanged.)

- [ ] **Step 2: Rewrite `RecipeEditForm.tsx`**

Replace the whole file with:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { submitRecipeEdit } from "@/app/contribute/actions";
import { EnumField } from "@/components/EnumField";
import { EntitySearchBox } from "@/components/EntitySearchBox";
import { ItemIcon } from "@/components/ItemIcon";
import { DirtyForm, DirtySubmit } from "@/components/DirtyForm";
import { rarityColor } from "@/lib/rarity";
import type { LinkOption } from "@/lib/link-picker";
import {
  labelCls, inputCls, textareaCls, btnGhost, btnSm,
} from "@/components/form-styles";
import type { RecipeLineDraft, RecipeSnapshot } from "@/lib/recipe-proposal";

type RecipeAction = (formData: FormData) => void | Promise<void>;
type Side = "input" | "output";

let nextKey = 0;
type Row = RecipeLineDraft & { key: number };
const toRow = (l: RecipeLineDraft): Row => ({ ...l, key: nextKey++ });

function LineEditor({
  side,
  lines,
  setLines,
  items,
}: {
  side: Side;
  lines: Row[];
  setLines: (next: Row[]) => void;
  items: LinkOption[];
}) {
  const optBySlug = useMemo(() => new Map(items.map((o) => [o.slug, o])), [items]);
  const selectedSlugs = useMemo(() => lines.map((l) => l.slug).filter((s) => s !== ""), [lines]);

  const update = (i: number, patch: Partial<RecipeLineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setLines(lines.filter((_, j) => j !== i));
  const addLine = (o: LinkOption) =>
    setLines([...lines, toRow({ slug: o.slug, name: o.name, amount: 1 })]);

  return (
    <fieldset className="space-y-2">
      <legend className={`mb-1 ${labelCls}`}>{side === "input" ? "Inputs" : "Outputs"}</legend>

      {lines.length > 0 && (
        <ul className="space-y-1.5">
          {lines.map((l, i) => {
            const opt = optBySlug.get(l.slug);
            return (
              <li key={l.key} className="flex items-center gap-2 border border-border bg-background px-2 py-1.5">
                <ItemIcon name={l.name} size="sm" decorative icon={opt?.icon} rarity={opt?.rarity} categorySlug={opt?.category} />
                <input type="hidden" name={`${side}Slug`} value={l.slug} />
                <span className="flex-1 text-sm" style={{ color: rarityColor(opt?.rarity) ?? undefined }}>{l.name}</span>
                <input
                  name={`${side}Amount`}
                  type="number"
                  min={1}
                  value={l.amount}
                  onChange={(e) => update(i, { amount: Number(e.target.value) })}
                  className={`${inputCls} w-16 text-center`}
                  aria-label="Amount"
                />
                <button type="button" aria-label="Remove line" className={`${btnGhost} ${btnSm}`} onClick={() => remove(i)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <EntitySearchBox
        items={items}
        excludeSlugs={selectedSlugs}
        optionNoun="item"
        onSelect={addLine}
      />
    </fieldset>
  );
}

export function RecipeEditForm({
  slug,
  snapshot,
  items,
  workbenches,
  backHref,
  action = submitRecipeEdit,
  submitLabel = "Submit correction",
  hiddenFields,
}: {
  slug?: string;
  snapshot: RecipeSnapshot;
  items: LinkOption[];
  workbenches: string[];
  backHref: string;
  action?: RecipeAction;
  submitLabel?: string;
  hiddenFields?: Record<string, string>;
}) {
  const [inputs, setInputs] = useState<Row[]>(snapshot.inputs.map(toRow));
  const [outputs, setOutputs] = useState<Row[]>(snapshot.outputs.map(toRow));

  return (
    <DirtyForm action={action} className="space-y-5 max-w-2xl">
      {slug && <input type="hidden" name="slug" value={slug} />}
      {Object.entries(hiddenFields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Workbench</span>
        <EnumField field="workbench" value={snapshot.workbench ?? ""} options={workbenches.map((w) => ({ value: w, label: w }))} />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Tier</span>
          <input name="tier" type="number" defaultValue={snapshot.tier ?? ""} className={`${inputCls} w-28`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Craft time (sec)</span>
          <input name="craftTimeSeconds" type="number" step="any" defaultValue={snapshot.craftTimeSeconds ?? ""} className={`${inputCls} w-36`} />
        </label>
      </div>

      <LineEditor side="input" lines={inputs} setLines={setInputs} items={items} />
      <LineEditor side="output" lines={outputs} setLines={setOutputs} items={items} />

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Note / source (optional)</span>
        <textarea name="note" className={textareaCls} rows={2} placeholder="Where did you confirm this?" />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link href={backHref} className={btnGhost}>Cancel</Link>
        <DirtySubmit>{submitLabel}</DirtySubmit>
      </div>
    </DirtyForm>
  );
}
```

Key points: `selectCls`/`textarea` import for the old select is gone; `blankLine` is gone (lines start from the snapshot — new-recipe still seeds the originating item via `snapshot`); emission of `${side}Slug` + `${side}Amount` is unchanged (one pair per row, index-aligned), so `parseRecipeLines` is untouched; `allowCustom` is omitted (defaults false) so recipe lines must be real items. Duplicate adds are blocked by `excludeSlugs`, and `parseRecipeLines` already rejects duplicates server-side.

- [ ] **Step 3: Verify**

Run: `cd sand-wiki && npx tsc --noEmit` (only crownsIcon), `npm run lint` (clean), `npm test` (green), `npm run build` (succeeds — exercises new-recipe/edit-recipe routes).

- [ ] **Step 4: Commit**

```bash
git add sand-wiki/src/components/RecipeEditForm.tsx sand-wiki/src/app/contribute/new-recipe/page.tsx sand-wiki/src/app/contribute/edit-recipe/page.tsx
git commit -m "feat(select): recipe inputs/outputs use search-to-add picker"
```

---

### Task 3: `StyledSelect` + rarity/category wrappers

**Files:**
- Create: `sand-wiki/src/components/StyledSelect.tsx`

- [ ] **Step 1: Create `StyledSelect.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { rarityColor } from "@/lib/rarity";
import { CategoryIcon } from "@/components/CategoryIcon";
import { selectCls } from "@/components/form-styles";

export interface StyledOption { value: string; label: string }

type Props = {
  name: string;
  options: StyledOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  renderLeading?: (value: string) => React.ReactNode;
  tint?: (value: string) => string | undefined;
};

/** Accessible custom listbox for a CLOSED enum set. Renders a button (leading visual +
 *  current label) and an absolute option list; emits a hidden <input name> with the chosen
 *  value. Controlled (value + onChange) or uncontrolled (defaultValue). Closes on outside
 *  click / Escape; ↑/↓/Enter navigate. Use for short fixed sets only — for entity search use
 *  EntitySearchBox; for wiki-sourced "Other…" sets use EnumField. */
export function StyledSelect({
  name,
  options,
  value: controlledValue,
  defaultValue = "",
  onChange,
  placeholder = "—",
  renderLeading,
  tint,
}: Props) {
  const isControlled = controlledValue !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const value = isControlled ? controlledValue! : internal;
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const set = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
    setOpen(false);
  };
  const choose = (idx: number) => { const o = options[idx]; if (o) set(o.value); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(hi); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  const selected = options.find((o) => o.value === value);
  const selectedTint = selected ? tint?.(selected.value) : undefined;

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${selectCls} flex w-full items-center gap-2 text-left`}
      >
        {selected && renderLeading?.(selected.value)}
        <span className="flex-1 truncate" style={{ color: selectedTint }}>
          {selected ? selected.label : placeholder}
        </span>
        <span aria-hidden className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto border border-border-strong bg-card shadow-lg" role="listbox">
          {options.map((o, idx) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setHi(idx)}
              onMouseDown={(e) => { e.preventDefault(); set(o.value); }}
              className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 ${idx === hi ? "bg-card-elevated" : ""}`}
            >
              {renderLeading?.(o.value)}
              <span className="text-sm" style={{ color: tint?.(o.value) }}>{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Rarity picker: color swatch + rarity-tinted label. Closed set (no "Other"). */
export function RaritySelect(props: Omit<Props, "renderLeading" | "tint">) {
  return (
    <StyledSelect
      {...props}
      renderLeading={(v) => (
        <span aria-hidden className="size-3 shrink-0 border border-border" style={{ background: rarityColor(v) ?? "transparent" }} />
      )}
      tint={(v) => rarityColor(v) ?? undefined}
    />
  );
}

/** Category picker: category glyph + label. Closed set (no "Other"). */
export function CategorySelect(props: Omit<Props, "renderLeading" | "tint">) {
  return <StyledSelect {...props} renderLeading={(v) => <CategoryIcon slug={v} className="size-4 shrink-0" />} />;
}
```

- [ ] **Step 2: Verify it compiles in isolation**

Run: `cd sand-wiki && npx tsc --noEmit` (only crownsIcon), `npm run lint` (clean). Not used anywhere yet.

- [ ] **Step 3: Commit**

```bash
git add sand-wiki/src/components/StyledSelect.tsx
git commit -m "feat(select): add StyledSelect + RaritySelect/CategorySelect"
```

---

### Task 4: Wire styled selects into the create + edit forms

**Files:**
- Modify: `sand-wiki/src/components/CreateEntityForm.tsx`
- Modify: `sand-wiki/src/components/EditProposalForm.tsx`

- [ ] **Step 1: `CreateEntityForm.tsx` — category select → `CategorySelect`**

Add import: `import { RaritySelect, CategorySelect } from "@/components/StyledSelect";`.
Replace the category `<select>…</select>` block (the one with `name="category"`, controlled by `category`/`setCategory`) with:

```tsx
        <CategorySelect
          name="category"
          options={categoryOptions[kind]}
          value={category}
          onChange={setCategory}
          placeholder="Select a category…"
        />
```

(The Kind `<select>` stays a plain native select — kind is not rarity/category.)

- [ ] **Step 2: `CreateEntityForm.tsx` — rarity select → `RaritySelect`**

Replace the rarity branch inside the `extraFields.map`:

```tsx
          {f.field === "rarity" ? (
            <RaritySelect name="rarity" options={rarities} defaultValue="" placeholder="—" />
          ) : f.type === "text" ? (
```

Leave the `text` / default `input` branches unchanged.

- [ ] **Step 3: `EditProposalForm.tsx` — branch rarity/category**

Add import: `import { RaritySelect, CategorySelect } from "@/components/StyledSelect";`.
Replace the enum branch:

```tsx
          {f.type === "enum" ? (
            f.field === "rarity" ? (
              <RaritySelect name="rarity" options={options.rarity ?? []} defaultValue={String(values.rarity ?? "")} placeholder="—" />
            ) : f.field === "category" ? (
              <CategorySelect name="category" options={options.category ?? []} defaultValue={String(values.category ?? "")} placeholder="—" />
            ) : (
              <EnumField field={f.field} value={String(values[f.field] ?? "")} options={options[f.field] ?? []} />
            )
          ) : f.type === "text" ? (
```

(`workbenchTier` / `researchTier` still fall through to `EnumField` with its "Other…" support.)

- [ ] **Step 4: Verify**

Run: `cd sand-wiki && npx tsc --noEmit` (only crownsIcon), `npm run lint` (clean), `npm test` (green), `npm run build` (succeeds — exercises `/admin/entities/new` and `/contribute/edit`).

Note on `required`: the old category `<select required>` enforced selection client-side; the styled select emits a hidden input the browser won't validate. The server (`buildEntityCreateData` → `coerceValue`) already rejects an empty/invalid category, so submission still fails safely. This is acceptable; do not add ad-hoc client validation.

- [ ] **Step 5: Commit**

```bash
git add sand-wiki/src/components/CreateEntityForm.tsx sand-wiki/src/components/EditProposalForm.tsx
git commit -m "feat(select): rarity/category use styled swatch/icon selects"
```

---

### Task 5: Codify the rule in `instructions.md`

**Files:**
- Modify: `sand-wiki/instructions.md`

- [ ] **Step 1: Update the form-conventions section**

Find the form-conventions note (around line 268, "Use native form elements … Closed taxonomy sets are selects"). Append these rules to that section (keep existing text; add the carve-outs):

```markdown
- **Entity/item selection uses the enriched picker, never a plain `<select>` of items.**
  Use `EntitySearchBox` (search + `ItemIcon` + rarity color) — already wrapped by
  `LinkPicker` (loot/cost/keys/found-in) and `RecipeEditForm` (recipe inputs/outputs).
  Pass options as `LinkOption[]` (`{ slug, name, rarity, icon, category }`); the picker
  emits the same index-aligned FormData arrays the server parses.
- **Rarity and category selects use `StyledSelect`** (`RaritySelect` = color swatch +
  tinted label; `CategorySelect` = `CategoryIcon`). They emit a hidden input with the value.
- **Other closed or wiki-sourced enums stay native** `<select>` / `EnumField`
  (kind, workbench, tiers, target type). `EnumField` keeps the "Other…" free-text path for
  wiki-sourced sets.
```

- [ ] **Step 2: Commit**

```bash
git add sand-wiki/instructions.md
git commit -m "docs(instructions): enriched picker + styled rarity/category select rules"
```

---

### Task 6: Manual verification

No code changes unless a defect is found. Admin login + dev DB required.

- [ ] **Step 1: Start dev server** — `cd sand-wiki && npm run dev`, sign in as admin.
- [ ] **Step 2: Recipes (search-to-add)** — from an item page, use "Crafted by" / "Used in" → edit-recipe, and "Crafted here" on a location → new-recipe. Confirm: inputs/outputs are added via search (icon + rarity color), amount edits work, a duplicate item can't be added, removing works, and submitting creates the right `recipe_edit` / new-recipe proposal. Confirm the new-recipe form still pre-seeds the originating item.
- [ ] **Step 3: Rarity/category styled selects** — at `/admin/entities/new`: category shows `CategoryIcon`s and switching Kind clears the category; rarity shows color swatches + tinted label. Create an item and confirm category + rarity persist. At `/contribute/edit` for an item: rarity/category render styled; submit a change and confirm the proposal carries the right values. Confirm `workbenchTier`/`researchTier` still use the native "Other…" `EnumField`.
- [ ] **Step 4: Regression** — confirm the existing loot/cost/keys/found-in editors still work (they now route through `EntitySearchBox`).
- [ ] **Step 5: Keyboard/outside-click** — `StyledSelect` closes on outside click + Esc and navigates with ↑/↓/Enter; `EntitySearchBox` search still navigates with ↑/↓/Enter/Esc.

---

## Self-Review Notes

- **Spec coverage:** EntitySearchBox extraction (Task 1) + reuse in LinkPicker (Task 1) and RecipeEditForm (Task 2); recipe search-to-add + widened queries (Task 2); StyledSelect + Rarity/CategorySelect (Task 3) wired into create + edit forms (Task 4); instructions (Task 5); verification (Task 6).
- **Contract preserved:** recipe lines still emit `inputSlug`/`outputSlug` + `inputAmount`/`outputAmount` one-per-row (Task 2); link rows unchanged (Task 1); styled selects emit a hidden input named `category`/`rarity` matching what `resolveEnumSubmission`/`buildEntityCreateData` read.
- **Type consistency:** `LinkOption` used by EntitySearchBox, LinkPicker, RecipeEditForm, and both recipe page queries. `StyledOption = {value,label}` matches the `SelectOption` shape passed from `options[...]`/`rarities`/`categoryOptions[kind]` (both are `{value,label}`).
- **Out of scope (unchanged):** server actions, parsers, schema, EnumField, kind/workbench/tier/targetType selects, drag-reordering.
