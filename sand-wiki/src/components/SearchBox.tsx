"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CategoryIcon } from "@/components/CategoryIcon";
import { searchSuggestions, type IndexItem, type Suggestions } from "@/lib/search";

// Shared across all instances — fetch the index at most once per page load.
let indexPromise: Promise<IndexItem[]> | null = null;
function loadIndex(): Promise<IndexItem[]> {
  if (!indexPromise) {
    indexPromise = fetch("/api/search-index")
      .then((r) => (r.ok ? (r.json() as Promise<IndexItem[]>) : []))
      .catch(() => []);
  }
  return indexPromise;
}

interface Flat { kind: "category" | "item"; slug: string; label: string; category: string }

function flatten(s: Suggestions): Flat[] {
  return [
    ...s.categories.map((c) => ({ kind: "category" as const, slug: c.slug, label: c.label, category: c.slug })),
    ...s.items.map((i) => ({ kind: "item" as const, slug: i.slug, label: i.name, category: i.category })),
  ];
}

export function SearchBox({ variant }: { variant: "navbar" | "hero" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Hide the navbar search on the homepage (the hero search covers it there).
  if (variant === "navbar" && pathname === "/") return null;

  const suggestions = query.trim() ? flatten(searchSuggestions(query, index)) : [];
  const showList = open && suggestions.length > 0;

  function ensureIndex() {
    if (index.length === 0) loadIndex().then(setIndex);
  }

  function navigate(f: Flat) {
    setOpen(false);
    setActive(-1);
    setQuery("");
    if (f.kind === "category") router.push(`/items?category=${f.slug}`);
    else router.push(`/items/${f.slug}`);
  }

  function submitFreeText() {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/items?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0 && suggestions[active]) navigate(suggestions[active]);
      else submitFreeText();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const inputCls =
    variant === "navbar"
      ? "input input-sm input-bordered rounded-full w-44 sm:w-56"
      : "input input-bordered join-item w-full";

  return (
    <div ref={boxRef} className={`relative ${variant === "hero" ? "w-full max-w-md mx-auto" : ""}`}>
      <div className={variant === "hero" ? "join w-full" : ""}>
        <input
          type="search"
          role="combobox"
          aria-label="Search items"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          placeholder="Search items…"
          value={query}
          className={inputCls}
          onFocus={() => { ensureIndex(); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setActive(-1); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        {variant === "hero" && (
          <button type="button" className="btn btn-primary join-item" onClick={submitFreeText}>
            Search
          </button>
        )}
      </div>

      {showList && (
        <ul
          role="listbox"
          id={listId}
          className="absolute left-0 top-full z-30 mt-1 w-full min-w-[16rem] rounded-box border border-base-300 bg-base-200 p-1 shadow"
        >
          {suggestions.map((f, i) => {
            const isFirstItem = f.kind === "item" && (i === 0 || suggestions[i - 1].kind === "category");
            const isFirstCat = f.kind === "category" && i === 0;
            return (
              <Fragment key={`${f.kind}-${f.slug}`}>
                {isFirstCat && (
                  <li role="presentation" className="px-2 pt-1 pb-0.5 text-xs uppercase tracking-wide text-base-content/50">
                    Categories
                  </li>
                )}
                {isFirstItem && (
                  <li role="presentation" className="px-2 pt-1 pb-0.5 text-xs uppercase tracking-wide text-base-content/50">
                    Items
                  </li>
                )}
                <li
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={active === i}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-sm cursor-pointer ${active === i ? "bg-base-300" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); navigate(f); }}
                >
                  <CategoryIcon slug={f.category} className="size-4 shrink-0" />
                  {f.label}
                  <span className="ml-auto text-xs text-base-content/50" aria-hidden="true">
                    {f.kind === "category" ? "filter" : "page"}
                  </span>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
