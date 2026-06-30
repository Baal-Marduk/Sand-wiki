// Regenerate the responsive webp derivatives served as full-bleed art backdrops
// (home hero, section banners, About, 404). The source press-kit PNG/JPGs live in
// public/art/ but are git-ignored (~166MB); only the small webps under
// public/art/optimized/ are committed. Run from the wiki package:
//
//   node scripts/optimize-art.mjs
//
// `art` slugs here must match the strings passed to <SectionBanner art=…> and
// artBackdrop() in src/lib/art.ts.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const ART = "public/art";
const OUT = `${ART}/optimized`;
const WIDTHS = [2400, 1600, 960];

// source filename (under public/art) -> output slug
const JOBS = [
  ["02_To the next island.png", "hero-towards-island"],
  ["01_Players walker.png", "walker"],
  ["04_Azure island.png", "azure-island"],
  ["05_Arrival at the cargo port.png", "cargo-port"],
  ["07_Shootout.png", "shootout"],
  ["00_Sea bottom.png", "sea-bottom"],
];

mkdirSync(OUT, { recursive: true });
for (const [src, slug] of JOBS) {
  for (const w of WIDTHS) {
    const out = `${OUT}/${slug}-${w}.webp`;
    const info = await sharp(`${ART}/${src}`).resize({ width: w }).webp({ quality: 80 }).toFile(out);
    console.log(out.padEnd(54), `${(info.size / 1024).toFixed(0)}KB`);
  }
}
