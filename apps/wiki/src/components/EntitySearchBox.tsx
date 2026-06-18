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
  // Clamp the stored highlight index so a shrinking result set can never leave hi out of range.
  const safeHi = count > 0 ? Math.min(hi, count - 1) : 0;

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
    else if (e.key === "Enter") { e.preventDefault(); choose(safeHi); }
    else if (e.key === "Escape") { setQuery(""); }
  };

  return (
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
              aria-selected={idx === safeHi}
              onMouseEnter={() => setHi(idx)}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 ${idx === safeHi ? "bg-card-elevated" : ""}`}
            >
              <ItemIcon name={o.name} size="sm" decorative icon={o.icon} rarity={o.rarity} categorySlug={o.category} />
              <span className="text-sm" style={{ color: rarityColor(o.rarity) ?? undefined }}>{o.name}</span>
            </li>
          ))}
          {showCustom && (
            <li
              role="option"
              aria-selected={safeHi === results.length}
              onMouseEnter={() => setHi(results.length)}
              onMouseDown={(e) => { e.preventDefault(); pickCustom(); }}
              className={`flex cursor-pointer items-center gap-2 border-t border-dashed border-border-strong px-2 py-1.5 italic text-muted-foreground ${safeHi === results.length ? "bg-card-elevated" : ""}`}
            >
              ＋ Add &quot;{query.trim()}&quot; as custom / unlinked
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
