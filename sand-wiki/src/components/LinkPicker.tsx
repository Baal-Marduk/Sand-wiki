"use client";

import { useMemo, useState } from "react";
import { CUSTOM_TARGET, type LinkRowDraft } from "@/lib/link-proposal";
import { TIER_ORDER } from "@/lib/entity-links";
import type { LinkField } from "@/lib/entity-links";
import { type LinkOption } from "@/lib/link-picker";
import { ItemIcon } from "@/components/ItemIcon";
import { rarityColor } from "@/lib/rarity";
import { labelCls, inputCls, selectCls, btnGhost, btnSm } from "@/components/form-styles";
import { EntitySearchBox } from "@/components/EntitySearchBox";

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

  const optBySlug = useMemo(() => new Map(items.map((o) => [o.slug, o])), [items]);

  const selectedSlugs = useMemo(
    () => rows.map((r) => r.targetSlug).filter((s): s is string => s !== null),
    [rows],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows(rows.filter((_, j) => j !== i));

  const addOption = (o: LinkOption) =>
    setRows([...rows, toRow({ targetSlug: o.slug, name: o.name, amount: 1, tier: "", value1: "" })]);
  const addCustom = (name: string) =>
    setRows([...rows, toRow({ targetSlug: null, name, amount: 1, tier: "", value1: "" })]);

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
                    className={`${inputCls} min-w-0 flex-1`}
                  />
                ) : (
                  <span className="min-w-0 flex-1 text-sm" style={{ color }}>{r.name}</span>
                )}

                {fields.includes("amount") && (
                  <div className="w-16 shrink-0">
                    <input
                      name="linkAmount"
                      type="number"
                      min={1}
                      value={r.amount ?? 1}
                      onChange={(e) => update(i, { amount: Number(e.target.value) })}
                      className={`${inputCls} text-center`}
                      aria-label="Amount"
                    />
                  </div>
                )}
                {fields.includes("tier") && (
                  <div className="w-32 shrink-0">
                    <select
                      name="linkTier"
                      value={r.tier ?? ""}
                      onChange={(e) => update(i, { tier: e.target.value })}
                      className={selectCls}
                      aria-label="Tier"
                    >
                      <option value="">— tier —</option>
                      {TIER_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                {fields.includes("value1") && (
                  <div className="w-24 shrink-0">
                    <input
                      name="linkValue1"
                      value={r.value1 ?? ""}
                      onChange={(e) => update(i, { value1: e.target.value })}
                      placeholder="e.g. 1-2"
                      className={inputCls}
                      aria-label="Drop range"
                    />
                  </div>
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

      <EntitySearchBox
        items={items}
        excludeSlugs={selectedSlugs}
        optionNoun={optionNoun}
        allowCustom={allowCustom}
        onSelect={addOption}
        onSelectCustom={addCustom}
      />
    </fieldset>
  );
}
