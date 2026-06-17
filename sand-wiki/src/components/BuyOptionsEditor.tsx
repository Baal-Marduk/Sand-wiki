"use client";

import { useState } from "react";
import { DirtyForm, DirtySubmit } from "@/components/DirtyForm";
import { EntitySearchBox } from "@/components/EntitySearchBox";
import { ItemIcon } from "@/components/ItemIcon";
import { submitBuyOptionsEdit } from "@/app/contribute/actions";
import type { LinkOption } from "@/lib/link-picker";
import type { BuyOptionDraft } from "@/lib/buy-options";
import { labelCls, inputCls, textareaCls, btnGhost, btnSecondary, btnSm } from "@/components/form-styles";

let nextKey = 0;
interface CostRow {
  key: number;
  targetSlug: string;
  name: string;
  icon: string | null;
  rarity: string | null;
  category: string | null;
  amount: number;
}
interface OptionRow {
  key: number;
  costs: CostRow[];
  yield: number;
  unlockSlug: string | null;
  unlockName: string | null;
}

const optFromDraft = (
  d: BuyOptionDraft,
  items: Map<string, LinkOption>,
  tech: Map<string, LinkOption>,
): OptionRow => ({
  key: nextKey++,
  yield: d.yield,
  unlockSlug: d.unlockSlug,
  unlockName: d.unlockSlug ? (tech.get(d.unlockSlug)?.name ?? d.unlockSlug) : null,
  costs: d.costs.map((c) => {
    const o = items.get(c.targetSlug);
    return {
      key: nextKey++,
      targetSlug: c.targetSlug,
      name: o?.name ?? c.targetSlug,
      icon: o?.icon ?? null,
      rarity: o?.rarity ?? null,
      category: o?.category ?? null,
      amount: c.amount,
    };
  }),
});

/** Grouped buy-options editor. `items` = all items (cost targets); `techNodes` =
 *  tech-node entities (unlock targets). Emits index-aligned FormData arrays:
 *  per option — optGroup/optYield/optUnlockSlug; per cost — costGroup/costSlug/costAmount. */
export function BuyOptionsEditor({
  slug,
  rows,
  items,
  techNodes,
}: {
  slug: string;
  rows: BuyOptionDraft[];
  items: LinkOption[];
  techNodes: LinkOption[];
}) {
  const itemBySlug = new Map(items.map((o) => [o.slug, o]));
  const techBySlug = new Map(techNodes.map((o) => [o.slug, o]));
  const [options, setOptions] = useState<OptionRow[]>(
    rows.map((d) => optFromDraft(d, itemBySlug, techBySlug)),
  );

  const addOption = () =>
    setOptions([
      ...options,
      { key: nextKey++, costs: [], yield: 1, unlockSlug: null, unlockName: null },
    ]);
  const removeOption = (oi: number) => setOptions(options.filter((_, i) => i !== oi));
  const patchOption = (oi: number, patch: Partial<OptionRow>) =>
    setOptions(options.map((o, i) => (i === oi ? { ...o, ...patch } : o)));
  const addCost = (oi: number, opt: LinkOption) =>
    patchOption(oi, {
      costs: [
        ...options[oi].costs,
        {
          key: nextKey++,
          targetSlug: opt.slug,
          name: opt.name,
          icon: opt.icon,
          rarity: opt.rarity,
          category: opt.category,
          amount: 1,
        },
      ],
    });
  const removeCost = (oi: number, ci: number) =>
    patchOption(oi, { costs: options[oi].costs.filter((_, i) => i !== ci) });
  const patchCost = (oi: number, ci: number, patch: Partial<CostRow>) =>
    patchOption(oi, {
      costs: options[oi].costs.map((c, i) => (i === ci ? { ...c, ...patch } : c)),
    });

  return (
    <DirtyForm action={submitBuyOptionsEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-4">
        {options.map((o, oi) => (
          <fieldset key={o.key} className="space-y-3 border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <legend className={labelCls}>Option {oi + 1}</legend>
              <button
                type="button"
                className={`${btnGhost} ${btnSm}`}
                onClick={() => removeOption(oi)}
                aria-label="Remove option"
              >
                Remove option
              </button>
            </div>

            <input type="hidden" name="optGroup" value={oi} />
            <input type="hidden" name="optUnlockSlug" value={o.unlockSlug ?? ""} />

            <div className="space-y-1.5">
              <span className={labelCls}>Price</span>
              {o.costs.map((c, ci) => (
                <div
                  key={c.key}
                  className="flex items-center gap-2 border border-border bg-card px-2 py-1.5"
                >
                  <ItemIcon
                    name={c.name}
                    size="sm"
                    decorative
                    icon={c.icon}
                    rarity={c.rarity}
                    categorySlug={c.category}
                  />
                  <input type="hidden" name="costGroup" value={oi} />
                  <input type="hidden" name="costSlug" value={c.targetSlug} />
                  <span className="min-w-0 flex-1 text-sm">{c.name}</span>
                  <div className="w-20 shrink-0">
                    <input
                      name="costAmount"
                      type="number"
                      min={1}
                      value={c.amount}
                      onChange={(e) => patchCost(oi, ci, { amount: Number(e.target.value) })}
                      className={`${inputCls} text-center`}
                      aria-label="Amount"
                    />
                  </div>
                  <button
                    type="button"
                    className={`${btnGhost} ${btnSm}`}
                    onClick={() => removeCost(oi, ci)}
                    aria-label="Remove cost"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <EntitySearchBox
                items={items}
                excludeSlugs={o.costs.map((c) => c.targetSlug)}
                optionNoun="item"
                allowCustom={false}
                onSelect={(opt) => addCost(oi, opt)}
              />
            </div>

            <label className="flex items-center gap-2">
              <span className={labelCls}>You receive</span>
              <div className="w-20 shrink-0">
                <input
                  name="optYield"
                  type="number"
                  min={1}
                  value={o.yield}
                  onChange={(e) => patchOption(oi, { yield: Number(e.target.value) })}
                  className={`${inputCls} text-center`}
                  aria-label="Yield"
                />
              </div>
            </label>

            <div className="space-y-1.5">
              <span className={labelCls}>Unlocked by (optional)</span>
              {o.unlockSlug ? (
                <div className="flex items-center gap-2 border border-border bg-card px-2 py-1.5">
                  <span className="min-w-0 flex-1 text-sm">{o.unlockName}</span>
                  <button
                    type="button"
                    className={`${btnGhost} ${btnSm}`}
                    onClick={() => patchOption(oi, { unlockSlug: null, unlockName: null })}
                    aria-label="Clear unlock"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <EntitySearchBox
                  items={techNodes}
                  excludeSlugs={[]}
                  optionNoun="tech node"
                  allowCustom={false}
                  onSelect={(opt) => patchOption(oi, { unlockSlug: opt.slug, unlockName: opt.name })}
                />
              )}
            </div>
          </fieldset>
        ))}
      </div>

      <button type="button" className={`${btnSecondary} ${btnSm}`} onClick={addOption}>
        + Add buy option
      </button>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Note / source (optional)</span>
        <textarea
          name="note"
          className={textareaCls}
          rows={2}
          placeholder="Where did you confirm this?"
        />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <DirtySubmit>Submit buy options change</DirtySubmit>
      </div>
    </DirtyForm>
  );
}
