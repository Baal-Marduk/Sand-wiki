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
