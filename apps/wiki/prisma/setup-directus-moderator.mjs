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

if (!env.DIRECTUS_ADMIN_EMAIL || !env.DIRECTUS_ADMIN_PASSWORD)
  throw new Error("DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be set in .env");

// Content collections moderators may read/create/update (no delete).
// Keep in sync with the schema: add any new content collection here, then re-run.
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
