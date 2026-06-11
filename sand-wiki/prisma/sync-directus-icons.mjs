/**
 * Mirrors app sprite assets (public/<icon path>) into Directus file storage and
 * points each row's `iconFile` at the uploaded file, so the Studio's cards/image
 * views can render them (Directus layouts only accept directus_files relations).
 *
 * The app itself never reads `iconFile` — `icon` stays the source of truth.
 * Idempotent: files are matched by filename, rows only updated when the id differs.
 * Re-run after any asset import that adds/changes icons:  npx tsx prisma/sync-directus-icons.mjs
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const DIRECTUS_URL = env.DIRECTUS_URL ?? "http://localhost:8055";

const prisma = new PrismaClient();

async function api(path, init = {}, token) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const login = await api("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.DIRECTUS_ADMIN_EMAIL, password: env.DIRECTUS_ADMIN_PASSWORD }),
  });
  const token = login.data.access_token;

  /** filename_download -> file id, for everything already uploaded */
  const known = new Map();
  for (let page = 1; ; page++) {
    const { data } = await api(`/files?fields=id,filename_download&limit=100&page=${page}`, {}, token);
    for (const f of data) known.set(f.filename_download, f.id);
    if (data.length < 100) break;
  }

  const fileIdFor = async (iconPath) => {
    const name = basename(iconPath);
    if (known.has(name)) return known.get(name);
    const abs = join(root, "public", iconPath);
    if (!existsSync(abs)) {
      console.warn(`missing asset on disk, skipped: public${iconPath}`);
      return null;
    }
    const form = new FormData();
    form.append("title", name.replace(/\.[a-z]+$/i, ""));
    form.append("file", new Blob([readFileSync(abs)], { type: "image/png" }), name);
    const up = await api("/files", { method: "POST", body: form }, token);
    known.set(name, up.data.id);
    return up.data.id;
  };

  let uploaded = 0, linked = 0, skipped = 0;
  for (const model of ["item", "envEntity", "tramplerPart"]) {
    const rows = await prisma[model].findMany({
      where: { icon: { not: null } },
      select: { id: true, icon: true, iconFile: true },
    });
    for (const r of rows) {
      const before = known.size;
      const fileId = await fileIdFor(r.icon);
      if (!fileId) { skipped++; continue; }
      if (known.size > before) uploaded++;
      if (r.iconFile !== fileId) {
        await prisma[model].update({ where: { id: r.id }, data: { iconFile: fileId } });
        linked++;
      }
    }
  }
  console.log(`Synced icons -> Directus: ${uploaded} uploaded, ${linked} rows linked, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
