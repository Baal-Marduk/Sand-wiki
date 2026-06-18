# Tech Tree Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish and connect the `/tech` page — site-matching logo, shadcn toolbar buttons, a styled confirm modal (no browser dialogs), hand-grab panning, the faction-root starting part shown/linked, and two-way jump links between the tech tree and entity detail pages.

**Architecture:** Extend the pure data layer (`types.ts`/`transform.ts`) with unlock `href`s and a per-faction `rootPart` (computed via the existing pure `entityHref`); `getTechTree()` supplies resolved refs and a new `getUnlockingNode()` powers the reverse jump. The `TechTreeView` client component gains branding, a `ConfirmDialog`, pointer-drag panning, URL-driven selection, and links. Entity detail pages render a "Show in tech tree" button.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6, Vitest, Radix Dialog (already a dep via `sheet.tsx`), shadcn `Button`.

---

## Background facts (verified — do not re-derive)

- Faction free starting parts (trampler-parts NOT unlocked by any node): `godlewski → s-h-atm-fs-77b-l-small-chassis`, `kaiser → s-h-cargo-deck`, `landwehr → s-h-fortified-entrance-area`.
- `entityHref(kind, slug)` (`src/lib/entity-links.ts`) is pure: `item → /items/<slug>`, `environment → /environment/<slug>`, `trampler-part → /tramplers/<slug>`, else `null`.
- `Button` (`src/components/ui/button.tsx`) variants: `default | destructive | outline | secondary | ghost | link`; also exports `buttonVariants(...)` for styling a `<Link>`.
- shadcn `dialog`/`alert-dialog` are NOT installed; `@radix-ui/react-dialog` IS (used by `src/components/ui/sheet.tsx`).
- Detail pages (`items/[slug]/page.tsx`, `tramplers/[slug]/page.tsx`) render `<EntityDetail ... badges={...} />`; `EntityDetail` has a `badges?: React.ReactNode` slot (no dedicated actions slot).
- `#tt-tip` currently has `pointer-events: none` in `tech-tree.css` — must change to make unlock links clickable.

## File Structure

- `src/lib/tech-tree/types.ts` — add `TechEntityRef`; `TechUnlock += href`; `TechFaction += rootPart?`; `RawTechLinkTarget += kind`.
- `src/lib/tech-tree/transform.ts` — `FACTION_ROOT_PART` map; unlock `href`; faction `rootPart` from a `rootParts` arg.
- `src/lib/tech-tree/transform.test.ts` — extend.
- `src/lib/queries.ts` — `getTechTree()` (select unlock `kind` + resolve root parts) and new `getUnlockingNode()`.
- `src/components/ConfirmDialog.tsx` — new themed confirm modal.
- `src/components/tech-tree/TechTreeView.tsx` — branding, buttons, modal, links, panning, URL-select.
- `src/components/tech-tree/tech-tree.css` — drop old brand rules; add root-part, tooltip-link, pan-cursor, interactive-tooltip styles.
- `src/app/items/[slug]/page.tsx`, `src/app/tramplers/[slug]/page.tsx` — "Show in tech tree" button.
- `instructions.md` — no-browser-dialog rule.

---

## Task 1: Data layer — unlock href + faction rootPart

**Files:**
- Modify: `src/lib/tech-tree/types.ts`
- Modify: `src/lib/tech-tree/transform.ts`
- Test: `src/lib/tech-tree/transform.test.ts`

- [ ] **Step 1: Extend `types.ts`**

Add the shared ref type and extend three interfaces. Add near the top (after the file's opening comment):

```ts
/** A link to an entity detail page (item / trampler-part / environment). */
export interface TechEntityRef {
  slug: string;
  name: string;
  icon: string | null;
  href: string | null;
}
```

In `TechUnlock`, add `href`:
```ts
export interface TechUnlock {
  name: string;
  slug: string | null;
  icon: string | null;
  href: string | null;
}
```

In `TechFaction`, add `rootPart`:
```ts
export interface TechFaction {
  id: string;
  name: string;
  accent: string;
  rootPart?: TechEntityRef | null;
}
```

In `RawTechLinkTarget`, add `kind` (needed to compute unlock hrefs):
```ts
export interface RawTechLinkTarget {
  slug: string;
  name: string;
  icon: string | null;
  kind?: string | null;
  techNodeStats: { faction: string } | null;
}
```

- [ ] **Step 2: Write the failing test additions in `transform.test.ts`**

Add these imports/usage at the top (keep existing imports):
```ts
import { toTechTree, parseLetter, FACTION_ROOT_PART } from "./transform";
```

Add a new `describe` block:
```ts
describe("toTechTree — hrefs and root parts", () => {
  it("computes an href for each unlock from the target kind", () => {
    const rows: RawTechRow[] = [
      {
        slug: "tech-godlewski-t1a-weapons", name: "Weapons",
        techNodeStats: { faction: "godlewski", tier: 1, sortOrder: null },
        outgoingLinks: [
          { role: "tech-unlocks", name: "Rifle", amount: null, sortOrder: 0,
            target: { slug: "rifle-musket", name: "Rifle", icon: "/r.png", kind: "item", techNodeStats: null } },
          { role: "tech-unlocks", name: "Deck", amount: null, sortOrder: 1,
            target: { slug: "s-h-cargo-deck", name: "Deck", icon: "/d.png", kind: "trampler-part", techNodeStats: null } },
        ],
      },
    ];
    const tree = toTechTree(rows);
    expect(tree.nodes[0].unlocks).toEqual([
      { name: "Rifle", slug: "rifle-musket", icon: "/r.png", href: "/items/rifle-musket" },
      { name: "Deck", slug: "s-h-cargo-deck", icon: "/d.png", href: "/tramplers/s-h-cargo-deck" },
    ]);
  });

  it("exposes the faction → starting-part slug map", () => {
    expect(FACTION_ROOT_PART).toEqual({
      godlewski: "s-h-atm-fs-77b-l-small-chassis",
      kaiser: "s-h-cargo-deck",
      landwehr: "s-h-fortified-entrance-area",
    });
  });

  it("attaches a faction rootPart when rootParts are provided", () => {
    const rows: RawTechRow[] = [
      { slug: "tech-kaiser-t1a-x", name: "X", techNodeStats: { faction: "kaiser", tier: 1, sortOrder: null }, outgoingLinks: [] },
    ];
    const tree = toTechTree(rows, {
      "s-h-cargo-deck": { name: "S&H Cargo Deck", icon: "/c.png", kind: "trampler-part" },
    });
    const kaiser = tree.factions.find((f) => f.id === "kaiser")!;
    expect(kaiser.rootPart).toEqual({
      slug: "s-h-cargo-deck", name: "S&H Cargo Deck", icon: "/c.png", href: "/tramplers/s-h-cargo-deck",
    });
  });

  it("leaves rootPart null when the slug is not resolved", () => {
    const rows: RawTechRow[] = [
      { slug: "tech-kaiser-t1a-x", name: "X", techNodeStats: { faction: "kaiser", tier: 1, sortOrder: null }, outgoingLinks: [] },
    ];
    const tree = toTechTree(rows);
    expect(tree.factions.find((f) => f.id === "kaiser")!.rootPart ?? null).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test -- src/lib/tech-tree/transform.test.ts`
Expected: FAIL (no `FACTION_ROOT_PART` export; `href` missing on unlocks).

- [ ] **Step 4: Implement in `transform.ts`**

Add the import at the top (with the other imports):
```ts
import { entityHref } from "../entity-links";
```

Add the exported map (near `CROWNS_NAME`):
```ts
/** Each faction's free starting hull part (a trampler-part not unlocked by any node). */
export const FACTION_ROOT_PART: Record<string, string> = {
  godlewski: "s-h-atm-fs-77b-l-small-chassis",
  kaiser: "s-h-cargo-deck",
  landwehr: "s-h-fortified-entrance-area",
};
```

Change the `toTechTree` signature to accept resolved root parts:
```ts
export function toTechTree(
  rows: RawTechRow[],
  rootParts: Record<string, { name: string; icon: string | null; kind: string }> = {},
): TechTree {
```

In the per-node mapping, change the `unlocks` line to include `href`:
```ts
      const unlocks = unlockLinks.map((l) => ({
        name: l.name,
        slug: l.target?.slug ?? null,
        icon: l.target?.icon ?? null,
        href: l.target ? entityHref(l.target.kind ?? null, l.target.slug) : null,
      }));
```

Replace the final `factions` construction so each present faction gets its `rootPart`:
```ts
  const present = new Set(nodes.map((n) => n.faction));
  const factions = FACTIONS.filter((f) => present.has(f.id)).map((f) => {
    const slug = FACTION_ROOT_PART[f.id];
    const rp = slug ? rootParts[slug] : undefined;
    return {
      ...f,
      rootPart: rp ? { slug, name: rp.name, icon: rp.icon, href: entityHref(rp.kind, slug) } : null,
    };
  });
  return { nodes, factions, defaultUnlocked };
```

- [ ] **Step 5: Run — expect PASS**

Run: `npm test -- src/lib/tech-tree/transform.test.ts`
Expected: PASS (original 4 + 4 new = 8).

- [ ] **Step 6: Commit**
```bash
git add src/lib/tech-tree/types.ts src/lib/tech-tree/transform.ts src/lib/tech-tree/transform.test.ts
git commit -m "feat(tech): unlock hrefs + faction rootPart in transform"
```

---

## Task 2: Queries — getTechTree root parts + getUnlockingNode

**Files:**
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Update imports**

Ensure these imports exist near the existing tech-tree import:
```ts
import { toTechTree, FACTION_ROOT_PART } from "./tech-tree/transform";
import type { TechTree } from "./tech-tree/types";
```

- [ ] **Step 2: Replace the body of `getTechTree()`**

Add `kind: true` to the unlock/cost/prereq target select, resolve the three root parts, and pass them in. Replace the whole `getTechTree` function with:

```ts
/** Full tech tree: all tech-node entities with costs, unlocks and same-faction prereqs,
 *  plus each faction's free starting part. */
export async function getTechTree(): Promise<TechTree> {
  const rows = await prisma.entity.findMany({
    where: { kind: "tech-node" },
    select: {
      slug: true,
      name: true,
      techNodeStats: { select: { faction: true, tier: true, sortOrder: true } },
      outgoingLinks: {
        where: { role: { in: ["tech-prereq", "tech-unlock-cost", "tech-unlocks"] } },
        orderBy: { sortOrder: "asc" },
        select: {
          role: true, name: true, amount: true, sortOrder: true,
          target: {
            select: { slug: true, name: true, icon: true, kind: true, techNodeStats: { select: { faction: true } } },
          },
        },
      },
    },
  });

  const rootSlugs = Object.values(FACTION_ROOT_PART);
  const rootRows = await prisma.entity.findMany({
    where: { slug: { in: rootSlugs } },
    select: { slug: true, name: true, icon: true, kind: true },
  });
  const rootParts = Object.fromEntries(
    rootRows.map((r) => [r.slug, { name: r.name, icon: r.icon, kind: r.kind }]),
  );

  return toTechTree(rows, rootParts);
}
```

- [ ] **Step 3: Add `getUnlockingNode()` at the end of `queries.ts`**

```ts
/** The tech-node slug that unlocks the given entity (by slug), or null. Entities are
 *  typically unlocked by one node; the lowest-sortOrder incoming `tech-unlocks` wins. */
export async function getUnlockingNode(entitySlug: string): Promise<{ slug: string } | null> {
  const link = await prisma.entityLink.findFirst({
    where: { role: "tech-unlocks", target: { slug: entitySlug } },
    orderBy: { sortOrder: "asc" },
    select: { source: { select: { slug: true } } },
  });
  return link?.source ? { slug: link.source.slug } : null;
}
```

- [ ] **Step 4: Verify against the live DB**

Run:
```bash
npx tsx -e "import('./src/lib/queries.ts').then(async m => { const t = await m.getTechTree(); const k = t.factions.map(f => f.id + ':' + (f.rootPart?.slug ?? 'none')).join(', '); console.log('rootParts', k); const u = t.nodes.find(n => n.unlocks.some(x => x.href)); console.log('sample unlock href', JSON.stringify(u?.unlocks[0])); const n = await m.getUnlockingNode('s-h-cargo-deck-framed'); console.log('unlockingNode(s-h-cargo-deck-framed)', JSON.stringify(n)); process.exit(0); })"
```
Expected: `rootParts godlewski:s-h-atm-fs-77b-l-small-chassis, kaiser:s-h-cargo-deck, landwehr:s-h-fortified-entrance-area`; a sample unlock with a non-null `href` like `/items/...` or `/tramplers/...`; and `getUnlockingNode('s-h-cargo-deck-framed')` → `{"slug":"tech-kaiser-t1a-cargo-deck"}`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/queries.ts
git commit -m "feat(tech): getTechTree resolves faction root parts; add getUnlockingNode"
```

---

## Task 3: ConfirmDialog component + no-browser-dialog rule

**Files:**
- Create: `src/components/ConfirmDialog.tsx`
- Modify: `instructions.md`

- [ ] **Step 1: Create `src/components/ConfirmDialog.tsx`**

```tsx
"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[121] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 border border-border-strong bg-card-elevated p-5 shadow-2xl focus:outline-none"
        >
          <DialogPrimitive.Title className="font-display text-base font-semibold text-foreground">
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              size="sm"
              onClick={() => { onConfirm(); onOpenChange(false); }}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
```

- [ ] **Step 2: Verify it typechecks and the border-strong token class exists**

Run: `npx tsc --noEmit`
Expected: no error in `ConfirmDialog.tsx`. (If `border-border-strong` is not a recognized Tailwind utility, replace that class with inline `style={{ borderColor: "var(--border-strong)" }}` on the Content and keep `border`.)

- [ ] **Step 3: Add the rule to `instructions.md`**

Find the conventions/UX area of `instructions.md` (it has top "how things work" sections). Add this bullet under the most relevant conventions list (e.g. a "UI / UX conventions" or "Conventions" heading; if none exists, add a new `## Conventions` section near the top):

```markdown
- **No browser dialogs.** Never use `window.alert`, `window.confirm`, or `window.prompt`.
  Use a styled in-app modal instead (e.g. `src/components/ConfirmDialog.tsx`).
```

- [ ] **Step 4: Commit**
```bash
git add src/components/ConfirmDialog.tsx instructions.md
git commit -m "feat(ui): ConfirmDialog modal + no-browser-dialog convention"
```

---

## Task 4: TechTreeView — branding, buttons, modal, links, interactive tooltip

**Files:**
- Modify: `src/components/tech-tree/TechTreeView.tsx`
- Modify: `src/components/tech-tree/tech-tree.css`

- [ ] **Step 1: Update imports + add modal state**

In `TechTreeView.tsx`, update the React import and add new imports:
```ts
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import "./tech-tree.css";
import type { TechTree, TechNode } from "@/lib/tech-tree/types";
import { LAYOUT, computeLayout, ancestors, pathCost } from "@/lib/tech-tree/layout";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
```

Add modal state alongside the other `useState`s (after the `hover` state line):
```ts
  const [resetOpen, setResetOpen] = useState(false);
```

- [ ] **Step 2: Replace the appbar (logo + buttons)**

Replace the `<header className="tt-appbar">…</header>` block with:
```tsx
      <header className="tt-appbar">
        <Link href="/" aria-label="SAND HELP — home"
          className="group font-display text-xl font-bold tracking-wide text-foreground transition-colors hover:text-primary focus-visible:text-primary">
          SAND
          <span aria-hidden="true" className="mx-0.5 text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground">·</span>
          HELP
        </Link>
        <span className="tt-page-title">Tech Tree</span>
        <div className="tt-toolbar">
          <span className="tt-progress">{unlocked.size} / {tree.nodes.length} unlocked</span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear selection</Button>
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>Reset progress</Button>
        </div>
      </header>
```

- [ ] **Step 3: Add the ConfirmDialog (before the closing `</div>` of `.tt-app`, after the `</aside>`)**

Insert just before the final `</div>` that closes `<div className="tt-app">`:
```tsx
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset progress?"
        description="This clears your unlocked techs back to the free starting techs."
        confirmLabel="Reset"
        destructive
        onConfirm={() => { const d = new Set(tree.defaultUnlocked); setUnlocked(d); persist(d); }}
      />
```

- [ ] **Step 4: Faction-root part link in the faction header**

Replace the faction `<div className="tt-faction" …>…</div>` block with one that renders the root part as a link when present:
```tsx
                <div className="tt-faction" style={{ ["--fac" as string]: f.accent, left: 8, top: b.top + b.height / 2 - 33, width: LAYOUT.ROOT_W }}>
                  <span className="tt-faction-glyph glyph"><Glyph icon={f.rootPart?.icon ?? null} alt={f.name} /></span>
                  <div className="tt-faction-meta">
                    <span className="tt-faction-name">{f.name}</span>
                    {f.rootPart?.href ? (
                      <Link className="tt-faction-root" href={f.rootPart.href}>{f.rootPart.name}</Link>
                    ) : (
                      <span className="tt-faction-sub">Faction line</span>
                    )}
                  </div>
                </div>
```

- [ ] **Step 5: Make the tooltip interactive + add unlock links (hover bridge)**

The tooltip must stay open while hovered so its links are clickable. Replace the hover handlers and tooltip render.

First, add a hide-timer ref and helpers next to the other hooks (after `persist`):
```ts
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = useCallback(() => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } }, []);
  const scheduleHide = useCallback(() => { cancelHide(); hideTimer.current = setTimeout(() => setHover(null), 140); }, [cancelHide]);
```

Change the node card's mouse handlers (the `onMouseEnter`/`onMouseLeave` on the `.tnode` div) to:
```tsx
                   onMouseEnter={(ev) => { cancelHide(); setHover({ slug: n.slug, rect: (ev.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                   onMouseLeave={scheduleHide}
```

Change the tooltip render line to pass the bridge handlers:
```tsx
      {hover && <Tooltip node={byId[hover.slug]} rect={hover.rect} unlocked={unlocked} nodes={tree.nodes} onEnter={cancelHide} onLeave={scheduleHide} />}
```

Replace the entire `Tooltip` function with one that accepts the handlers and renders unlock links:
```tsx
function Tooltip({ node, rect, unlocked, nodes, onEnter, onLeave }: {
  node: TechNode; rect: DOMRect; unlocked: Set<string>; nodes: TechNode[];
  onEnter: () => void; onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  useEffect(() => {
    const tr = ref.current?.getBoundingClientRect();
    const h = tr?.height ?? 0, w = tr?.width ?? 252;
    let top = rect.top - h - 10; if (top < 8) top = rect.bottom + 10;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top, left });
  }, [rect]);
  const isUnlocked = unlocked.has(node.slug);
  const reqNames = node.prereqs.length
    ? node.prereqs.map((r) => nodes.find((n) => n.slug === r)?.name ?? r).join(", ")
    : "Faction root — no prerequisite";
  return (
    <div id="tt-tip" ref={ref} className="show" style={{ top: pos.top, left: pos.left }}
         onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="tt-tip-h">
        <span className="tt-tip-name">{node.name}</span>
        <span className={"tt-tip-st" + (isUnlocked ? " ok" : "")}>{isUnlocked ? "Unlocked" : "Locked"}</span>
      </div>
      <div className="tt-tip-cost">
        {node.costs.map((c) => (
          <div key={c.name} className="tt-tip-costrow">
            <span className="tt-tip-ic"><Glyph icon={c.icon} alt={c.name} /></span>
            <b>{fmt(c.amount)}</b><span>{c.name}</span>
          </div>
        ))}
      </div>
      <div className="tt-tip-row"><span>Requires</span><b>{reqNames}</b></div>
      {node.unlocks.length > 0 && (
        <div className="tt-tip-unlocks">
          <span className="tt-tip-unlocks-h">Unlocks</span>
          <div className="tt-tip-unlocks-list">
            {node.unlocks.map((u) => (
              u.href
                ? <Link key={u.name} href={u.href} className="tt-tip-unlock-link">{u.name}</Link>
                : <span key={u.name} className="tt-tip-unlock-link is-plain">{u.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: CSS — drop old brand rules, make tooltip interactive, style root + unlock links**

In `src/components/tech-tree/tech-tree.css`:

1. Delete the now-unused brand rules: `.tt-brand`, `.tt-brand-mark`, `.tt-brand-name`, `.tt-brand-name .sub` (and the earlier-added `.tt-brand { text-decoration:none; color:inherit; }`).
2. Change `#tt-tip`'s `pointer-events: none;` to `pointer-events: auto;`.
3. Append:
```css
.tt-faction-root { font-family: var(--font-mono); font-size: 10px; color: var(--fac); text-transform: uppercase; letter-spacing: .04em; text-decoration: none; }
.tt-faction-root:hover { text-decoration: underline; }
.tt-tip-unlocks { padding: 9px 11px; }
.tt-tip-unlocks-h { display: block; font-family: var(--font-display); text-transform: uppercase; letter-spacing: .06em; font-size: 10px; color: var(--muted-foreground); margin-bottom: 5px; }
.tt-tip-unlocks-list { display: flex; flex-wrap: wrap; gap: 4px 8px; }
.tt-tip-unlock-link { font-size: 12px; color: var(--primary); text-decoration: none; }
.tt-tip-unlock-link:hover { text-decoration: underline; }
.tt-tip-unlock-link.is-plain { color: var(--muted-foreground); }
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit` (expect clean) and `npx eslint src/components/tech-tree/TechTreeView.tsx src/components/ConfirmDialog.tsx` (expect clean; keep the existing `no-img-element` disable).

- [ ] **Step 8: Commit**
```bash
git add src/components/tech-tree/TechTreeView.tsx src/components/tech-tree/tech-tree.css
git commit -m "feat(tech): site wordmark, shadcn toolbar, reset modal, faction-root + unlock links"
```

---

## Task 5: TechTreeView — hand-grab panning + URL-driven selection

**Files:**
- Modify: `src/components/tech-tree/TechTreeView.tsx`
- Modify: `src/components/tech-tree/tech-tree.css`

- [ ] **Step 1: Add a viewport ref + pan handlers**

Add a ref for the scroll viewport with the other hooks:
```ts
  const viewportRef = useRef<HTMLDivElement>(null);
```

Add the pan logic (after `toggleSelected`). It drags the viewport's scroll position; a small threshold prevents pans from swallowing clicks. Dragging never starts on the interactive status ring.
```ts
  const pan = useRef<{ x: number; y: number; left: number; top: number; active: boolean } | null>(null);
  const onPanDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".tnode-status")) return; // let the ring handle its own clicks
    const vp = viewportRef.current; if (!vp) return;
    pan.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop, active: false };
  }, []);
  const onPanMove = useCallback((e: React.PointerEvent) => {
    const p = pan.current, vp = viewportRef.current; if (!p || !vp) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.active && Math.hypot(dx, dy) < 4) return; // movement threshold → still a click
    if (!p.active) { p.active = true; vp.setPointerCapture(e.pointerId); vp.classList.add("is-panning"); }
    vp.scrollLeft = p.left - dx;
    vp.scrollTop = p.top - dy;
  }, []);
  const endPan = useCallback((e: React.PointerEvent) => {
    const vp = viewportRef.current;
    if (vp) { vp.classList.remove("is-panning"); if (vp.hasPointerCapture?.(e.pointerId)) vp.releasePointerCapture(e.pointerId); }
    pan.current = null;
  }, []);
```

Wire them onto the viewport. Change `<div className="tt-viewport">` to:
```tsx
      <div className="tt-viewport" ref={viewportRef}
           onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={endPan} onPointerLeave={endPan}>
```

- [ ] **Step 2: Read `?select=<slug>` on mount → select + scroll into view**

Add this effect after the localStorage hydration effect. It reads the param client-side (avoids a `useSearchParams` Suspense boundary) and centers the node.
```ts
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("select");
    if (!slug || !byId[slug]) return;
    setSelected(new Set([slug]));
    const vp = viewportRef.current, pos = posById[slug];
    if (vp && pos) {
      vp.scrollTo({
        left: Math.max(0, pos.x + LAYOUT.CARD_W / 2 - vp.clientWidth / 2),
        top: Math.max(0, pos.y + LAYOUT.CARD_H / 2 - vp.clientHeight / 2),
        behavior: "smooth",
      });
    }
  }, [byId, posById]);
```

(The `setSelected` in this mount effect is the same client-only pattern as the hydration effect; wrap its body in `/* eslint-disable react-hooks/set-state-in-effect */ … /* eslint-enable */` if eslint flags it.)

- [ ] **Step 3: CSS — grab cursors**

Append to `tech-tree.css`:
```css
.tt-viewport { cursor: grab; }
.tt-viewport.is-panning { cursor: grabbing; user-select: none; }
.tt-viewport .tnode, .tt-viewport .tt-faction-root, .tt-viewport a { cursor: pointer; }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` (clean) and `npm run build` (succeeds; `/tech` compiles).

- [ ] **Step 5: Commit**
```bash
git add src/components/tech-tree/TechTreeView.tsx src/components/tech-tree/tech-tree.css
git commit -m "feat(tech): hand-grab panning + ?select deep-link selection/scroll"
```

---

## Task 6: "Show in tech tree" button on entity detail pages

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`
- Modify: `src/app/tramplers/[slug]/page.tsx`

Both pages render `<EntityDetail … badges={…} />`. Add the jump button into the `badges` slot when a tech node unlocks the entity. The button is a styled `<Link>` (`buttonVariants`), no client component needed.

- [ ] **Step 1: Trampler-part page**

In `src/app/tramplers/[slug]/page.tsx`, add imports:
```ts
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getUnlockingNode } from "@/lib/queries";
```
(Adjust the existing `getTramplerPartBySlug` import line to also pull `getUnlockingNode` if they share the import from `@/lib/queries`.)

After `const part = await getTramplerPartBySlug(slug); if (!part) notFound();`, add:
```ts
  const techNode = await getUnlockingNode(slug);
```

Change the `badges` prop on `<EntityDetail>` from `badges={<CategoryTag slug={part.category} />}` to:
```tsx
      badges={
        <>
          <CategoryTag slug={part.category} />
          {techNode && (
            <Link href={`/tech?select=${techNode.slug}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Show in tech tree
            </Link>
          )}
        </>
      }
```

- [ ] **Step 2: Item page**

In `src/app/items/[slug]/page.tsx`, add the same imports (`Link`, `buttonVariants`, and `getUnlockingNode` — extend the existing `@/lib/queries` import).

After `const item = await getItemBySlug(slug); if (!item) notFound();`, add:
```ts
  const techNode = await getUnlockingNode(slug);
```

Find the `<EntityDetail>`'s `badges` prop. It currently includes a `CategoryTag` and `RarityBadge` (look at the JSX). Wrap the existing badge contents in a fragment and append the same conditional button:
```tsx
          {techNode && (
            <Link href={`/tech?select=${techNode.slug}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Show in tech tree
            </Link>
          )}
```
(Keep the existing `CategoryTag`/`RarityBadge` exactly; just add the button inside the same `badges={<>…</>}` fragment.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (clean), then `npm run build` (succeeds). Optionally start the dev server and confirm: a part unlocked by a node (e.g. `/tramplers/s-h-cargo-deck-framed`) shows the "Show in tech tree" button; clicking it lands on `/tech?select=tech-kaiser-t1a-cargo-deck` with that node selected and scrolled into view.

- [ ] **Step 4: Commit**
```bash
git add src/app/items/[slug]/page.tsx src/app/tramplers/[slug]/page.tsx
git commit -m "feat(tech): 'Show in tech tree' jump button on item + trampler pages"
```

---

## Manual verification (use the `run` skill after Task 6)

Start the dev server and confirm on `/tech`:
- Logo reads **SAND·HELP** (dot in primary), matching the site header, and links home.
- "Clear selection" / "Reset progress" are shadcn buttons; **Reset opens the styled modal** (no browser dialog); confirming resets to the free techs.
- **Drag on empty canvas pans** with a grab→grabbing cursor; a click (no drag) still selects a node; the status ring still toggles unlocked.
- Each **faction header shows its starting part** as a link (Godlewski → Small Chassis, etc.) that opens the part page.
- Hovering a node shows the tooltip; **moving onto the tooltip keeps it open and unlock names are clickable links** to item/part pages.
- From a part/item page unlocked by a node, **"Show in tech tree"** jumps to `/tech?select=…`, selecting + scrolling to the node.

## Self-review notes

- **Spec coverage:** logo (T4) ✓; toolbar buttons (T4) ✓; ConfirmDialog + instructions rule (T3) ✓; panning (T5) ✓; faction-root visible+linked (T1 data, T4 UI) ✓; jump links both ways — tree→entity (T1 href + T4 tooltip links + faction-root link) ✓, entity→tree (T2 getUnlockingNode + T5 ?select + T6 button) ✓.
- **Type consistency:** `TechEntityRef`/`TechUnlock.href`/`TechFaction.rootPart`/`RawTechLinkTarget.kind` defined in T1 and consumed consistently in T2 (query select adds `kind`), T4 (`f.rootPart`, `u.href`).
- **No new browser dialogs** introduced; the only `confirm()` is removed in T4.
- Pan threshold (4px) preserves click-to-select and the status-ring toggle (ring excluded in `onPanDown`).
