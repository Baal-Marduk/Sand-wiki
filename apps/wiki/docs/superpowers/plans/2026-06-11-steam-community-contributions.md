# Steam Community Contributions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Steam-authenticated users propose structured corrections to existing wiki entities and request new pages, with admins reviewing and applying changes through a custom in-app screen.

**Architecture:** Steam OpenID 2.0 login issues a stateless HMAC-signed session cookie. Logged-in users submit `Proposal` rows (structured field diffs for edits, free-text for new pages) — canonical data is never touched at submission time. Admins (Steam IDs on an env allowlist) review proposals at `/admin/proposals` and apply edits transactionally via a field whitelist.

**Tech Stack:** Next.js 16 (App Router, route handlers, server actions), Prisma 6 / Postgres (Neon), Node `crypto` (HMAC, no auth dependency), Vitest, Tailwind/DaisyUI.

> **Next.js 16 caveat:** This is NOT the Next.js in your training data (see `sand-wiki/AGENTS.md`). Before writing route handlers, `cookies()` usage, server actions, or `redirect()`, read the relevant guide under `sand-wiki/node_modules/next/dist/docs/`. In particular: `cookies()` from `next/headers` is **async** (`await cookies()`), and server actions require a `"use server"` directive.

> **Working directory:** All paths are relative to `sand-wiki/`. Run all commands from `sand-wiki/`.

---

## File Structure

**Auth (logic — unit tested):**
- Create `src/lib/session.ts` — sign/verify the HMAC session token. Pure functions.
- Create `src/lib/steam-openid.ts` — build the Steam login URL, parse the claimed id, verify the assertion (fetch injected for tests).
- Create `src/lib/auth.ts` — server helpers (`getSession`, `getUser`, `requireAdmin`, `isAdmin`) wrapping `next/headers` cookies + Prisma.

**Auth (route handlers + UI):**
- Create `src/app/api/auth/steam/login/route.ts`
- Create `src/app/api/auth/steam/callback/route.ts`
- Create `src/app/api/auth/steam/logout/route.ts`
- Create `src/components/AuthMenu.tsx` — login/logout + persona indicator in the nav.
- Modify `src/components/MainNav.tsx:75-79` — render `<AuthMenu />`.

**Proposals (logic — unit tested):**
- Create `src/lib/proposal-schema.ts` — per-type editable-field whitelist + value coercion.
- Create `src/lib/proposal-diff.ts` — compute the changed-fields diff.
- Create `src/lib/proposal-apply.ts` — apply an approved diff to the canonical row.

**Proposals (queries + actions + UI):**
- Create `src/lib/proposal-entity.ts` — fetch current whitelisted field values for an entity.
- Create `src/app/contribute/actions.ts` — `submitEdit`, `submitNewPage` server actions.
- Create `src/app/contribute/edit/page.tsx` — prefilled edit form (`?type=&slug=`).
- Create `src/app/contribute/new/page.tsx` — new-page request form.
- Create `src/components/EditProposalForm.tsx` — client form for edits.
- Create `src/components/SuggestCorrectionLink.tsx` — entry point on entity pages.
- Modify `src/app/items/[slug]/page.tsx`, `src/app/environment/[slug]/page.tsx`, `src/app/tramplers/[slug]/page.tsx` — add the suggest link.

**Admin:**
- Create `src/app/admin/proposals/page.tsx` — pending list.
- Create `src/app/admin/proposals/[id]/page.tsx` — diff + approve/reject.
- Create `src/app/admin/proposals/actions.ts` — `approveProposal`, `rejectProposal`.

**Schema / config:**
- Modify `prisma/schema.prisma` — add `SteamUser`, `Proposal`.
- New migration under `prisma/migrations/`.
- Modify `.env` / create `.env.example` — new env vars.

---

## Task 1: Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma` (append after `TramplerPartCost`)

- [ ] **Step 1: Add the models**

Append to `prisma/schema.prisma`:

```prisma
model SteamUser {
  steamId     String   @id
  personaName String?
  avatar      String?
  createdAt   DateTime @default(now())
  lastSeenAt  DateTime @default(now())
  proposals   Proposal[]
}

model Proposal {
  id           String    @id @default(dbgenerated("(gen_random_uuid())::text"))
  kind         String // "edit" | "new_page"
  status       String    @default("pending") // "pending" | "applied" | "rejected"
  targetType   String? // "item" | "envEntity" | "tramplerPart"
  targetSlug   String?
  changes      Json? // { field: { old, new } }
  note         String?
  proposedName String?
  proposerId   String
  proposer     SteamUser @relation(fields: [proposerId], references: [steamId])
  createdAt    DateTime  @default(now())
  reviewedById String?
  reviewedAt   DateTime?
  reviewNote   String?

  @@index([status])
  @@index([targetType, targetSlug])
  @@index([proposerId])
}
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name steam_contributions`
Expected: migration generated under `prisma/migrations/<ts>_steam_contributions/`, applied to the Neon dev DB, and the Prisma client regenerated. (If `prisma`/`npx` PATH issues recur, invoke via the project-local binary as done elsewhere in this repo.)

- [ ] **Step 3: Verify the client typed the models**

Run: `npx tsc --noEmit`
Expected: PASS (no errors from referencing `prisma.proposal` / `prisma.steamUser` later is confirmed in subsequent tasks; this step just confirms the schema compiles).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(wiki): SteamUser + Proposal models for community contributions"
```

---

## Task 2: Session token sign/verify

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/session.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./session";

const SECRET = "test-secret";

describe("session token", () => {
  it("round-trips a valid payload", () => {
    const token = signSession({ steamId: "76561198000000000", exp: 2_000 }, SECRET);
    expect(verifySession(token, SECRET, 1_000)).toEqual({ steamId: "76561198000000000", exp: 2_000 });
  });

  it("rejects a tampered body", () => {
    const token = signSession({ steamId: "76561198000000000", exp: 2_000 }, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ steamId: "1", exp: 2_000 })).toString("base64url") + "." + sig;
    expect(verifySession(forged, SECRET, 1_000)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    const token = signSession({ steamId: "x", exp: 2_000 }, SECRET);
    expect(verifySession(token, "other", 1_000)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSession({ steamId: "x", exp: 1_000 }, SECRET);
    expect(verifySession(token, SECRET, 1_000)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySession("garbage", SECRET, 1_000)).toBeNull();
    expect(verifySession("a.b.c", SECRET, 1_000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Implement**

`src/lib/session.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  steamId: string;
  exp: number; // epoch ms
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(token: string, secret: string, now = Date.now()): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (typeof payload?.steamId !== "string" || typeof payload?.exp !== "number") return null;
  if (payload.exp <= now) return null;
  return payload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/session.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts
git commit -m "feat(wiki): HMAC session token sign/verify"
```

---

## Task 3: Steam OpenID helpers

**Files:**
- Create: `src/lib/steam-openid.ts`
- Test: `src/lib/steam-openid.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/steam-openid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSteamLoginUrl, extractSteamId, verifyAssertion } from "./steam-openid";

describe("steam openid", () => {
  it("builds a checkid_setup url with our realm/return_to", () => {
    const url = new URL(buildSteamLoginUrl("https://wiki.test", "https://wiki.test/api/auth/steam/callback"));
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.realm")).toBe("https://wiki.test");
    expect(url.searchParams.get("openid.return_to")).toBe("https://wiki.test/api/auth/steam/callback");
  });

  it("extracts a 17-digit steamid from a claimed_id", () => {
    expect(extractSteamId("https://steamcommunity.com/openid/id/76561198000000000")).toBe("76561198000000000");
  });

  it("rejects a non-steam claimed_id", () => {
    expect(extractSteamId("https://evil.test/openid/id/76561198000000000")).toBeNull();
    expect(extractSteamId("https://steamcommunity.com/openid/id/notanumber")).toBeNull();
  });

  it("returns the steamid when Steam validates the assertion", async () => {
    const params = new URLSearchParams({
      "openid.mode": "id_res",
      "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000",
    });
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      // must re-post with mode swapped to check_authentication
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("openid.mode")).toBe("check_authentication");
      return { text: async () => "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n" } as Response;
    };
    expect(await verifyAssertion(params, fakeFetch as typeof fetch)).toBe("76561198000000000");
  });

  it("returns null when Steam says is_valid:false", async () => {
    const params = new URLSearchParams({ "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000" });
    const fakeFetch = async () => ({ text: async () => "is_valid:false\n" } as Response);
    expect(await verifyAssertion(params, fakeFetch as typeof fetch)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/steam-openid.test.ts`
Expected: FAIL — cannot find module `./steam-openid`.

- [ ] **Step 3: Implement**

`src/lib/steam-openid.ts`:

```ts
const STEAM_OPENID = "https://steamcommunity.com/openid/login";

export function buildSteamLoginUrl(realm: string, returnTo: string): string {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${params.toString()}`;
}

const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function extractSteamId(claimedId: string | null): string | null {
  if (!claimedId) return null;
  const m = CLAIMED_ID_RE.exec(claimedId);
  return m ? m[1] : null;
}

/** Verify the callback assertion by echoing the params back to Steam with
 *  mode=check_authentication. Returns the verified steamid, or null. */
export async function verifyAssertion(
  params: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const body = new URLSearchParams(params);
  body.set("openid.mode", "check_authentication");
  const res = await fetchImpl(STEAM_OPENID, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!/^is_valid:true$/m.test(text)) return null;
  return extractSteamId(params.get("openid.claimed_id"));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/steam-openid.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/steam-openid.ts src/lib/steam-openid.test.ts
git commit -m "feat(wiki): Steam OpenID URL builder + assertion verifier"
```

---

## Task 4: Auth server helpers + admin allowlist

**Files:**
- Create: `src/lib/auth.ts`
- Test: `src/lib/auth.test.ts`

- [ ] **Step 1: Write the failing test** (pure `isAdmin` only — the cookie/Prisma wrappers are covered by manual/E2E verification)

`src/lib/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAdmin } from "./auth";

describe("isAdmin", () => {
  it("matches a steamid in the allowlist", () => {
    expect(isAdmin("76561198000000000", "76561198000000000, 76561198111111111")).toBe(true);
  });
  it("rejects ids not in the allowlist", () => {
    expect(isAdmin("76561198999999999", "76561198000000000")).toBe(false);
  });
  it("treats an empty allowlist as no admins", () => {
    expect(isAdmin("76561198000000000", "")).toBe(false);
    expect(isAdmin("76561198000000000", undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth.test.ts`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 3: Implement**

`src/lib/auth.ts`:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { verifySession, type SessionPayload } from "./session";

export const SESSION_COOKIE = "sand_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Pure allowlist check — `csv` defaults to the ADMIN_STEAM_IDS env var. */
export function isAdmin(steamId: string, csv = process.env.ADMIN_STEAM_IDS): boolean {
  const ids = (csv ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(steamId);
}

export async function getSession(): Promise<SessionPayload | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token, secret);
}

export async function getUser() {
  const session = await getSession();
  if (!session) return null;
  return prisma.steamUser.findUnique({ where: { steamId: session.steamId } });
}

/** Require a logged-in user; redirects to Steam login (with a return path) if absent. */
export async function requireUser(returnTo = "/"): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect(`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session;
}

/** Require an admin; 404s for everyone else so /admin isn't discoverable. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || !isAdmin(session.steamId)) redirect("/");
  return session;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat(wiki): auth helpers + admin allowlist"
```

---

## Task 5: Steam auth route handlers

**Files:**
- Create: `src/app/api/auth/steam/login/route.ts`
- Create: `src/app/api/auth/steam/callback/route.ts`
- Create: `src/app/api/auth/steam/logout/route.ts`

> Read `node_modules/next/dist/docs/` on route handlers + `NextResponse.redirect` and cookie setting before implementing.

- [ ] **Step 1: Implement the login handler**

`src/app/api/auth/steam/login/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildSteamLoginUrl } from "@/lib/steam-openid";

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  // Only allow same-origin relative return paths (no open redirect).
  const requested = req.nextUrl.searchParams.get("returnTo") ?? "/";
  const returnPath = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const callback = new URL("/api/auth/steam/callback", origin);
  callback.searchParams.set("returnTo", returnPath);
  return NextResponse.redirect(buildSteamLoginUrl(origin, callback.toString()));
}
```

- [ ] **Step 2: Implement the callback handler**

`src/app/api/auth/steam/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAssertion } from "@/lib/steam-openid";
import { signSession } from "@/lib/session";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const params = req.nextUrl.searchParams;

  // Guard: return_to must point back at our own callback (anti-replay/forgery).
  const expectedReturn = new URL("/api/auth/steam/callback", origin).toString();
  const returnedTo = params.get("openid.return_to") ?? "";
  if (!returnedTo.startsWith(expectedReturn)) {
    return NextResponse.redirect(new URL("/?auth=error", origin));
  }

  const steamId = await verifyAssertion(params);
  if (!steamId) return NextResponse.redirect(new URL("/?auth=error", origin));

  // Best-effort profile enrichment; failure must not block login.
  let personaName: string | null = null;
  let avatar: string | null = null;
  const key = process.env.STEAM_API_KEY;
  if (key) {
    try {
      const r = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`,
      );
      const j = await r.json();
      const p = j?.response?.players?.[0];
      if (p) {
        personaName = p.personaname ?? null;
        avatar = p.avatar ?? null;
      }
    } catch {
      /* ignore */
    }
  }

  await prisma.steamUser.upsert({
    where: { steamId },
    create: { steamId, personaName, avatar },
    update: { personaName, avatar, lastSeenAt: new Date() },
  });

  const secret = process.env.SESSION_SECRET!;
  const token = signSession({ steamId, exp: Date.now() + SESSION_TTL_MS }, secret);

  const requested = params.get("returnTo") ?? "/";
  const dest = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const res = NextResponse.redirect(new URL(dest, origin));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
```

- [ ] **Step 3: Implement the logout handler**

`src/app/api/auth/steam/logout/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const res = NextResponse.redirect(new URL("/", origin), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 4: Verify compilation + manual login round-trip**

Run: `npx tsc --noEmit`
Expected: PASS.

Then with `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, and (optionally) `STEAM_API_KEY` set in `.env`, run `npm run dev`, visit `/api/auth/steam/login`, complete Steam login, and confirm the browser lands back on `/` with a `sand_session` cookie present (DevTools → Application → Cookies, flagged HttpOnly).
Expected: a `SteamUser` row exists (`npx prisma studio` or a DB query).

> **Local HTTPS note:** `secure: true` cookies are not stored over plain `http://localhost`. For local testing either run dev over HTTPS, or temporarily set `secure` from an env flag. Revisit in the security gate (Task 15).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/steam
git commit -m "feat(wiki): Steam login/callback/logout route handlers"
```

---

## Task 6: Auth menu in the nav

**Files:**
- Create: `src/components/AuthMenu.tsx`
- Modify: `src/components/MainNav.tsx:75-79`

- [ ] **Step 1: Implement AuthMenu (server component)**

`src/components/AuthMenu.tsx`:

```tsx
import { getUser, isAdmin } from "@/lib/auth";

const linkCls = "nav-link text-base-content px-2 py-1 rounded";

export async function AuthMenu() {
  const user = await getUser();

  if (!user) {
    return (
      <a href="/api/auth/steam/login" className={linkCls}>
        Sign in
      </a>
    );
  }

  const admin = isAdmin(user.steamId);
  return (
    <div className="flex items-center gap-2">
      {admin && (
        <a href="/admin/proposals" className={linkCls}>
          Review
        </a>
      )}
      <span className="text-sm text-base-content/70">{user.personaName ?? "Signed in"}</span>
      <form action="/api/auth/steam/logout" method="post">
        <button type="submit" className={`${linkCls} cursor-pointer`}>
          Sign out
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the nav**

In `src/components/MainNav.tsx`, add the import at the top:

```tsx
import { AuthMenu } from "@/components/AuthMenu";
```

Replace the right-hand cluster (`src/components/MainNav.tsx:75-79`):

```tsx
      <div className="flex-none flex items-center gap-2">
        <SearchBox variant="navbar" />
        <Link href="/about" className={linkCls}>About</Link>
        <AuthMenu />
        <ThemeToggle />
      </div>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: PASS.

Manual: `npm run dev`. Logged out → "Sign in" shows. Logged in (non-admin) → persona + "Sign out". Logged in as an `ADMIN_STEAM_IDS` id → also a "Review" link.

- [ ] **Step 4: Commit**

```bash
git add src/components/AuthMenu.tsx src/components/MainNav.tsx
git commit -m "feat(wiki): sign in/out + admin review link in nav"
```

---

## Task 7: Proposal field whitelist + value coercion

**Files:**
- Create: `src/lib/proposal-schema.ts`
- Test: `src/lib/proposal-schema.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/proposal-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { editableFields, fieldDef, coerceValue, isEditableTarget } from "./proposal-schema";

describe("proposal schema", () => {
  it("exposes editable fields per known type", () => {
    expect(editableFields("item").length).toBeGreaterThan(0);
    expect(editableFields("unknown")).toEqual([]);
  });

  it("identifies known target types", () => {
    expect(isEditableTarget("item")).toBe(true);
    expect(isEditableTarget("envEntity")).toBe(true);
    expect(isEditableTarget("recipe")).toBe(false);
  });

  it("looks up a field definition", () => {
    expect(fieldDef("item", "rarity")?.type).toBe("string");
    expect(fieldDef("item", "nope")).toBeUndefined();
  });

  it("coerces ints, blanking empties to null", () => {
    expect(coerceValue("int", "240")).toBe(240);
    expect(coerceValue("int", "")).toBeNull();
    expect(coerceValue("int", "  ")).toBeNull();
  });

  it("coerces strings, trimming and blanking empties to null", () => {
    expect(coerceValue("string", "  Rare ")).toBe("Rare");
    expect(coerceValue("string", "")).toBeNull();
  });

  it("returns NaN sentinel as null for non-numeric int input", () => {
    expect(coerceValue("int", "abc")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/proposal-schema.test.ts`
Expected: FAIL — cannot find module `./proposal-schema`.

- [ ] **Step 3: Implement**

`src/lib/proposal-schema.ts`:

```ts
export type FieldType = "string" | "text" | "int";

export interface EditableField {
  field: string;
  label: string;
  type: FieldType;
}

/** Whitelist of scalar fields a community edit may touch, per target type.
 *  Anything not listed here can never be proposed or applied. */
export const EDITABLE_FIELDS: Record<string, EditableField[]> = {
  item: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
    { field: "rarity", label: "Rarity", type: "string" },
    { field: "storageStack", label: "Storage stack", type: "int" },
    { field: "workbenchTier", label: "Workbench tier", type: "int" },
    { field: "statValue", label: "Value", type: "int" },
    { field: "damage", label: "Damage", type: "int" },
    { field: "playerDamage", label: "Player damage", type: "int" },
    { field: "tramplerDamage", label: "Trampler damage", type: "int" },
    { field: "splashDamage", label: "Splash damage", type: "int" },
    { field: "magazine", label: "Magazine", type: "int" },
    { field: "ammoName", label: "Ammo", type: "string" },
  ],
  envEntity: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
    { field: "sourceUrl", label: "Source URL", type: "string" },
  ],
  tramplerPart: [
    { field: "name", label: "Name", type: "string" },
    { field: "description", label: "Description", type: "text" },
    { field: "dimensions", label: "Dimensions", type: "string" },
    { field: "health", label: "Health", type: "int" },
    { field: "weight", label: "Weight", type: "int" },
    { field: "weightCapacity", label: "Weight capacity", type: "int" },
    { field: "weightCompensation", label: "Weight compensation", type: "int" },
    { field: "energyConsumption", label: "Energy consumption", type: "int" },
    { field: "energyCapacity", label: "Energy capacity", type: "int" },
    { field: "ratedPower", label: "Rated power", type: "int" },
    { field: "crewSlots", label: "Crew slots", type: "int" },
    { field: "itemSlots", label: "Item slots", type: "int" },
  ],
};

export function isEditableTarget(type: string): boolean {
  return type in EDITABLE_FIELDS;
}

export function editableFields(type: string): EditableField[] {
  return EDITABLE_FIELDS[type] ?? [];
}

export function fieldDef(type: string, field: string): EditableField | undefined {
  return editableFields(type).find((f) => f.field === field);
}

/** Coerce a raw form string to the stored value type. Empty/blank → null. */
export function coerceValue(type: FieldType, raw: string): string | number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (type === "int") {
    const n = Number(trimmed);
    return Number.isInteger(n) ? n : null;
  }
  return trimmed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/proposal-schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal-schema.ts src/lib/proposal-schema.test.ts
git commit -m "feat(wiki): editable-field whitelist + value coercion"
```

---

## Task 8: Diff computation

**Files:**
- Create: `src/lib/proposal-diff.ts`
- Test: `src/lib/proposal-diff.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/proposal-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDiff } from "./proposal-diff";
import { editableFields } from "./proposal-schema";

const itemFields = editableFields("item");

describe("computeDiff", () => {
  it("includes only changed fields", () => {
    const current = { name: "Scrap", rarity: "Common", statValue: 10 };
    const submitted = { name: "Scrap", rarity: "Rare", statValue: 10 };
    expect(computeDiff(current, submitted, itemFields)).toEqual({
      rarity: { old: "Common", new: "Rare" },
    });
  });

  it("treats null and missing as equal", () => {
    const current = { description: null };
    const submitted = { description: null };
    expect(computeDiff(current, submitted, itemFields)).toEqual({});
  });

  it("captures clearing a value to null", () => {
    const current = { ammoName: "7.62" };
    const submitted = { ammoName: null };
    expect(computeDiff(current, submitted, itemFields)).toEqual({
      ammoName: { old: "7.62", new: null },
    });
  });

  it("ignores fields outside the whitelist", () => {
    const current = { icon: "a.png" } as Record<string, unknown>;
    const submitted = { icon: "b.png" } as Record<string, unknown>;
    expect(computeDiff(current, submitted, itemFields)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/proposal-diff.test.ts`
Expected: FAIL — cannot find module `./proposal-diff`.

- [ ] **Step 3: Implement**

`src/lib/proposal-diff.ts`:

```ts
import type { EditableField } from "./proposal-schema";

export interface Change {
  old: string | number | null;
  new: string | number | null;
}
export type Diff = Record<string, Change>;

function norm(v: unknown): string | number | null {
  return v === undefined || v === "" ? null : (v as string | number | null);
}

/** Diff of whitelisted fields only; entries appear solely where the value changed. */
export function computeDiff(
  current: Record<string, unknown>,
  submitted: Record<string, unknown>,
  fields: EditableField[],
): Diff {
  const diff: Diff = {};
  for (const f of fields) {
    const oldVal = norm(current[f.field]);
    const newVal = norm(submitted[f.field]);
    if (oldVal !== newVal) diff[f.field] = { old: oldVal, new: newVal };
  }
  return diff;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/proposal-diff.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal-diff.ts src/lib/proposal-diff.test.ts
git commit -m "feat(wiki): changed-fields diff computation"
```

---

## Task 9: Current-value query for an entity

**Files:**
- Create: `src/lib/proposal-entity.ts`

- [ ] **Step 1: Implement**

`src/lib/proposal-entity.ts`:

```ts
import { prisma } from "./db";
import { editableFields, isEditableTarget } from "./proposal-schema";

export interface EntityFields {
  name: string;
  values: Record<string, string | number | null>;
}

/** Current whitelisted field values for an entity, used to prefill the edit
 *  form and to show "current" in the admin diff. Returns null if not found. */
export async function getEntityFields(type: string, slug: string): Promise<EntityFields | null> {
  if (!isEditableTarget(type)) return null;
  const fields = editableFields(type).map((f) => f.field);
  const select = Object.fromEntries([...fields, "name"].map((f) => [f, true]));

  const row =
    type === "item"
      ? await prisma.item.findUnique({ where: { slug }, select })
      : type === "envEntity"
        ? await prisma.envEntity.findUnique({ where: { slug }, select })
        : await prisma.tramplerPart.findUnique({ where: { slug }, select });

  if (!row) return null;
  const r = row as Record<string, string | number | null>;
  const values: Record<string, string | number | null> = {};
  for (const f of fields) values[f] = r[f] ?? null;
  return { name: String(r.name ?? slug), values };
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/proposal-entity.ts
git commit -m "feat(wiki): current-field query for proposal forms"
```

---

## Task 10: Submission server actions

**Files:**
- Create: `src/app/contribute/actions.ts`

- [ ] **Step 1: Implement** (read `node_modules/next/dist/docs/` on server actions first)

`src/app/contribute/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { editableFields, isEditableTarget, coerceValue, fieldDef } from "@/lib/proposal-schema";
import { computeDiff } from "@/lib/proposal-diff";
import { getEntityFields } from "@/lib/proposal-entity";

const MAX_PENDING_PER_USER = 10;

async function assertUnderQuota(proposerId: string) {
  const pending = await prisma.proposal.count({ where: { proposerId, status: "pending" } });
  if (pending >= MAX_PENDING_PER_USER) {
    throw new Error("You have too many pending proposals. Please wait for review.");
  }
}

export async function submitEdit(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const note = (String(formData.get("note") ?? "").trim() || null) as string | null;

  if (!isEditableTarget(type)) throw new Error("Unknown target type.");
  const session = await requireUser(`/contribute/edit?type=${type}&slug=${slug}`);
  await assertUnderQuota(session.steamId);

  const current = await getEntityFields(type, slug);
  if (!current) throw new Error("Page not found.");

  const submitted: Record<string, string | number | null> = {};
  for (const f of editableFields(type)) {
    const def = fieldDef(type, f.field)!;
    submitted[f.field] = coerceValue(def.type, String(formData.get(f.field) ?? ""));
  }

  const changes = computeDiff(current.values, submitted, editableFields(type));
  if (Object.keys(changes).length === 0) throw new Error("No changes to submit.");

  await prisma.proposal.create({
    data: { kind: "edit", targetType: type, targetSlug: slug, changes, note, proposerId: session.steamId },
  });
  redirect(`/${type === "envEntity" ? "environment" : type === "item" ? "items" : "tramplers"}/${slug}?proposed=1`);
}

export async function submitNewPage(formData: FormData) {
  const proposedName = String(formData.get("proposedName") ?? "").trim();
  const targetType = String(formData.get("targetType") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!proposedName || !note) throw new Error("Name and details are required.");
  const session = await requireUser("/contribute/new");
  await assertUnderQuota(session.steamId);

  await prisma.proposal.create({
    data: { kind: "new_page", targetType: targetType || null, proposedName, note, proposerId: session.steamId },
  });
  redirect("/contribute/new?submitted=1");
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/contribute/actions.ts
git commit -m "feat(wiki): submit edit + new-page proposal actions"
```

---

## Task 11: Edit form + suggest entry point

**Files:**
- Create: `src/components/EditProposalForm.tsx`
- Create: `src/components/SuggestCorrectionLink.tsx`
- Create: `src/app/contribute/edit/page.tsx`
- Modify: `src/app/items/[slug]/page.tsx`, `src/app/environment/[slug]/page.tsx`, `src/app/tramplers/[slug]/page.tsx`

- [ ] **Step 1: Implement the form component**

`src/components/EditProposalForm.tsx`:

```tsx
import { submitEdit } from "@/app/contribute/actions";
import type { EditableField } from "@/lib/proposal-schema";

export function EditProposalForm({
  type,
  slug,
  fields,
  values,
}: {
  type: string;
  slug: string;
  fields: EditableField[];
  values: Record<string, string | number | null>;
}) {
  return (
    <form action={submitEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      {fields.map((f) => (
        <label key={f.field} className="block space-y-1">
          <span className="text-sm font-medium">{f.label}</span>
          {f.type === "text" ? (
            <textarea name={f.field} defaultValue={values[f.field] ?? ""} className="textarea textarea-bordered w-full" rows={3} />
          ) : (
            <input
              name={f.field}
              type={f.type === "int" ? "number" : "text"}
              defaultValue={values[f.field] ?? ""}
              className="input input-bordered w-full"
            />
          )}
        </label>
      ))}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Note / source (optional)</span>
        <textarea name="note" className="textarea textarea-bordered w-full" rows={2} placeholder="Where did you confirm this?" />
      </label>
      <button type="submit" className="btn btn-primary">Submit correction</button>
    </form>
  );
}
```

- [ ] **Step 2: Implement the suggest link**

`src/components/SuggestCorrectionLink.tsx`:

```tsx
import Link from "next/link";

export function SuggestCorrectionLink({ type, slug }: { type: string; slug: string }) {
  return (
    <Link href={`/contribute/edit?type=${type}&slug=${slug}`} className="btn btn-ghost btn-sm">
      Suggest a correction
    </Link>
  );
}
```

- [ ] **Step 3: Implement the edit page**

`src/app/contribute/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { editableFields, isEditableTarget } from "@/lib/proposal-schema";
import { getEntityFields } from "@/lib/proposal-entity";
import { EditProposalForm } from "@/components/EditProposalForm";

type SP = Promise<{ type?: string; slug?: string }>;

export default async function EditProposalPage({ searchParams }: { searchParams: SP }) {
  const { type = "", slug = "" } = await searchParams;
  if (!isEditableTarget(type) || !slug) notFound();
  await requireUser(`/contribute/edit?type=${type}&slug=${slug}`);

  const current = await getEntityFields(type, slug);
  if (!current) notFound();

  return (
    <article className="py-6 space-y-6">
      <h1 className="font-display text-2xl font-bold">Suggest a correction — {current.name}</h1>
      <p className="text-base-content/70">Change only what is wrong. An admin reviews every change before it goes live.</p>
      <EditProposalForm type={type} slug={slug} fields={editableFields(type)} values={current.values} />
    </article>
  );
}
```

- [ ] **Step 4: Add the suggest link to each detail page**

In `src/app/items/[slug]/page.tsx`, add the import and place the link next to the existing "Back to items" link (near line 95):

```tsx
import { SuggestCorrectionLink } from "@/components/SuggestCorrectionLink";
```

```tsx
      <div className="flex gap-2">
        <Link href="/items" className="btn btn-ghost btn-sm">← Back to items</Link>
        <SuggestCorrectionLink type="item" slug={item.slug} />
      </div>
```

Do the equivalent in `src/app/environment/[slug]/page.tsx` (`type="envEntity"`, the entity's `slug`) and `src/app/tramplers/[slug]/page.tsx` (`type="tramplerPart"`, the part's `slug`), matching each file's existing back-link markup.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: PASS.

Manual: signed in, open an item page → "Suggest a correction" → change one field → submit → redirected back with `?proposed=1`. Confirm a `Proposal` row (`kind=edit`, `status=pending`, `changes` holding only the edited field). Submitting with no changes shows the "No changes" error. Signed out, clicking the link routes through Steam login and back to the form.

- [ ] **Step 6: Commit**

```bash
git add src/components/EditProposalForm.tsx src/components/SuggestCorrectionLink.tsx src/app/contribute/edit src/app/items src/app/environment src/app/tramplers
git commit -m "feat(wiki): suggest-a-correction edit form on entity pages"
```

---

## Task 12: New-page request form

**Files:**
- Create: `src/app/contribute/new/page.tsx`

- [ ] **Step 1: Implement**

`src/app/contribute/new/page.tsx`:

```tsx
import { requireUser } from "@/lib/auth";
import { submitNewPage } from "@/app/contribute/actions";

type SP = Promise<{ submitted?: string }>;

export default async function NewPageRequest({ searchParams }: { searchParams: SP }) {
  const { submitted } = await searchParams;
  await requireUser("/contribute/new");

  return (
    <article className="py-6 space-y-6 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Propose a new page</h1>
      {submitted && <p className="alert alert-success">Thanks! Your request is awaiting review.</p>}
      <p className="text-base-content/70">Tell us what is missing. An admin will create the page from your details.</p>
      <form action={submitNewPage} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Type</span>
          <select name="targetType" className="select select-bordered w-full" defaultValue="item">
            <option value="item">Item</option>
            <option value="tramplerPart">Trampler part</option>
            <option value="envEntity">Environment / loot container</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Proposed name</span>
          <input name="proposedName" required className="input input-bordered w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Details &amp; sources</span>
          <textarea name="note" required rows={6} className="textarea textarea-bordered w-full" placeholder="Stats, recipe, where it drops, links…" />
        </label>
        <button type="submit" className="btn btn-primary">Submit request</button>
      </form>
    </article>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: PASS.

Manual: signed in, visit `/contribute/new`, submit → `?submitted=1` success banner and a `Proposal` row (`kind=new_page`, `status=pending`).

- [ ] **Step 3: Commit**

```bash
git add src/app/contribute/new
git commit -m "feat(wiki): new-page request form"
```

---

## Task 13: Apply an approved diff

**Files:**
- Create: `src/lib/proposal-apply.ts`
- Test: `src/lib/proposal-apply.test.ts`

- [ ] **Step 1: Write the failing test** (the apply logic is split so the pure parts — field filtering + stale detection — are unit tested; the DB write is exercised manually in Task 14)

`src/lib/proposal-apply.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyableUpdate, detectStale } from "./proposal-apply";
import type { Diff } from "./proposal-diff";

const diff: Diff = {
  rarity: { old: "Common", new: "Rare" },
  statValue: { old: 10, new: 25 },
};

describe("applyableUpdate", () => {
  it("builds an update of only whitelisted new values", () => {
    expect(applyableUpdate("item", diff)).toEqual({ rarity: "Rare", statValue: 25 });
  });

  it("drops non-whitelisted fields defensively", () => {
    const tainted: Diff = { ...diff, icon: { old: "a", new: "b" } };
    expect(applyableUpdate("item", tainted)).toEqual({ rarity: "Rare", statValue: 25 });
  });
});

describe("detectStale", () => {
  it("flags fields whose current value no longer matches the proposed old value", () => {
    const current = { rarity: "Uncommon", statValue: 10 };
    expect(detectStale(diff, current)).toEqual(["rarity"]);
  });

  it("returns empty when the base is unchanged", () => {
    const current = { rarity: "Common", statValue: 10 };
    expect(detectStale(diff, current)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/proposal-apply.test.ts`
Expected: FAIL — cannot find module `./proposal-apply`.

- [ ] **Step 3: Implement**

`src/lib/proposal-apply.ts`:

```ts
import { prisma } from "./db";
import { fieldDef } from "./proposal-schema";
import type { Diff } from "./proposal-diff";

/** Build a Prisma update object containing only whitelisted fields' new values. */
export function applyableUpdate(type: string, diff: Diff): Record<string, string | number | null> {
  const update: Record<string, string | number | null> = {};
  for (const [field, change] of Object.entries(diff)) {
    if (fieldDef(type, field)) update[field] = change.new;
  }
  return update;
}

/** Fields whose current DB value differs from the diff's recorded `old` value. */
export function detectStale(diff: Diff, current: Record<string, unknown>): string[] {
  const stale: string[] = [];
  for (const [field, change] of Object.entries(diff)) {
    const cur = current[field] ?? null;
    if (cur !== change.old) stale.push(field);
  }
  return stale;
}

/** Apply an approved edit proposal to its canonical row, transactionally. */
export async function applyProposal(proposalId: string, reviewerSteamId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id: proposalId } });
    if (!p || p.status !== "pending" || p.kind !== "edit" || !p.targetType || !p.targetSlug || !p.changes) {
      throw new Error("Proposal is not an applyable pending edit.");
    }
    const update = applyableUpdate(p.targetType, p.changes as Diff);
    if (Object.keys(update).length === 0) throw new Error("Nothing to apply.");

    if (p.targetType === "item") await tx.item.update({ where: { slug: p.targetSlug }, data: update });
    else if (p.targetType === "envEntity") await tx.envEntity.update({ where: { slug: p.targetSlug }, data: update });
    else if (p.targetType === "tramplerPart") await tx.tramplerPart.update({ where: { slug: p.targetSlug }, data: update });
    else throw new Error("Unknown target type.");

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "applied", reviewedById: reviewerSteamId, reviewedAt: new Date() },
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/proposal-apply.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal-apply.ts src/lib/proposal-apply.test.ts
git commit -m "feat(wiki): transactional apply of approved edit proposals"
```

---

## Task 14: Admin review screen

**Files:**
- Create: `src/app/admin/proposals/actions.ts`
- Create: `src/app/admin/proposals/page.tsx`
- Create: `src/app/admin/proposals/[id]/page.tsx`

- [ ] **Step 1: Implement the admin actions**

`src/app/admin/proposals/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { applyProposal } from "@/lib/proposal-apply";

export async function approveProposal(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const p = await prisma.proposal.findUnique({ where: { id } });
  if (!p) throw new Error("Not found.");

  if (p.kind === "edit") {
    await applyProposal(id, session.steamId); // writes canonical row + marks applied
  } else {
    // new_page: admin creates the row in Directus manually; just close it out.
    await prisma.proposal.update({
      where: { id },
      data: { status: "applied", reviewedById: session.steamId, reviewedAt: new Date() },
    });
  }
  redirect("/admin/proposals");
}

export async function rejectProposal(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || null;
  await prisma.proposal.update({
    where: { id },
    data: { status: "rejected", reviewNote, reviewedById: session.steamId, reviewedAt: new Date() },
  });
  redirect("/admin/proposals");
}
```

- [ ] **Step 2: Implement the list page**

`src/app/admin/proposals/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function AdminProposalsPage() {
  await requireAdmin();
  const pending = await prisma.proposal.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { proposer: true },
  });

  return (
    <article className="py-6 space-y-4">
      <h1 className="font-display text-2xl font-bold">Pending proposals ({pending.length})</h1>
      {pending.length === 0 ? (
        <p className="text-base-content/70">Nothing to review.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((p) => (
            <li key={p.id} className="rounded-box border border-base-300 p-3">
              <Link href={`/admin/proposals/${p.id}`} className="link">
                {p.kind === "edit" ? `Edit · ${p.targetType} · ${p.targetSlug}` : `New page · ${p.proposedName}`}
              </Link>
              <span className="ml-2 text-sm text-base-content/60">by {p.proposer.personaName ?? p.proposerId}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Implement the detail/diff page**

`src/app/admin/proposals/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEntityFields } from "@/lib/proposal-entity";
import { detectStale } from "@/lib/proposal-apply";
import type { Diff } from "@/lib/proposal-diff";
import { approveProposal, rejectProposal } from "../actions";

type Params = Promise<{ id: string }>;

export default async function ProposalDetail({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const p = await prisma.proposal.findUnique({ where: { id }, include: { proposer: true } });
  if (!p) notFound();

  let stale: string[] = [];
  let diff: Diff | null = null;
  let current: Record<string, string | number | null> = {};
  if (p.kind === "edit" && p.targetType && p.targetSlug && p.changes) {
    diff = p.changes as Diff;
    const ent = await getEntityFields(p.targetType, p.targetSlug);
    current = ent?.values ?? {};
    stale = detectStale(diff, current);
  }

  return (
    <article className="py-6 space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl font-bold">
        {p.kind === "edit" ? `Edit · ${p.targetType} · ${p.targetSlug}` : `New page · ${p.proposedName}`}
      </h1>
      <p className="text-sm text-base-content/60">by {p.proposer.personaName ?? p.proposerId} · {p.status}</p>

      {p.kind === "edit" && diff ? (
        <table className="table">
          <thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
          <tbody>
            {Object.entries(diff).map(([field, c]) => (
              <tr key={field} className={stale.includes(field) ? "bg-warning/20" : ""}>
                <td>{field}{stale.includes(field) && <span className="badge badge-warning badge-sm ml-2">base changed</span>}</td>
                <td>{String(current[field] ?? "—")}</td>
                <td className="font-medium">{String(c.new ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="whitespace-pre-wrap rounded-box border border-base-300 p-3">{p.note}</div>
      )}

      {p.note && p.kind === "edit" && <p className="text-base-content/80"><strong>Note:</strong> {p.note}</p>}

      {p.status === "pending" && (
        <div className="flex flex-wrap gap-4 items-start">
          <form action={approveProposal}>
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" className="btn btn-success">
              {p.kind === "edit" ? "Approve & apply" : "Mark created"}
            </button>
          </form>
          <form action={rejectProposal} className="flex gap-2 items-end">
            <input type="hidden" name="id" value={p.id} />
            <input name="reviewNote" placeholder="Reason (optional)" className="input input-bordered input-sm" />
            <button type="submit" className="btn btn-error">Reject</button>
          </form>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Verify end-to-end**

Run: `npx tsc --noEmit`
Expected: PASS.

Manual (signed in as an `ADMIN_STEAM_IDS` id):
- `/admin/proposals` lists the pending rows from Tasks 11–12.
- Open an edit proposal → current-vs-proposed table renders; "Approve & apply" updates the canonical row (verify the change on the public page) and the proposal flips to `applied`.
- Edit the underlying row in Directus to a different value, then open a still-pending proposal touching that field → the "base changed" warning shows.
- Reject another proposal with a note → status `rejected`, note stored.
- As a non-admin (or signed out), `/admin/proposals` redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/proposals
git commit -m "feat(wiki): admin proposal review + apply/reject screen"
```

---

## Task 15: Config docs + security gate

**Files:**
- Create: `.env.example`
- Modify: `sand-wiki/TODO.md` (check off the two relevant lines)

- [ ] **Step 1: Document the env vars**

Create `.env.example` (append to it if it already exists), documenting alongside the existing `DATABASE_URL` / `DIRECT_DATABASE_URL`:

```bash
# Steam community contributions
SESSION_SECRET=        # long random string; signs the session cookie
STEAM_API_KEY=         # optional; enables persona name + avatar (https://steamcommunity.com/dev/apikey)
ADMIN_STEAM_IDS=       # comma-separated 64-bit steamids allowed to review proposals
NEXT_PUBLIC_SITE_URL=  # public origin, e.g. https://wiki.example.com (realm/return_to)
```

- [ ] **Step 2: Full test + typecheck pass**

Run: `npm test`
Expected: PASS (session, steam-openid, auth, proposal-schema, proposal-diff, proposal-apply suites all green, plus the pre-existing suites).

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Security review gate**

Invoke the `security-review` skill against this branch's diff. It MUST confirm:
- No open redirect via `returnTo` / `openid.return_to` (both are constrained to same-origin relative paths / our callback).
- OpenID assertion is verified server-side via `check_authentication` (not trusted from the redirect alone).
- Session cookie is `httpOnly` + `secure` + `sameSite=lax`; signature verified with constant-time compare; expiry enforced.
- Every `/admin` route and every admin server action calls `requireAdmin()`; every submit action calls `requireUser()`.
- Apply path writes only whitelisted fields (`applyableUpdate` filters via `fieldDef`).
- Server actions are origin-checked (confirm Next.js 16's built-in server-action origin protection is active; if `NEXT_PUBLIC_SITE_URL`/allowed-origins config is required for production, document it).
- Resolve the local-HTTPS `secure` cookie note from Task 5 for production.

Fix any findings before sign-off.

- [ ] **Step 4: Update the TODO**

In `sand-wiki/TODO.md`, check off:
- "Add steam connection to allow user to offfer corrections…"
- "Add validation screen in backoffice to make validate corrections from steam authenticated user." (note: implemented as an in-app `/admin/proposals` screen rather than in Directus — see the design spec).

- [ ] **Step 5: Commit**

```bash
git add .env.example sand-wiki/TODO.md
git commit -m "docs(wiki): contribution env vars + security review pass"
```

---

## Self-Review Notes

- **Spec coverage:** Steam OpenID auth (Tasks 2–6), hybrid proposals — structured edits + free-text note (Tasks 7–11) and free-text new pages (Task 12), custom in-app review with side-by-side diff + one-click apply (Tasks 13–14), admin-via-allowlist (Task 4), field whitelist enforced on both submit and apply (Tasks 7/10/13), stale-base warning (Tasks 13–14), anti-abuse quota (Task 10), security gate (Task 15). All design sections map to a task.
- **Out of scope (per spec):** structured new-entity creation, tips/voting, notifications, recipe/loot-relation edits — none included, intentionally.
- **Type consistency:** `Diff`/`Change` (proposal-diff) consumed unchanged by proposal-apply and the admin page; `EditableField`/`coerceValue`/`fieldDef` shared across schema, actions, and apply; `SESSION_COOKIE`/`SESSION_TTL_MS` defined once in auth.ts and reused in the route handlers; `getEntityFields` returns the same `values` shape consumed by the form and the diff page.
