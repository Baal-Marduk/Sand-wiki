# Foundation Part 2 — Tips Feature, Write-Flow Removal & DB Teardown Implementation Plan

> **EXECUTION STATUS (2026-06-18): partially executed in REDUCED scope.**
> Per user decision, only the non-destructive cleanup was done:
> - ✅ Removed Directus (Task 7's Directus parts).
> - ✅ Removed proposal/contribute write flows + suggest/edit UI (most of Task 6).
> - ✅ (Beyond this plan) migrated `api/search-index` to `@sandlabs/data`.
> - ⏸ **Tips feature (Tasks 1 tips-models, 2, 3, 4, 5) — NOT done.** Deferred as a future feature.
> - ⏸ **DB teardown (Task 1 drops, Task 8) — NOT done.** The connected DB is production; no
>   migration was run, no models/tables/data dropped. `schema.prisma` is unchanged.
> - ⏸ **Admin entity image/disable controls — KEPT dormant** (not deleted as Task 6 specified).
> This plan is retained as the blueprint for when tips + teardown are taken up later.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entity-correction/proposal system with a community **tips** feature (post + vote + admin moderation), delete the proposal/contribute/admin-entity write flows and Directus, then drop the now-unused entity Prisma tables — dev first, prod last.

**Architecture:** A `Tip`/`TipVote` pair is added to Postgres (which now holds only `SteamUser` + tips). A tips tab on each entity detail page reads tips by `targetSlug` (a plain string referencing the static data). Admins moderate via `/admin/tips`. All Prisma entity models and the proposal machinery are removed; a final forward migration drops the tables.

**Tech Stack:** Next.js 16 (Server Components + Server Actions), Prisma 6, React 19, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-06-18-monorepo-static-foundation-design.md`
**Branch:** `feat/monorepo-static-foundation`
**Prerequisite:** Plan 1 complete (wiki renders from `@sandlabs/data`; tables still present).

---

## File Structure (created/modified by this plan)

```
apps/wiki/
  prisma/schema.prisma                 # MODIFY — drop entity models + Proposal; add Tip/TipVote
  prisma/migrations/<ts>_tips_and_drop_entities/  # CREATE (generated)
  src/lib/tips.ts                       # CREATE — tip queries + server actions
  src/lib/tips.test.ts                  # CREATE
  src/components/TipsTab.tsx            # CREATE — server: list approved tips
  src/components/TipForm.tsx            # CREATE — client: post-a-tip form
  src/components/TipVoteButton.tsx      # CREATE — client: upvote control
  src/app/admin/tips/page.tsx          # CREATE — moderation list
  src/app/admin/tips/actions.ts        # CREATE — approve/reject actions
  src/app/items/[slug]/page.tsx        # MODIFY — add Tips tab
  src/app/environment/[slug]/page.tsx  # MODIFY — add Tips tab
  src/app/tramplers/[slug]/page.tsx    # MODIFY — add Tips tab
  package.json                          # MODIFY — remove directus + entity-load scripts
DELETED:
  apps/wiki/src/app/admin/proposals/   apps/wiki/src/app/admin/entities/
  apps/wiki/src/app/contribute/        apps/wiki/src/lib/proposal-apply.ts
  apps/wiki/src/lib/proposal-entity.ts apps/wiki/src/components/SuggestCorrectionLink.tsx
  apps/wiki/src/components/EditTabsLink.tsx
  apps/wiki/directus/  docker-compose.yml  docker-compose.override.yml
  apps/wiki/prisma/{seed.ts,load-*.ts,sync-directus-icons.mjs,setup-directus-moderator.mjs,...}
```

---

## Task 1: Schema — add tips, drop entity models, generate the teardown migration

**Files:**
- Modify: `apps/wiki/prisma/schema.prisma`

Do the schema edit and migration generation as ONE step so a single migration captures both the additions and the drops.

- [ ] **Step 1: Edit `schema.prisma` — delete the entity models**

Remove these model blocks entirely: `Entity`, `ItemStats`, `TramplerStats`, `TechNodeStats`, `EntityLink`, `Recipe`, `RecipeInput`, `RecipeOutput`, and `Proposal`. Keep `generator`, `datasource`, and `SteamUser`.

- [ ] **Step 2: Edit `SteamUser` — swap relations**

Replace the `proposals Proposal[]` line with the tips back-relations:

```prisma
model SteamUser {
  steamId     String    @id
  personaName String?
  avatar      String?
  createdAt   DateTime  @default(now())
  lastSeenAt  DateTime  @default(now())
  tips        Tip[]
  tipVotes    TipVote[]
}
```

- [ ] **Step 3: Add the `Tip` and `TipVote` models**

```prisma
model Tip {
  id           String    @id @default(dbgenerated("(gen_random_uuid())::text"))
  targetSlug   String    // entity slug in the static data this tip is about (no FK)
  body         String
  status       String    @default("pending") // "pending" | "approved" | "rejected"
  authorId     String
  author       SteamUser @relation(fields: [authorId], references: [steamId])
  createdAt    DateTime  @default(now())
  reviewedById String?
  reviewedAt   DateTime?
  votes        TipVote[]

  @@index([targetSlug, status])
  @@index([authorId])
}

model TipVote {
  id        String    @id @default(dbgenerated("(gen_random_uuid())::text"))
  tipId     String
  tip       Tip       @relation(fields: [tipId], references: [id], onDelete: Cascade)
  voterId   String
  voter     SteamUser @relation(fields: [voterId], references: [steamId])
  createdAt DateTime  @default(now())

  @@unique([tipId, voterId])
  @@index([tipId])
}
```

- [ ] **Step 4: Generate the migration against the DEV DB**

Run (from `apps/wiki`): `npx prisma migrate dev --name tips_and_drop_entities`
Expected: Prisma creates a migration that `CREATE TABLE`s Tip/TipVote and `DROP TABLE`s the eight entity tables + Proposal, applies it to dev, and regenerates the client.

> This is the destructive step — it runs on **dev only** here. Confirm `DATABASE_URL` points at the dev Neon DB before running. The static JSON (Plan 1) already captured all entity data, so the drop loses nothing recoverable.

- [ ] **Step 5: Inspect the generated SQL**

Read `apps/wiki/prisma/migrations/<timestamp>_tips_and_drop_entities/migration.sql`.
Verify it: creates `Tip` + `TipVote` with the unique index; drops `Entity`, `ItemStats`, `TramplerStats`, `TechNodeStats`, `EntityLink`, `Recipe`, `RecipeInput`, `RecipeOutput`, `Proposal`. If it tries to drop `SteamUser`, STOP — the relation edit was wrong.

- [ ] **Step 6: Commit**

```bash
git add apps/wiki/prisma/schema.prisma apps/wiki/prisma/migrations
git commit -m "feat(db): add Tip/TipVote, drop entity models (dev migration)"
```

---

## Task 2: Tips data access + server actions

**Files:**
- Create: `apps/wiki/src/lib/tips.ts`
- Test: `apps/wiki/src/lib/tips.test.ts`

- [ ] **Step 1: Write the failing test for vote-count + status logic**

`apps/wiki/src/lib/tips.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sortByVotes, type TipWithVotes } from "./tips";

const mk = (id: string, votes: number, createdAt: string): TipWithVotes => ({
  id, targetSlug: "x", body: id, status: "approved", authorId: "a",
  authorName: null, createdAt: new Date(createdAt), voteCount: votes, votedByMe: false,
});

describe("sortByVotes", () => {
  it("orders by vote count desc, then newest first", () => {
    const out = sortByVotes([
      mk("a", 1, "2026-01-01"),
      mk("b", 5, "2026-01-01"),
      mk("c", 5, "2026-02-01"),
    ]);
    expect(out.map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --workspace=apps/wiki -- tips`
Expected: FAIL — `./tips` exports missing.

- [ ] **Step 3: Implement `apps/wiki/src/lib/tips.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser, requireAdmin, getSession, isAdmin } from "./auth";
import { isEntityEnabled } from "@sandlabs/data";

export interface TipWithVotes {
  id: string;
  targetSlug: string;
  body: string;
  status: string;
  authorId: string;
  authorName: string | null;
  createdAt: Date;
  voteCount: number;
  votedByMe: boolean;
}

/** Pure sort: vote count desc, newest first as tiebreaker. Exported for testing. */
export function sortByVotes(tips: TipWithVotes[]): TipWithVotes[] {
  return [...tips].sort(
    (a, b) => b.voteCount - a.voteCount || b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

/** Approved tips for one entity, vote-sorted, with the current user's vote state. */
export async function getApprovedTips(targetSlug: string): Promise<TipWithVotes[]> {
  const session = await getSession();
  const rows = await prisma.tip.findMany({
    where: { targetSlug, status: "approved" },
    include: { author: { select: { personaName: true } }, votes: { select: { voterId: true } } },
  });
  const tips = rows.map((t) => ({
    id: t.id, targetSlug: t.targetSlug, body: t.body, status: t.status,
    authorId: t.authorId, authorName: t.author.personaName, createdAt: t.createdAt,
    voteCount: t.votes.length,
    votedByMe: !!session && t.votes.some((v) => v.voterId === session.steamId),
  }));
  return sortByVotes(tips);
}

/** Submit a tip (pending moderation). Validates the slug against the static data. */
export async function submitTip(formData: FormData): Promise<void> {
  const session = await requireUser();
  const targetSlug = String(formData.get("targetSlug") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!isEntityEnabled(targetSlug)) throw new Error("Unknown entity.");
  if (body.length < 3 || body.length > 2000) throw new Error("Tip must be 3–2000 characters.");
  await prisma.tip.create({ data: { targetSlug, body, authorId: session.steamId } });
  revalidatePath(`/items/${targetSlug}`);
  revalidatePath(`/environment/${targetSlug}`);
  revalidatePath(`/tramplers/${targetSlug}`);
}

/** Toggle the current user's upvote on a tip. */
export async function toggleVote(formData: FormData): Promise<void> {
  const session = await requireUser();
  const tipId = String(formData.get("tipId") ?? "");
  const targetSlug = String(formData.get("targetSlug") ?? "");
  const existing = await prisma.tipVote.findUnique({
    where: { tipId_voterId: { tipId, voterId: session.steamId } },
  });
  if (existing) await prisma.tipVote.delete({ where: { id: existing.id } });
  else await prisma.tipVote.create({ data: { tipId, voterId: session.steamId } });
  revalidatePath(`/items/${targetSlug}`);
  revalidatePath(`/environment/${targetSlug}`);
  revalidatePath(`/tramplers/${targetSlug}`);
}

/** Pending tips for the moderation queue (admin only). */
export async function getPendingTips(): Promise<TipWithVotes[]> {
  await requireAdmin();
  const rows = await prisma.tip.findMany({
    where: { status: "pending" },
    include: { author: { select: { personaName: true } }, votes: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((t) => ({
    id: t.id, targetSlug: t.targetSlug, body: t.body, status: t.status,
    authorId: t.authorId, authorName: t.author.personaName, createdAt: t.createdAt,
    voteCount: t.votes.length, votedByMe: false,
  }));
}
```

> `getSession`, `requireUser`, `requireAdmin`, `isAdmin` already exist in `src/lib/auth.ts`. The `tipId_voterId` compound-unique selector matches the `@@unique([tipId, voterId])` in the schema.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/wiki -- tips`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/lib/tips.ts apps/wiki/src/lib/tips.test.ts
git commit -m "feat(tips): tip queries, submit/vote/moderation server actions"
```

---

## Task 3: Tips UI components

**Files:**
- Create: `apps/wiki/src/components/TipVoteButton.tsx`
- Create: `apps/wiki/src/components/TipForm.tsx`
- Create: `apps/wiki/src/components/TipsTab.tsx`

- [ ] **Step 1: Create the vote button (client)**

`apps/wiki/src/components/TipVoteButton.tsx`:

```tsx
"use client";

import { toggleVote } from "@/lib/tips";

export function TipVoteButton({
  tipId, targetSlug, voteCount, votedByMe, canVote,
}: {
  tipId: string; targetSlug: string; voteCount: number; votedByMe: boolean; canVote: boolean;
}) {
  if (!canVote) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
        ▲ {voteCount}
      </span>
    );
  }
  return (
    <form action={toggleVote}>
      <input type="hidden" name="tipId" value={tipId} />
      <input type="hidden" name="targetSlug" value={targetSlug} />
      <button
        type="submit"
        aria-pressed={votedByMe}
        className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[13px] transition-colors ${
          votedByMe
            ? "border-primary text-primary"
            : "border-border-strong text-muted-foreground hover:text-foreground"
        }`}
      >
        ▲ {voteCount}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create the post-a-tip form (client)**

`apps/wiki/src/components/TipForm.tsx`:

```tsx
"use client";

import { submitTip } from "@/lib/tips";

export function TipForm({ targetSlug }: { targetSlug: string }) {
  return (
    <form action={submitTip} className="space-y-2">
      <input type="hidden" name="targetSlug" value={targetSlug} />
      <textarea
        name="body"
        required
        minLength={3}
        maxLength={2000}
        rows={3}
        placeholder="Share a tip about this entity…"
        className="w-full border border-border-strong bg-card-elevated p-2 text-sm"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          className="border border-primary px-3 py-1 font-display text-[12px] font-semibold uppercase tracking-[0.06em] text-primary hover:bg-primary/10"
        >
          Submit tip
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">Tips are reviewed by a moderator before appearing.</p>
    </form>
  );
}
```

- [ ] **Step 3: Create the tips tab (server)**

`apps/wiki/src/components/TipsTab.tsx`:

```tsx
import { getApprovedTips } from "@/lib/tips";
import { getSession } from "@/lib/auth";
import { steamProfileUrl } from "@/lib/steam";
import { TipForm } from "@/components/TipForm";
import { TipVoteButton } from "@/components/TipVoteButton";

/** Renders the tips list + (for logged-in users) the post form. Used as a detail-page tab. */
export async function TipsTab({ targetSlug }: { targetSlug: string }) {
  const [tips, session] = await Promise.all([getApprovedTips(targetSlug), getSession()]);
  const loggedIn = !!session;
  return (
    <div className="space-y-4">
      {tips.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tips yet.</p>
      ) : (
        <ul className="space-y-3">
          {tips.map((t) => (
            <li key={t.id} className="flex items-start gap-3 border-b border-border pb-3">
              <TipVoteButton
                tipId={t.id}
                targetSlug={targetSlug}
                voteCount={t.voteCount}
                votedByMe={t.votedByMe}
                canVote={loggedIn}
              />
              <div className="min-w-0">
                <p className="whitespace-pre-wrap text-sm">{t.body}</p>
                {t.authorName && (
                  <a
                    href={steamProfileUrl(t.authorId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-muted-foreground underline underline-offset-2"
                  >
                    {t.authorName}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {loggedIn ? (
        <TipForm targetSlug={targetSlug} />
      ) : (
        <p className="text-sm text-muted-foreground">
          <a href="/api/auth/steam/login" className="text-primary underline underline-offset-2">Sign in with Steam</a> to post a tip.
        </p>
      )}
    </div>
  );
}
```

> `steamProfileUrl` and the Steam login route already exist (used by `EntityDetail`'s editor credit and `auth.ts`). Confirm the login path matches `requireUser`'s redirect target (`/api/auth/steam/login`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit`
Expected: the three new components compile. (Detail pages don't use them yet.)

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/components/TipsTab.tsx apps/wiki/src/components/TipForm.tsx apps/wiki/src/components/TipVoteButton.tsx
git commit -m "feat(tips): tips tab, post form, vote button components"
```

---

## Task 4: Add the Tips tab to each detail page

**Files:**
- Modify: `apps/wiki/src/app/items/[slug]/page.tsx`
- Modify: `apps/wiki/src/app/environment/[slug]/page.tsx`
- Modify: `apps/wiki/src/app/tramplers/[slug]/page.tsx`

Each page builds a `tabs: Tab[]` array passed to `EntityDetail`. Append a Tips tab.

- [ ] **Step 1: Read each page to locate its `tabs` array**

Run: `grep -n "tabs" apps/wiki/src/app/items/[slug]/page.tsx apps/wiki/src/app/environment/[slug]/page.tsx apps/wiki/src/app/tramplers/[slug]/page.tsx`
Note where each constructs the `tabs` array and what slug variable it has in scope.

- [ ] **Step 2: For each page, import the tab and append it**

Add the import:

```tsx
import { TipsTab } from "@/components/TipsTab";
```

Append to the `tabs` array (after the existing tabs), using the page's slug variable (e.g. `slug` / `item.slug`):

```tsx
{ id: "tips", label: "Tips", content: <TipsTab targetSlug={slug} /> },
```

> The Tips tab is always present (unlike data tabs that appear conditionally). Place it last so the default-selected tab stays the primary data tab.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit && npm run build --workspace=apps/wiki`
Expected: clean (modulo admin/contribute files still pending deletion in Task 6).

- [ ] **Step 4: Manually verify the tab works**

Run: `npm run dev --workspace=apps/wiki`. On an item page: the Tips tab shows; signed out shows the sign-in prompt; signed in shows the form; submitting creates a pending tip (won't show until approved). Approve via `/admin/tips` (Task 5) and confirm it appears and votes toggle.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/app/items apps/wiki/src/app/environment apps/wiki/src/app/tramplers
git commit -m "feat(tips): surface Tips tab on item/env/trampler pages"
```

---

## Task 5: Admin moderation page

**Files:**
- Create: `apps/wiki/src/app/admin/tips/actions.ts`
- Create: `apps/wiki/src/app/admin/tips/page.tsx`

- [ ] **Step 1: Create the moderation actions**

`apps/wiki/src/app/admin/tips/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function approveTip(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.tip.update({
    where: { id },
    data: { status: "approved", reviewedById: session.steamId, reviewedAt: new Date() },
  });
  redirect("/admin/tips");
}

export async function rejectTip(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.tip.update({
    where: { id },
    data: { status: "rejected", reviewedById: session.steamId, reviewedAt: new Date() },
  });
  redirect("/admin/tips");
}
```

- [ ] **Step 2: Create the moderation page**

`apps/wiki/src/app/admin/tips/page.tsx`:

```tsx
import { getPendingTips } from "@/lib/tips";
import { getEntity } from "@sandlabs/data";
import { approveTip, rejectTip } from "./actions";

// requireAdmin() inside getPendingTips redirects non-admins.
export default async function AdminTipsPage() {
  const tips = await getPendingTips();
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <h1 className="font-display text-2xl font-bold uppercase">Pending Tips</h1>
      {tips.length === 0 && <p className="text-sm text-muted-foreground">Nothing to review.</p>}
      <ul className="space-y-3">
        {tips.map((t) => {
          const entity = getEntity(t.targetSlug);
          return (
            <li key={t.id} className="space-y-2 border border-border-strong p-3">
              <div className="text-[12px] text-muted-foreground">
                on <span className="text-foreground">{entity?.name ?? t.targetSlug}</span>
                {t.authorName ? ` · by ${t.authorName}` : ""}
              </div>
              <p className="whitespace-pre-wrap text-sm">{t.body}</p>
              <div className="flex gap-2">
                <form action={approveTip}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="border border-primary px-3 py-1 text-[12px] uppercase text-primary hover:bg-primary/10">Approve</button>
                </form>
                <form action={rejectTip}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="border border-border-strong px-3 py-1 text-[12px] uppercase text-muted-foreground hover:text-foreground">Reject</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit`
Expected: the admin tips page compiles.

- [ ] **Step 4: Commit**

```bash
git add apps/wiki/src/app/admin/tips
git commit -m "feat(tips): admin moderation page for pending tips"
```

---

## Task 6: Delete the proposal / contribute / admin-entity write flows

**Files (delete):**
- `apps/wiki/src/app/admin/proposals/` (whole dir)
- `apps/wiki/src/app/admin/entities/` (whole dir)
- `apps/wiki/src/app/contribute/` (whole dir)
- `apps/wiki/src/lib/proposal-apply.ts`, `apps/wiki/src/lib/proposal-entity.ts`
- `apps/wiki/src/components/SuggestCorrectionLink.tsx`, `apps/wiki/src/components/EditTabsLink.tsx`
- any `proposal-schema.ts` / proposal-only helpers with no other importers

- [ ] **Step 1: Inventory importers before deleting**

Run: `grep -rn "proposal\|SuggestCorrection\|EditTabsLink\|contribute" apps/wiki/src --include=*.ts --include=*.tsx -l`
List every file that references the doomed modules. The only references outside the doomed dirs should be in `EntityDetail.tsx` (imports `SuggestCorrectionLink`/`EditTabsLink`) and nav links to `/contribute`.

- [ ] **Step 2: Delete the directories and files**

```bash
git rm -r apps/wiki/src/app/admin/proposals apps/wiki/src/app/admin/entities apps/wiki/src/app/contribute
git rm apps/wiki/src/lib/proposal-apply.ts apps/wiki/src/lib/proposal-entity.ts
git rm apps/wiki/src/components/SuggestCorrectionLink.tsx apps/wiki/src/components/EditTabsLink.tsx
```

- [ ] **Step 3: Remove the correction/edit controls from `EntityDetail.tsx`**

In `apps/wiki/src/components/EntityDetail.tsx`:
- Delete the imports of `SuggestCorrectionLink` and `EditTabsLink`.
- Delete the `canSuggest` block (the `<div className="flex gap-2">…</div>` rendering those two links) and the now-unused `canSuggest`/`suggest` props from `EntityDetailProps` and the destructure.
- Delete the `lastEditedBy`/`editorCredit` block and the `lastEditedBy` prop (last-editor credit dies with corrections; `getLastEditor` already returns null from Plan 1).

> After this, `EntityDetail` no longer takes `suggest`, `canSuggest`, or `lastEditedBy`. Update the three detail pages that pass those props (remove the now-invalid props). Find them: `grep -rn "canSuggest\|lastEditedBy\|suggest=" apps/wiki/src/app`.

- [ ] **Step 4: Remove `/contribute` and proposals nav entries**

Run: `grep -rn "/contribute\|/admin/proposals" apps/wiki/src/components apps/wiki/src/app`
Remove any nav links / admin menu entries pointing at the deleted routes. Add an `/admin/tips` link wherever `/admin/proposals` used to be linked.

- [ ] **Step 5: Remove `getLastEditor` and its callers if now unused**

Run: `grep -rn "getLastEditor" apps/wiki/src`
If only its definition remains (callers removed with the credit block), delete the `getLastEditor` function from `queries.ts`.

- [ ] **Step 6: Typecheck + build + tests**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit && npm run build --workspace=apps/wiki && npm run test --workspace=apps/wiki`
Expected: ALL clean now — no Prisma entity imports remain, no dangling references. If a test for a deleted feature remains, delete that test file (`git rm`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(wiki): remove proposal/contribute/admin-entity write flows"
```

---

## Task 7: Remove Directus and retired DB scripts

**Files:**
- Delete: `apps/wiki/directus/`, `apps/wiki/docker-compose.yml`, `apps/wiki/docker-compose.override.yml`
- Delete: retired generator/loader scripts under `apps/wiki/prisma/` that wrote the dropped tables
- Modify: `apps/wiki/package.json` (remove directus + entity-load scripts)

- [ ] **Step 1: Delete Directus + compose**

```bash
git rm -r apps/wiki/directus
git rm apps/wiki/docker-compose.yml apps/wiki/docker-compose.override.yml
git rm apps/wiki/prisma/sync-directus-icons.mjs apps/wiki/prisma/setup-directus-moderator.mjs
```

- [ ] **Step 2: Delete retired entity-write scripts**

These wrote the now-dropped tables and are superseded by the JSON export (real pipeline = spec #2):

```bash
git rm apps/wiki/prisma/seed.ts apps/wiki/prisma/seed-transform.ts apps/wiki/prisma/seed-transform.test.ts
git rm apps/wiki/prisma/load-*.ts apps/wiki/prisma/import-*.mjs
git rm apps/wiki/prisma/curated-extras.ts apps/wiki/prisma/curated-extras.test.ts apps/wiki/prisma/curated-extras.json
git rm apps/wiki/prisma/build-weapon-stats.ts apps/wiki/prisma/weapon-stats.ts apps/wiki/prisma/weapon-stats.test.ts
git rm apps/wiki/prisma/migrate-coin-trades-to-buy.ts apps/wiki/prisma/extract-tech-unlocks-to-buy.ts apps/wiki/prisma/backfill-ammo-type.ts
```

> Before each `git rm`, run `grep -rn "<basename>" apps/wiki/src` to confirm nothing in the app imports it. Datamine JSON sources and python under `apps/wiki/datamine/` are LEFT for spec #2 (the unification). If a listed file does not exist, skip it.

- [ ] **Step 3: Remove the dead npm scripts from `apps/wiki/package.json`**

Delete these script entries: `db:seed`, `db:seed:force`, `db:load-location-recipes`, `db:load-key-progression`, `db:load-new-ammo`, `db:load-curated-extras`, `weapons:build`, `db:load-loot-containers`, `db:load-weapon-stats`, `loot:update`, `loot:promote`, `db:migrate-buy-options`, `db:extract-tech-unlocks`, `db:reset`, `directus:up`, `directus:down`, `directus:snapshot`, `directus:apply`, `directus:moderator`.

Keep: `dev`, `build`, `start`, `postinstall` (prisma generate — still needed for tips), `lint`, `test`, `test:watch`, `test:e2e`, `data:export` (from Plan 1), `loot:build` (python; feeds spec #2 — keep).

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc -p apps/wiki/tsconfig.json --noEmit && npm run build --workspace=apps/wiki`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(wiki): remove Directus and retired entity-write scripts"
```

---

## Task 8: Production teardown

**Files:** none (operational). The migration from Task 1 is applied to prod.

> Hard rule (memory: never-reseed-live-db): the ONLY prod DB action is a forward `prisma migrate deploy`. No seed, no reset. The static JSON already holds all entity data; dropping the tables is intentional and non-recoverable-by-design.

- [ ] **Step 1: Pre-flight — confirm prod is on JSON and dev is fully green**

Verify: a Vercel **preview** deploy of this branch renders all public routes from JSON correctly (entities, recipes, loot, tech, tips). Do NOT proceed to prod until the preview is verified.

- [ ] **Step 2: Back up prod entity data (belt-and-suspenders)**

The committed JSON is the backup, but also snapshot the prod DB via Neon's branching/backup before the drop, so the pre-teardown state is restorable if a problem surfaces.

- [ ] **Step 3: Apply the migration to prod**

With `DATABASE_URL`/`DIRECT_DATABASE_URL` pointed at **prod**, run: `npx prisma migrate deploy`
Expected: creates Tip/TipVote, drops the entity tables on prod. (Vercel can run this in the build/deploy step; if so, confirm the deploy ran `migrate deploy` and succeeded.)

- [ ] **Step 4: Verify prod**

Smoke-test prod public routes (item/env/trampler/tech), the Tips tab (post → moderate → appears), and confirm no 500s referencing missing tables.

- [ ] **Step 5: Update project memory + roadmap**

- Mark Foundation done in `docs/ROADMAP.md` (sub-project #1 → DONE).
- Update memory `sandlabs-restructure-roadmap.md` and supersede `unified-entity-model-state.md` / `sand-wiki-state.md` notes about the live entity DB. The `never-reseed-live-db` hazard is now moot for entities (they're gone from the DB) — note that.

- [ ] **Step 6: Final commit (docs/memory only)**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark Foundation sub-project complete"
```

---

## Self-Review Notes (for the executor)

- **Order is load-bearing.** Tips must be built and the read path must be JSON-only (Plan 1) BEFORE dropping tables. The dev migration (Task 1) drops tables on dev immediately — that's intentional and safe because Plan 1 already proved the site runs from JSON. If anything still reads entity tables at Task 1, STOP and finish the rewrite.
- **`requireUser`/`requireAdmin` redirect** — they don't return falsy, they `redirect()`. Server actions relying on them are safe; the moderation page is gated by `getPendingTips()` calling `requireAdmin()`.
- **`targetSlug` has no FK.** Validate it against `@sandlabs/data` on write (`isEntityEnabled`) and tolerate stale slugs on read (entity may be removed in a future patch — render the slug, don't crash). The admin page already falls back to the raw slug.
- **Prod teardown is the point of no return** for the entity tables. Preview-verify first; Neon snapshot second; `migrate deploy` third. Never `db:seed`/`reset` against prod.

## Outcome

Postgres now holds only `SteamUser` + `Tip` + `TipVote`. Directus is gone. The wiki is a static-data app with a community tips feature. The repo is a clean npm-workspaces monorepo ready for spec #2 (unified datamining) and spec #3 (trampler builder).
