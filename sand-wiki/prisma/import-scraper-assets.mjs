// One-time importer: copies the sand-scraper out/ snapshot into the wiki.
// Usage (from sand-wiki/):  node prisma/import-scraper-assets.mjs [outDir]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// Writes are relative to the wiki root; bail loudly if run from elsewhere.
if (!existsSync("prisma") || !existsSync("public")) {
  console.error("Run this from the sand-wiki/ directory (prisma/ and public/ not found).");
  process.exit(1);
}

const OUT = process.argv[2] ?? join("..", ".claude", "worktrees", "sand-scraper-impl", "sand-scraper", "out");

// 1. data.json (items now carry displayName + description) — verbatim byte copy
copyFileSync(join(OUT, "data.json"), "prisma/data.json");

// 2. icons.json (itemId -> "icons/icon_*.png"); keep next to the seed
const icons = JSON.parse(readFileSync(join(OUT, "icons.json"), "utf-8"));
writeFileSync("prisma/icons.json", JSON.stringify(icons, null, 2) + "\n");

// 3. copy only the matched PNGs into public/icons/
mkdirSync("public/icons", { recursive: true });
let n = 0;
for (const rel of Object.values(icons)) {
  copyFileSync(join(OUT, rel), join("public", "icons", basename(rel)));
  n++;
}
console.log(`Imported data.json + icons.json and ${n} icons.`);
