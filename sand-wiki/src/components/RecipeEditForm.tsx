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
  const selectedSlugs = useMemo(() => lines.map((l) => l.slug), [lines]);

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
