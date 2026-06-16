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
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- aria-controls omitted; listbox is conditionally rendered and has no stable id
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
                ＋ Add &quot;{query.trim()}&quot; as custom / unlinked
              </li>
            )}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
