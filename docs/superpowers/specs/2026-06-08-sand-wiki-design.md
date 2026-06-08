# Unofficial SAND Wiki — Design Spec

**Date:** 2026-06-08
**Status:** Approved (design); pending written-spec review
**Source brief:** `gemini-code-1780940162053.md`

## 1. Goal

A collaborative, **unofficial** database for the game *SAND: Raiders of Sofia* that helps
the community find information on crafting, items, and game mechanics.

This document specifies the **first build**: a read-only, English-language wiki.

## 2. Scope decisions

These were settled during brainstorming:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data source** | User provides structured data (JSON/CSV) | Imported via a re-runnable seed script. |
| **First scope** | Read-only wiki | Browse / search / filter / tech-tree calculator. Contributions & auth deferred. |
| **Architecture** | Single Next.js app | No separate Express service for a read-heavy site. |
| **UI language** | English only | No i18n framework needed. |
| **Tech-node cost** | List of `(resource, quantity)` | Generalizes; an abstract "research points" cost is just one resource. |
| **Dataset size** | Assume up to hundreds | Simple matching + Postgres trigram index for headroom. |

### Out of scope (phase 2)
User accounts, contribution/error-report submission, and the manual moderation queue.
The data model leaves room to add them later.

## 3. Architecture & stack

- **Next.js (App Router, TypeScript)** — UI and data access in one deployable unit.
  Data is read in React Server Components and route handlers.
- **PostgreSQL** accessed via **Prisma** ORM. No separate API service.
- **Tailwind CSS** for styling, with accessible, semantic components and contrast-checked tokens.
- **Local dev DB**: `docker-compose.yml` running Postgres + a `.env` `DATABASE_URL`.
- **Data import**: `prisma/seed.ts` ingests the structured data file(s) the user provides.
  Idempotent / re-runnable so data can be refreshed after each game update.
- **Testing**:
  - **Vitest** — unit tests for tech-tree cost math and filtering/sorting logic.
  - **Playwright** — end-to-end flows + automated accessibility checks (axe).
  - *(Spec originally said "Jest or Cypress"; Vitest + Playwright are the modern equivalents
    and integrate better with the Next.js/Vite toolchain.)*

## 4. Data model (Prisma)

```
Item
  id            String  @id @default(cuid())
  slug          String  @unique
  name          String
  description   String?
  type          String          // category, used for filtering
  workbenchLevel Int?           // niveau d'établi (null for raw resources)
  craftTimeSeconds Int?         // null for raw resources
  unlockConditions String?      // free text; structured link below via unlockedBy
  imageAlt      String?         // alt text only — no copyrighted assets stored
  isResource    Boolean @default(false)  // raw resource vs manufacturable
  unlockedById  String?         // optional FK -> TechNode
  // relations: recipe (ingredients of THIS item), usedIn (ingredients pointing AT this item)

RecipeIngredient            // self-referential ingredient list
  id            String  @id @default(cuid())
  itemId        String          // the crafted item
  ingredientId  String          // a material Item (resource or intermediate craft)
  quantity      Int
  @@unique([itemId, ingredientId])

TechNode
  id            String  @id @default(cuid())
  slug          String  @unique
  name          String
  description   String?
  // costs: list of TechCost; prerequisites: list of TechPrerequisite

TechCost                     // resource cost to unlock a node
  id            String  @id @default(cuid())
  techNodeId    String
  resourceId    String          // FK -> Item (isResource = true)
  quantity      Int

TechPrerequisite             // DAG edges between TechNodes (many-to-many self relation)
  id            String  @id @default(cuid())
  nodeId        String          // the node
  prerequisiteId String         // a node that must be unlocked first
  @@unique([nodeId, prerequisiteId])
```

Notes:
- **Items and raw resources share one table** because recipes reference both. `isResource`
  distinguishes them.
- A **trigram index** (`pg_trgm`) on `Item.name` keeps name search fast at scale.

## 5. Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing with prominent search and a short intro. |
| `/items` | Browsable list. **Search by name**; **filter/sort** by type, workbench level, required resource. |
| `/items/[slug]` | Item detail: recipe, linked materials, workbench level, craft time, unlock conditions, and reverse "Used in". |
| `/tech` | Tech-tree **visualization** (React Flow DAG) + **cost calculator** (see §6), with an accessible table fallback of the same data. |
| `/about` | Non-official disclaimer: not affiliated with tinyBuild; no protected assets used. |

## 6. Tech-tree cost calculator

- Input: a target `TechNode`.
- Compute the **transitive closure** of its prerequisites (the node + everything required to
  reach it), deduplicated (a shared prerequisite is counted once).
- Sum `TechCost` entries across that set, grouped by resource.
- Output: total quantity per resource needed to unlock the target from scratch.
- The traversal is pure, in-memory logic over the loaded graph → **unit-tested with Vitest**,
  including diamond-dependency (shared prerequisite) and cycle-guard cases.

## 7. Accessibility (A11y)

Built in from the start, not bolted on:
- Semantic HTML and landmark structure.
- Sufficient color contrast, verified against design tokens.
- Full keyboard navigation, including a **table fallback** for the tech-tree graph.
- `alt` text on every image.
- Automated **axe** checks run in Playwright against key pages.

## 8. Legal / compliance

- Visible disclaimer that the site is unofficial and not affiliated with tinyBuild (`/about`,
  plus a persistent footer line).
- **No protected assets** (extracted images, sounds, 3D models) are stored or served.
  Images, if any, are community/original; `imageAlt` is stored regardless.

## 9. Project structure (target)

```
sand-wiki/
  docker-compose.yml          # local Postgres
  .env.example
  prisma/
    schema.prisma
    seed.ts                   # imports user-provided structured data
  src/
    app/                      # routes: /, /items, /items/[slug], /tech, /about
    components/               # accessible UI components
    lib/
      db.ts                   # Prisma client
      tech-tree.ts            # cost-closure logic (unit tested)
      search.ts               # name search + filter/sort
  tests/
    unit/                     # Vitest
    e2e/                      # Playwright + axe
```

## 10. Open items to confirm with data delivery

- Exact shape/format of the structured data file (field names, units for craft time).
- Whether item "type" is a fixed enum or free-form (affects filter UI).
