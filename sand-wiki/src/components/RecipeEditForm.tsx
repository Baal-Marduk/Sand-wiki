"use client";

import { useState } from "react";
import Link from "next/link";
import { submitRecipeEdit } from "@/app/contribute/actions";
import { EnumField } from "@/components/EnumField";
import {
  labelCls, inputCls, selectCls, textareaCls, btnPrimary, btnGhost, btnSecondary, btnSm,
} from "@/components/form-styles";
import type { RecipeLineDraft, RecipeSnapshot } from "@/lib/recipe-proposal";

type RecipeAction = (formData: FormData) => void | Promise<void>;

type ItemOption = { slug: string; name: string };
type Side = "input" | "output";

let nextKey = 0;
type Row = RecipeLineDraft & { key: number };
const toRow = (l: RecipeLineDraft): Row => ({ ...l, key: nextKey++ });

function blankLine(): Row {
  return { slug: "", name: "", amount: 1, key: nextKey++ };
}

function LineEditor({
  side,
  lines,
  setLines,
  items,
}: {
  side: Side;
  lines: Row[];
  setLines: (next: Row[]) => void;
  items: ItemOption[];
}) {
  const update = (i: number, patch: Partial<RecipeLineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <fieldset className="space-y-2">
      <legend className={`mb-1 ${labelCls}`}>{side === "input" ? "Inputs" : "Outputs"}</legend>
      {lines.map((l, i) => (
        <div key={l.key} className="grid grid-cols-[1fr_84px_auto] items-center gap-2">
          <select
            name={`${side}Slug`}
            value={l.slug}
            onChange={(e) => update(i, { slug: e.target.value })}
            className={selectCls}
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
            className={`${inputCls} text-center`}
          />
          <button
            type="button"
            aria-label="Remove line"
            className={`${btnGhost} ${btnSm}`}
            onClick={() => setLines(lines.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className={`${btnSecondary} ${btnSm}`} onClick={() => setLines([...lines, blankLine()])}>
        + Add {side}
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
  action = submitRecipeEdit,
  submitLabel = "Submit correction",
  hiddenFields,
}: {
  slug?: string;
  snapshot: RecipeSnapshot;
  items: ItemOption[];
  workbenches: string[];
  backHref: string;
  action?: RecipeAction;
  submitLabel?: string;
  hiddenFields?: Record<string, string>;
}) {
  const [inputs, setInputs] = useState<Row[]>(snapshot.inputs.length ? snapshot.inputs.map(toRow) : [blankLine()]);
  const [outputs, setOutputs] = useState<Row[]>(snapshot.outputs.length ? snapshot.outputs.map(toRow) : [blankLine()]);

  return (
    <form action={action} className="space-y-5 max-w-2xl">
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
        <button type="submit" className={btnPrimary}>{submitLabel}</button>
      </div>
    </form>
  );
}
