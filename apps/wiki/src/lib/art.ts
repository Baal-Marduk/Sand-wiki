// Press-kit key art, optimized to responsive webp under /public/art/optimized
// (regenerate with `node scripts/optimize-art.mjs` from the source PNGs, which
// are git-ignored). Returns the <img> props for a full-bleed art backdrop.
export function artBackdrop(slug: string) {
  const base = `/art/optimized/${slug}`;
  return {
    src: `${base}-2400.webp`,
    srcSet: `${base}-960.webp 960w, ${base}-1600.webp 1600w, ${base}-2400.webp 2400w`,
    sizes: "100vw",
  } as const;
}
