# Last-Edited-By Contributor Credit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Steam-linked "Last edited by &lt;persona name&gt;" credit in the sidebar of every entity detail page (items, environment, trampler parts), derived from the most recent applied proposal.

**Architecture:** No schema change. A read-time query (`getLastEditor`) finds the latest `status:"applied"` proposal whose `targetType`+`targetSlug` match the entity, joined to its proposer `SteamUser`. `EntityDetail` gains a `lastEditedBy` prop rendering a muted credit block at the bottom of the sidebar; the three page routes call the query and pass the prop. Pure display helpers live in a new `src/lib/steam.ts`.

**Tech Stack:** Next.js (App Router, RSC), Prisma 6, TypeScript, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-14-last-edited-by-credit-design.md`

---

## File Structure

- `src/lib/steam.ts` *(new)* — pure helpers `steamProfileUrl`, `editorDisplayName`. No deps; trivially testable.
- `src/lib/steam.test.ts` *(new)* — Vitest unit tests for the two helpers.
- `src/lib/queries.ts` *(modify)* — add async `getLastEditor`.
- `src/components/EntityDetail.tsx` *(modify)* — add `lastEditedBy` prop, sidebar-visibility tweak, credit block.
- `src/app/items/[slug]/page.tsx` *(modify)* — call `getLastEditor("item", slug)`, pass prop.
- `src/app/environment/[slug]/page.tsx` *(modify)* — call `getLastEditor("envEntity", slug)`, pass prop.
- `src/app/tramplers/[slug]/page.tsx` *(modify)* — call `getLastEditor("tramplerPart", slug)`, pass prop.

Conventions confirmed in-repo: tests use `import { describe, it, expect } from "vitest"`; run with `npx vitest run <path>`. Pages are async RSC; `SteamUser.personaName` is `String?` (nullable); existing code links profiles via `https://steamcommunity.com/profiles/<steamId>` and falls back `personaName ?? proposerId`.

---

## Task 1: Pure Steam display helpers

**Files:**
- Create: `src/lib/steam.ts`
- Test: `src/lib/steam.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/steam.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { steamProfileUrl, editorDisplayName } from "./steam";

describe("steamProfileUrl", () => {
  it("builds the community profiles URL from a steamId", () => {
    expect(steamProfileUrl("76561198000000000")).toBe(
      "https://steamcommunity.com/profiles/76561198000000000",
    );
  });
});

describe("editorDisplayName", () => {
  it("returns the persona name when present", () => {
    expect(editorDisplayName("Neo")).toBe("Neo");
  });

  it("trims surrounding whitespace", () => {
    expect(editorDisplayName("  Neo  ")).toBe("Neo");
  });

  it("falls back when the name is null or blank", () => {
    expect(editorDisplayName(null)).toBe("Anonymous contributor");
    expect(editorDisplayName("   ")).toBe("Anonymous contributor");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: FAIL — cannot resolve module `./steam` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/steam.ts`:

```ts
/** Public Steam community profile URL for a 17-digit steamId. */
export function steamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}

/** Display name for a contributor credit. SteamUser.personaName is nullable,
 *  so fall back to a neutral label; the profile link still resolves via steamId. */
export function editorDisplayName(personaName: string | null): string {
  return personaName?.trim() || "Anonymous contributor";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/steam.ts src/lib/steam.test.ts
git commit -m "feat(wiki): add steam profile URL + editor display-name helpers"
```

---

## Task 2: `getLastEditor` query

**Files:**
- Modify: `src/lib/queries.ts` (append a new exported function)

No unit test: this is a thin Prisma wrapper over a live DB, consistent with the rest of `queries.ts` (other `getXBySlug` functions are untested). Its display output is covered by Task 1's helper tests. Verification is by type-check/build in Task 5.

- [ ] **Step 1: Add the function**

Append to `src/lib/queries.ts` (the file already imports `prisma` from `./db`):

```ts
/** The most recent contributor whose proposal was applied to this entity, or null
 *  if it has never been edited. Scoped by targetType+targetSlug so recipe-targeted
 *  proposals (and any slug collision with them) are excluded. Covers edit,
 *  links_edit, and loot_sources_edit kinds — all of which carry the entity's slug. */
export async function getLastEditor(
  targetType: "item" | "envEntity" | "tramplerPart",
  slug: string,
): Promise<{ steamId: string; personaName: string | null } | null> {
  const p = await prisma.proposal.findFirst({
    where: { targetType, targetSlug: slug, status: "applied" },
    orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
    select: { proposer: { select: { steamId: true, personaName: true } } },
  });
  return p?.proposer ?? null;
}
```

- [ ] **Step 2: Type-check the new function**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). If `tsc` is not configured standalone, defer verification to the build in Task 5; note this and continue.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(wiki): getLastEditor — latest applied-proposal contributor per entity"
```

---

## Task 3: `EntityDetail` `lastEditedBy` prop + sidebar credit block

**Files:**
- Modify: `src/components/EntityDetail.tsx`

Reference (current behavior to preserve): the sidebar appears only when `detailRows` are present (`const hasSidebar = !!detailRows && detailRows.length > 0;`), rendering `<ItemDetailsPanel rows={detailRows!} />` in a `lg:grid-cols-[1fr_300px]` grid. The `source` link renders at the article bottom.

- [ ] **Step 1: Add the import and prop type**

At the top of `src/components/EntityDetail.tsx`, add to the existing imports:

```ts
import { steamProfileUrl } from "@/lib/steam";
```

In `interface EntityDetailProps`, add after `sourceUrl?: string | null;`:

```ts
  /** Most recent contributor credit, shown at the bottom of the sidebar. */
  lastEditedBy?: { steamId: string; name: string } | null;
```

- [ ] **Step 2: Destructure the new prop**

In the `EntityDetail({ ... })` parameter destructuring, add `lastEditedBy,` alongside `sourceUrl,`.

- [ ] **Step 3: Update sidebar visibility and build the credit block**

Replace this line:

```ts
  const hasSidebar = !!detailRows && detailRows.length > 0;
```

with:

```ts
  const hasDetails = !!detailRows && detailRows.length > 0;
  const hasSidebar = hasDetails || !!lastEditedBy;

  const editorCredit = lastEditedBy ? (
    <div className={hasDetails ? "mt-5" : undefined}>
      <h2 className="mb-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Last edited by
      </h2>
      <a
        href={steamProfileUrl(lastEditedBy.steamId)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[13px] font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
      >
        {lastEditedBy.name}
      </a>
    </div>
  ) : null;
```

- [ ] **Step 4: Render the credit in the sidebar branch**

In the `hasSidebar ?` branch of the return, replace:

```tsx
          <ItemDetailsPanel rows={detailRows!} />
```

with:

```tsx
          <aside>
            {hasDetails && <ItemDetailsPanel rows={detailRows!} />}
            {editorCredit}
          </aside>
```

(The `ItemDetailsPanel` already renders its own `<aside>`; nesting is acceptable, but to keep markup clean you may instead leave `ItemDetailsPanel` as-is and wrap only when both are present. The above is the canonical form — a single sidebar `<aside>` containing the Details panel and/or the credit.)

- [ ] **Step 5: Type-check / build the component**

Run: `npx tsc --noEmit`
Expected: PASS. (Full visual check happens in Task 5 build + manual run.)

- [ ] **Step 6: Commit**

```bash
git add src/components/EntityDetail.tsx
git commit -m "feat(wiki): EntityDetail lastEditedBy sidebar credit"
```

---

## Task 4: Wire the three entity page routes

**Files:**
- Modify: `src/app/items/[slug]/page.tsx`
- Modify: `src/app/environment/[slug]/page.tsx`
- Modify: `src/app/tramplers/[slug]/page.tsx`

Each page is an async RSC that already awaits queries and renders `<EntityDetail .../>`. For each, import the query + helper, fetch the editor, and pass the prop.

- [ ] **Step 1: Items page**

In `src/app/items/[slug]/page.tsx`:

1. Add to the `@/lib/queries` import the name `getLastEditor` (it currently imports `getItemBySlug, getCratesContaining, getAmmoByCaliber, getWeaponsByCaliber`).
2. Add a new import: `import { editorDisplayName } from "@/lib/steam";`
3. After `const canSuggest = !!(await getSession());`, add:

```ts
  const editor = await getLastEditor("item", item.slug);
```

4. In the `<EntityDetail ... />` props, add after `detailRows={detailRows}`:

```tsx
      lastEditedBy={editor ? { steamId: editor.steamId, name: editorDisplayName(editor.personaName) } : null}
```

- [ ] **Step 2: Environment page**

In `src/app/environment/[slug]/page.tsx`:

1. Change the `@/lib/queries` import from `import { getEnvEntityBySlug } from "@/lib/queries";` to `import { getEnvEntityBySlug, getLastEditor } from "@/lib/queries";`.
2. Add: `import { editorDisplayName } from "@/lib/steam";`
3. After `const canSuggest = !!(await getSession());`, add:

```ts
  const editor = await getLastEditor("envEntity", slug);
```

4. In the `<EntityDetail ... />` props, add after `description={entity.description}`:

```tsx
      lastEditedBy={editor ? { steamId: editor.steamId, name: editorDisplayName(editor.personaName) } : null}
```

- [ ] **Step 3: Tramplers page**

In `src/app/tramplers/[slug]/page.tsx`:

1. Change the `@/lib/queries` import from `import { getTramplerPartBySlug } from "@/lib/queries";` to `import { getTramplerPartBySlug, getLastEditor } from "@/lib/queries";`.
2. Add: `import { editorDisplayName } from "@/lib/steam";`
3. After `const canSuggest = !!(await getSession());`, add:

```ts
  const editor = await getLastEditor("tramplerPart", slug);
```

4. In the `<EntityDetail ... />` props, add after `detailRows={tramplerDetailRows(stats)}`:

```tsx
      lastEditedBy={editor ? { steamId: editor.steamId, name: editorDisplayName(editor.personaName) } : null}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/items/[slug]/page.tsx src/app/environment/[slug]/page.tsx src/app/tramplers/[slug]/page.tsx
git commit -m "feat(wiki): show last-edited-by credit on item/env/trampler pages"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 2: Run the full test suite (no regressions)**

Run: `npm test`
Expected: PASS (existing suite unaffected; `--passWithNoTests` is set).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds; the three entity routes compile.

- [ ] **Step 5: Manual smoke check (requires dev DB)**

Run: `npm run dev`, then open an entity that has an applied proposal (e.g. one previously edited via the contribute flow). Confirm the sidebar shows "Last edited by &lt;name&gt;" linking to `steamcommunity.com/profiles/<steamId>` in a new tab. Open an unedited entity and confirm no credit appears (and an environment entity with no detailRows stays single-column when uncredited).

If no applied proposals exist in the dev DB, this step is informational — the logic is covered by the `getLastEditor` filter and Task 1 tests; note that no live data was available and continue.

- [ ] **Step 6: Final commit (if any lint/build fixups were needed)**

```bash
git add -A
git commit -m "chore(wiki): verification fixups for last-edited-by credit"
```

(Skip if Steps 1–4 required no changes.)

---

## Self-Review Notes

- **Spec coverage:** read-time query (Task 2) ✓; pure helpers + tests (Task 1) ✓; `EntityDetail` sidebar credit + environment single-row handling (Task 3) ✓; all three routes wired (Task 4) ✓; no schema/apply-path changes ✓; error/null handling via `editor ? ... : null` and `getLastEditor` returning null ✓.
- **No placeholders:** every code step shows full code; commands have expected output.
- **Type consistency:** `getLastEditor` returns `{ steamId, personaName } | null`; pages map to `{ steamId, name }` via `editorDisplayName`; `EntityDetail.lastEditedBy` is `{ steamId, name } | null`. Names align across tasks.
