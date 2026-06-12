// prisma/import-trampler-icons.mjs
// One-time importer: copies matched trampler part-icon PNGs from the sand-scraper out/
// snapshot into the wiki, and writes prisma/trampler-icons.json (slug -> rel png path).
// Usage (from sand-wiki/):  node prisma/import-trampler-icons.mjs [outDir]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Manifest rel path ("part-icons/<file>.png") -> wiki public path ("/tramplers/<file>.png"). */
export function publicIconPath(rel) {
  return "/tramplers/" + basename(rel);
}

// Importer body is skipped under test (vitest sets VITEST); only the pure fn is imported.
if (!process.env.VITEST) {
  if (!existsSync("prisma") || !existsSync("public")) {
    console.error("Run this from the sand-wiki/ directory (prisma/ and public/ not found).");
    process.exit(1);
  }
  const OUT =
    process.argv[2] ??
    join("..", ".claude", "worktrees", "sand-scraper-impl", "sand-scraper", "out");

  const manifest = JSON.parse(readFileSync(join(OUT, "trampler-icons.json"), "utf-8"));
  writeFileSync("prisma/trampler-icons.json", JSON.stringify(manifest, null, 2) + "\n");

  mkdirSync("public/tramplers", { recursive: true });
  let n = 0;
  for (const rel of Object.values(manifest)) {
    copyFileSync(join(OUT, rel), join("public", "tramplers", basename(rel)));
    n++;
  }
  console.log(`Imported trampler-icons.json and ${n} icons into public/tramplers/.`);
}
