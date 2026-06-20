// Asset base for the builder's meshes / textures / thumbnails.
// Set NEXT_PUBLIC_SAND_ASSET_BASE to the Vercel Blob base URL in production.
// The builder fetches `meshes3/<id>.bin`, `tex3/<n>.png` and thumbnail PNGs
// relative to this base.
const BASE = (process.env.NEXT_PUBLIC_SAND_ASSET_BASE || "/sand-assets").replace(/\/+$/, "") + "/";

export function asset(path) {
  return BASE + String(path).replace(/^\/+/, "");
}
