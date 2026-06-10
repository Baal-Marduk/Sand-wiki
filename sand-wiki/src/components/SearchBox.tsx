"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CategoryIcon } from "@/components/CategoryIcon";
import { searchSuggestions, type SearchIndex, type Suggestions } from "@/lib/search";

const EMPTY: SearchIndex = { items: [], places: [] };

// Shared across all instances — fetch the index at most once per page load.
let indexPromise: Promise<SearchIndex> | null = null;
function loadIndex(): Promise<SearchIndex> {
  if (!indexPromise) {
    indexPromise = fetch("/api/search-index")
      .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : EMPTY))
      .catch(() => EMPTY);
  }
  return indexPromise;
}

interface Flat { kind: "category" | "item" | "place"; slug: string; label: string; category: string }
interface Group { header: string; options: Flat[] }

/** Ordered dropdown groups, each included only when it has matches:
 *  Categories → Items → Loot Containers → Landmarks. */
function buildGroups(s: Suggestions): Group[] {
  const groups: Group[] = [];
  if (s.categories.length) {
    groups.push({ header: "Categories", options: s.categories.map((c) => ({ kind: "category", slug: c.slug, label: c.label, category: c.slug })) });
  }
  if (s.items.length) {
    groups.push({ header: "Items", options: s.items.map((i) => ({ kind: "item", slug: i.slug, label: i.name, category: i.category })) });
  }
  const loot = s.places.filter((p) => p.category === "loot-containers");
  if (loot.length) {
    groups.push({ header: "Loot Containers", options: loot.map((p) => ({ kind: "place", slug: p.slug, label: p.name, category: p.category })) });
  }
  const land = s.places.filter((p) => p.category === "landmarks");
  if (land.length) {
    groups.push({ header: "Landmarks", options: land.map((p) => ({ kind: "place", slug: p.slug, label: p.name, category: p.category })) });
  }
  return groups;
}

export function SearchBox({ variant }: { variant: "navbar" | "hero" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<SearchIndex>(EMPTY);
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

  const suggestions = query.trim()
    ? searchSuggestions(query, index.items, index.places)
    : { categories: [], items: [], places: [] };
  const groups = buildGroups(suggestions);
  const options = groups.flatMap((g) => g.options);
  const showList = open && options.length > 0;

  function ensureIndex() {
    if (index.items.length === 0 && index.places.length === 0) loadIndex().then(setIndex);
  }

  function navigate(f: Flat) {
    setOpen(false);
    setActive(-1);
    setQuery("");
    if (f.kind === "category") router.push(`/items?category=${f.slug}`);
    else if (f.kind === "place") router.push(`/environment/${f.slug}`);
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
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0 && options[active]) navigate(options[active]);
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

  // Build a flat list with stable global indices so aria-activedescendant IDs
  // can be computed without mutating a variable inside a render callback.
  const groupsWithBase = groups.map((g, gi) => ({
    ...g,
    base: groups.slice(0, gi).reduce((acc, prev) => acc + prev.options.length, 0),
  }));

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
          {groupsWithBase.map((g) => (
            <Fragment key={g.header}>
              <li role="presentation" className="px-2 pt-1 pb-0.5 text-xs uppercase tracking-wide text-base-content/50">
                {g.header}
              </li>
              {g.options.map((f, j) => {
                const i = g.base + j;
                return (
                  <li
                    key={`${f.kind}-${f.slug}`}
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
                );
              })}
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
