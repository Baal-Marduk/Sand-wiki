"use client";

import { useState } from "react";
import { submitLinksEdit } from "@/app/contribute/actions";
import { CUSTOM_TARGET, type LinkRowDraft } from "@/lib/link-proposal";
import type { LinkField } from "@/lib/entity-links";
import {
  labelCls, inputCls, selectCls, textareaCls, btnPrimary, btnGhost, btnSecondary, btnSm,
} from "@/components/form-styles";

type ItemOption = { slug: string; name: string };

let nextKey = 0;
type Row = LinkRowDraft & { key: number };
const toRow = (r: LinkRowDraft): Row => ({ ...r, key: nextKey++ });
const blankRow = (): Row => ({ targetSlug: "", name: "", amount: 1, tier: "", value1: "", key: nextKey++ });

const TIERS = ["Normal", "Rare", "Very Rare"];

export function LinkEditForm({
  type,
  slug,
  role,
  label,
  fields,
  rows: initialRows,
  items,
}: {
  type: string;
  slug: string;
  role: string;
  label: string;
  fields: readonly LinkField[];
  rows: LinkRowDraft[];
  items: ItemOption[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows.length ? initialRows.map(toRow) : [blankRow()]);
  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // A row is "unlinked" when its select is the CUSTOM_TARGET sentinel (targetSlug is the
  // select's value here; "" = unchosen, CUSTOM_TARGET = free-text name).
  const selectValue = (r: Row) => (r.targetSlug === null ? CUSTOM_TARGET : r.targetSlug ?? "");

  return (
    <form action={submitLinksEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="role" value={role} />

      <fieldset className="space-y-2">
        <legend className={`mb-1 ${labelCls}`}>{label}</legend>
        {rows.map((r, i) => {
          const isCustom = selectValue(r) === CUSTOM_TARGET;
          return (
            <div key={r.key} className="flex flex-wrap items-center gap-2">
              <select
                name="linkSlug"
                value={selectValue(r)}
                onChange={(e) =>
                  update(i, { targetSlug: e.target.value === CUSTOM_TARGET ? null : e.target.value })
                }
                className={`${selectCls} min-w-[12rem] flex-1`}
              >
                <option value="">— select item —</option>
                <option value={CUSTOM_TARGET}>— custom / unlinked —</option>
                {items.map((it) => (
                  <option key={it.slug} value={it.slug}>{it.name}</option>
                ))}
              </select>

              {/* Always emit linkName so indices stay aligned with linkSlug; only meaningful when custom. */}
              <input
                name="linkName"
                value={isCustom ? r.name : ""}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Custom name"
                className={`${inputCls} w-40${isCustom ? "" : " hidden"}`}
              />

              {fields.includes("amount") && (
                <input
                  name="linkAmount"
                  type="number"
                  min={1}
                  value={r.amount ?? 1}
                  onChange={(e) => update(i, { amount: Number(e.target.value) })}
                  className={`${inputCls} w-20 text-center`}
                />
              )}
              {fields.includes("tier") && (
                <select
                  name="linkTier"
                  value={r.tier ?? ""}
                  onChange={(e) => update(i, { tier: e.target.value })}
                  className={`${selectCls} w-36`}
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
                  className={`${inputCls} w-28`}
                />
              )}

              <button
                type="button"
                aria-label="Remove row"
                className={`${btnGhost} ${btnSm}`}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button type="button" className={`${btnSecondary} ${btnSm}`} onClick={() => setRows([...rows, blankRow()])}>
          + Add row
        </button>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Note / source (optional)</span>
        <textarea name="note" className={textareaCls} rows={2} placeholder="Where did you confirm this?" />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button type="submit" className={btnPrimary}>Submit {label} change</button>
      </div>
    </form>
  );
}
