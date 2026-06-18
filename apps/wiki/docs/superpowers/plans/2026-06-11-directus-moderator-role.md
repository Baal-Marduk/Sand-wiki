# Directus Moderator Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision an idempotent "Moderator" role in Directus (role + policy + permissions + access link) so trusted moderators can edit and add wiki content via the Studio — no delete, no admin.

**Architecture:** A standalone Node script, `prisma/setup-directus-moderator.mjs`, following the existing `sync-directus-icons.mjs` convention (parse `.env`, log in as admin via REST, reconcile via find-or-create). Roles/policies/permissions are Directus *data* (not in the schema snapshot), so the script is their source of truth. Re-running is a no-op.

**Tech Stack:** Directus 11.17.4 REST API, Node 20+ (`fetch`, `node:fs`), run via `node` / an npm script. No app code, no Prisma.

**Preconditions:** Local Directus reachable at `http://localhost:8055` (`npm run directus:up`); `.env` has `DIRECTUS_ADMIN_EMAIL` and `DIRECTUS_ADMIN_PASSWORD`. (Confirmed reachable during planning: health 200; only `Administrator` role/policy exist.)

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `prisma/setup-directus-moderator.mjs` | Idempotent role/policy/permissions/access provisioner | Create |
| `package.json` | Add `directus:moderator` convenience script | Modify (scripts block) |
| `instructions.md` | Document the role + how to run + how to invite moderators | Modify (Backoffice section) |

**Directus 11 model (verified against the live instance):** access flags (`app_access`, `admin_access`, `enforce_tfa`) live on `directus_policies`; `directus_permissions` rows attach to a policy with shape `{ policy, collection, action, fields, permissions, validation, presets }`; `directus_access` links `{ role, policy }`.

---

## Setup

- [ ] **Create a working branch**

Repo root is `d:\Documents\SandLabs` (branch `master`); app in `sand-wiki/`.

Run:
```bash
git switch -c feat/directus-moderator-role
```

---

## Task 1: The provisioning script

**Files:**
- Create: `sand-wiki/prisma/setup-directus-moderator.mjs`
- Modify: `sand-wiki/package.json` (scripts)

- [ ] **Step 1: Write the script**

Create `sand-wiki/prisma/setup-directus-moderator.mjs` with exactly:

```js
/**
 * Creates (idempotently) a "Moderator" role in Directus: role + policy + permissions +
 * access link. Lets trusted moderators edit and add wiki content via the Studio — read,
 * create, update on the content collections + read/create on files (icons). No delete,
 * no admin. Roles/policies/permissions are Directus *data*, not captured by the schema
 * snapshot, so this script is their source of truth. Safe to re-run (find-or-create).
 *
 *   node prisma/setup-directus-moderator.mjs        (or: npm run directus:moderator)
 *
 * Requires local Directus up (npm run directus:up) and DIRECTUS_ADMIN_EMAIL /
 * DIRECTUS_ADMIN_PASSWORD in .env. Inviting individual moderators stays a manual Studio
 * action: User Directory -> invite -> assign the "Moderator" role.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const DIRECTUS_URL = env.DIRECTUS_URL ?? "http://localhost:8055";

// Content collections moderators may read/create/update (no delete).
const CONTENT_COLLECTIONS = [
  "Item", "EnvEntity", "TramplerPart", "Recipe", "RecipeInput",
  "RecipeOutput", "LootTier", "LootEntry", "TramplerPartCost",
];
const CONTENT_ACTIONS = ["read", "create", "update"];
const FILE_ACTIONS = ["read", "create"]; // pick existing icons + upload new ones

async function api(path, init = {}, token) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** The desired (collection, action) permission pairs. */
function desiredPermissions() {
  const pairs = [];
  for (const collection of CONTENT_COLLECTIONS)
    for (const action of CONTENT_ACTIONS) pairs.push({ collection, action });
  for (const action of FILE_ACTIONS) pairs.push({ collection: "directus_files", action });
  return pairs;
}

async function main() {
  const login = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: env.DIRECTUS_ADMIN_EMAIL, password: env.DIRECTUS_ADMIN_PASSWORD }),
  });
  const token = login.data.access_token;

  // 1. Policy (find-or-create by name)
  const policyFound = await api(`/policies?filter[name][_eq]=Moderator&limit=1&fields=id`, {}, token);
  let policyId = policyFound.data[0]?.id;
  const policyCreated = !policyId;
  if (!policyId) {
    const created = await api("/policies", {
      method: "POST",
      body: JSON.stringify({
        name: "Moderator",
        icon: "shield",
        description: "Edit and add wiki content; no delete, no admin.",
        app_access: true,
        admin_access: false,
        enforce_tfa: false,
      }),
    }, token);
    policyId = created.data.id;
  }

  // 2. Permissions (create-missing only; never deletes stray rows)
  const existing = await api(
    `/permissions?filter[policy][_eq]=${policyId}&limit=-1&fields=collection,action`, {}, token,
  );
  const have = new Set(existing.data.map((p) => `${p.collection}:${p.action}`));
  let added = 0;
  for (const { collection, action } of desiredPermissions()) {
    if (have.has(`${collection}:${action}`)) continue;
    await api("/permissions", {
      method: "POST",
      body: JSON.stringify({
        policy: policyId, collection, action,
        fields: ["*"], permissions: {}, validation: null, presets: null,
      }),
    }, token);
    added++;
  }

  // 3. Role (find-or-create by name)
  const roleFound = await api(`/roles?filter[name][_eq]=Moderator&limit=1&fields=id`, {}, token);
  let roleId = roleFound.data[0]?.id;
  const roleCreated = !roleId;
  if (!roleId) {
    const created = await api("/roles", {
      method: "POST",
      body: JSON.stringify({ name: "Moderator", icon: "shield", description: "Wiki content moderators." }),
    }, token);
    roleId = created.data.id;
  }

  // 4. Access link role -> policy (find-or-create)
  const accessFound = await api(
    `/access?filter[role][_eq]=${roleId}&filter[policy][_eq]=${policyId}&limit=1&fields=id`, {}, token,
  );
  const accessCreated = !accessFound.data[0];
  if (accessCreated) {
    await api("/access", { method: "POST", body: JSON.stringify({ role: roleId, policy: policyId }) }, token);
  }

  console.log(
    `Moderator role: policy ${policyCreated ? "created" : "reused"}, ` +
    `${added} permissions added (${have.size} already present), ` +
    `role ${roleCreated ? "created" : "reused"}, ` +
    `access link ${accessCreated ? "created" : "reused"}.`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm convenience script**

In `sand-wiki/package.json`, add this line to the `scripts` block, right after the `"directus:apply"` entry (add a comma to the preceding line):

```json
    "directus:moderator": "node prisma/setup-directus-moderator.mjs",
```

- [ ] **Step 3: Ensure Directus is up, then run the script**

Run:
```bash
cd /d/Documents/SandLabs/sand-wiki && npm run directus:moderator
```
Expected output (first run):
```
Moderator role: policy created, 29 permissions added (0 already present), role created, access link created.
```
If it errors with a connection refusal, start Directus first (`npm run directus:up`, wait ~10s for cold boot) and re-run.

- [ ] **Step 4: Verify the created role via the API**

Run this verification (logs in, prints the role, policy flags, permission count, and asserts no `delete`/`share` action exists):
```bash
cd /d/Documents/SandLabs/sand-wiki
EMAIL=$(grep -E "^DIRECTUS_ADMIN_EMAIL=" .env | sed 's/^[^=]*=//; s/^"//; s/"$//')
PASS=$(grep -E "^DIRECTUS_ADMIN_PASSWORD=" .env | sed 's/^[^=]*=//; s/^"//; s/"$//')
TOKEN=$(curl -s -X POST http://localhost:8055/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.access_token))")
echo "POLICY:"; curl -s "http://localhost:8055/policies?filter[name][_eq]=Moderator&fields=id,name,app_access,admin_access" -H "Authorization: Bearer $TOKEN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).data)))"
PID=$(curl -s "http://localhost:8055/policies?filter[name][_eq]=Moderator&fields=id" -H "Authorization: Bearer $TOKEN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data[0].id))")
echo "PERMISSIONS (count + any delete/share?):"
curl -s "http://localhost:8055/permissions?filter[policy][_eq]=$PID&limit=-1&fields=collection,action" -H "Authorization: Bearer $TOKEN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s).data;console.log('count',d.length);console.log('forbidden actions present:',d.filter(p=>p.action==='delete'||p.action==='share').length)})"
```
Expected:
- POLICY: one row, `app_access: true`, `admin_access: false`.
- PERMISSIONS: `count 29`, `forbidden actions present: 0`.

- [ ] **Step 5: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki
git add prisma/setup-directus-moderator.mjs package.json
git commit -m "feat(wiki): Directus Moderator role provisioning script"
```
(Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task 2: Idempotency verification

**Files:** none (verification only)

- [ ] **Step 1: Run the script a second time**

Run:
```bash
cd /d/Documents/SandLabs/sand-wiki && npm run directus:moderator
```
Expected output:
```
Moderator role: policy reused, 0 permissions added (29 already present), role reused, access link reused.
```

- [ ] **Step 2: Assert no duplicates via the API**

Run (reusing a fresh token):
```bash
cd /d/Documents/SandLabs/sand-wiki
EMAIL=$(grep -E "^DIRECTUS_ADMIN_EMAIL=" .env | sed 's/^[^=]*=//; s/^"//; s/"$//')
PASS=$(grep -E "^DIRECTUS_ADMIN_PASSWORD=" .env | sed 's/^[^=]*=//; s/^"//; s/"$//')
TOKEN=$(curl -s -X POST http://localhost:8055/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.access_token))")
for q in "roles?filter[name][_eq]=Moderator" "policies?filter[name][_eq]=Moderator"; do
  echo -n "$q -> count "
  curl -s "http://localhost:8055/$q&fields=id&limit=-1" -H "Authorization: Bearer $TOKEN" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.length))"
done
```
Expected: each prints `count 1` (exactly one Moderator role, one Moderator policy). Combined with Task 1 Step 4 (`count 29` permissions still), this confirms re-running created nothing.

---

## Task 3: Documentation

**Files:**
- Modify: `sand-wiki/instructions.md` (Backoffice section)

- [ ] **Step 1: Add a Moderator-role bullet**

In `sand-wiki/instructions.md`, in the `## Backoffice (Directus, local Docker)` section, add this bullet immediately after the line that ends `...is tracked in \`TODO.md\`.` (the end of the "Icons render in the Studio" bullet, around line 109):

```markdown
- **Moderator role**: `npm run directus:moderator` provisions (idempotently) a `Moderator`
  role + policy granting read/create/update on the content collections and read/create on
  files (icons) — **no delete, no admin**. Roles/policies/permissions are Directus *data*,
  not in `snapshot.yaml`, so this script is their source of truth; re-run it after a fresh
  Directus DB. Add a person as a moderator in the Studio: User Directory → invite → assign
  the `Moderator` role (per-user invites are not scripted). Caveat: moderator-*created* rows
  are still pruned by `npm run db:seed` until the corrections workflow (TODO #15–16) lands —
  edits to scraped rows survive, brand-new entities do not.
```

- [ ] **Step 2: Commit**

```bash
cd /d/Documents/SandLabs/sand-wiki
git add instructions.md
git commit -m "docs(wiki): document the Directus Moderator role + invite flow"
```

---

## Self-Review Notes

- **Spec coverage:** Policy with app/no-admin access (Task 1 script step 1, verified step 4); 29 permissions = 9 content collections × {read,create,update} + files × {read,create}, no delete (script + verification); role + access link (script + verification); idempotent find-or-create provisioning (Task 1 + Task 2); out-of-scope user invites documented (Task 3); verification steps map to the spec's Verification section (Tasks 1–2 API checks; manual smoke test left to the operator and documented in Task 3).
- **Placeholder scan:** none — full script and exact commands provided.
- **Consistency:** collection/action names, the 29 count, and the `{policy, collection, action, fields, permissions, validation, presets}` permission shape match the live-verified API and are used identically in the script and the verification asserts.
- **Note:** there is no unit test (the script integrates with a live Directus); verification is via API assertions, consistent with the spec.
