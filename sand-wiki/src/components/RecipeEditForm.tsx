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
