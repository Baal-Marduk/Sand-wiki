// One-time importer: copies the sand-scraper out/ snapshot into the wiki.
// Usage (from sand-wiki/):  node prisma/import-scraper-assets.mjs [outDir]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const OUT = process.argv[2] ?? join("..", ".claude", "worktrees", "sand-scraper-impl", "sand-scraper", "out");

// 1. data.json (items now carry displayName + description)
writeFileSync("prisma/data.json", readFileSync(join(OUT, "data.json"), "utf-8"));

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
