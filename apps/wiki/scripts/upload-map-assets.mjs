// Upload the /map 3D viewer assets (manifest.json, spawns.json, *.glb.gz) to Vercel Blob.
//
// The baked asset set (~500MB) is too large to commit to git, so it lives in Vercel
// Blob (public, CDN-backed) and the viewer reads it via NEXT_PUBLIC_MAP_ASSETS_BASE.
//
// Prerequisites:
//   1. A Vercel Blob store on the project (Dashboard → Storage → Blob, or
//      `vercel integration add`), which provisions BLOB_READ_WRITE_TOKEN.
//   2. That token available to this script. Either `vercel env pull .env.local`
//      then `npx dotenv -e .env.local -- node scripts/upload-map-assets.mjs`,
//      or export BLOB_READ_WRITE_TOKEN in your shell.
//   3. `npm i -D @vercel/blob` (already a devDependency).
//
// Usage (from apps/wiki):
//   node scripts/upload-map-assets.mjs [SRC_DIR]
//   SRC_DIR defaults to ./public/map (where a local bake was copied).
//
// It prints the NEXT_PUBLIC_MAP_ASSETS_BASE value to set in the Vercel project env
// (Production/Preview) and in your local .env.local to test against Blob.

import { put } from "@vercel/blob";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SRC = process.argv[2] || "public/map";
const PREFIX = "map"; // blob key prefix → base URL ends in ".../map/"

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    "BLOB_READ_WRITE_TOKEN is not set. Provision a Vercel Blob store, then\n" +
      "  vercel env pull .env.local\n" +
      "and run: npx dotenv -e .env.local -- node scripts/upload-map-assets.mjs",
  );
  process.exit(1);
}

const all = await readdir(SRC);
const files = all.filter(
  (f) => f.endsWith(".glb.gz") || f === "manifest.json" || f === "spawns.json",
);
if (files.length === 0) {
  console.error(`No assets found in ${SRC} (expected manifest.json, spawns.json, *.glb.gz).`);
  process.exit(1);
}

console.log(`Uploading ${files.length} file(s) from ${SRC} to Vercel Blob under "${PREFIX}/"…`);
let base = null;
for (const f of files) {
  const body = await readFile(path.join(SRC, f));
  // .glb.gz are already gzipped and are inflated in the browser by DecompressionStream,
  // so upload them as opaque bytes — NOT with Content-Encoding: gzip (that would make the
  // CDN auto-decompress and the viewer would then try to inflate plain GLB and fail).
  const contentType = f.endsWith(".json") ? "application/json" : "application/octet-stream";
  const { url } = await put(`${PREFIX}/${f}`, body, {
    access: "public",
    addRandomSuffix: false, // deterministic keys so manifest's bare filenames resolve
    allowOverwrite: true, // safe to re-run after a re-bake
    contentType,
  });
  base = url.slice(0, url.lastIndexOf("/") + 1);
  console.log(`  ✓ ${f} → ${url}`);
}

console.log("\nDone. Set this env var (Vercel project → Settings → Environment Variables,");
console.log("and in .env.local to test locally against Blob):\n");
console.log(`  NEXT_PUBLIC_MAP_ASSETS_BASE=${base}`);
console.log(
  "\nAfter uploading, spot-check one GLB is served WITHOUT `content-encoding: gzip`:",
);
console.log(`  curl -sI ${base}${files.find((f) => f.endsWith(".glb.gz")) ?? "<file>.glb.gz"} | grep -i content-encoding`);
console.log("(should print nothing — the viewer inflates the gzip itself).");
