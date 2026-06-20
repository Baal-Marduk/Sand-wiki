// apps/wiki/src/lib/thumbs.ts
// Thumbnails are stored as bytes in Postgres (Design.thumbnail), not on disk —
// the file approach fails on read-only/serverless filesystems. This module is
// now just the decode + size-cap of the client-supplied data URL.

const MAX_BYTES = 400_000; // ~400KB cap per thumbnail

/** Decodes a `data:image/webp;base64,...` URL to a Buffer, rejecting non-webp
 *  payloads and anything over the size cap. Throws on bad input (client 4xx). */
export function dataUrlToWebpBuffer(dataUrl: string): Buffer {
  const m = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) throw new Error("expected a base64 image/webp data URL");
  const buf = Buffer.from(m[1], "base64");
  if (buf.byteLength > MAX_BYTES) throw new Error("thumbnail too large");
  return buf;
}
