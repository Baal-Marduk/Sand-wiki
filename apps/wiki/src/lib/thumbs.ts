// apps/wiki/src/lib/thumbs.ts
import { promises as fs } from "node:fs";
import path from "node:path";

const SAFE = /^[a-z0-9][a-z0-9-]*\.webp$/;
const MAX_BYTES = 400_000; // ~400KB cap per thumbnail

export function thumbsDir(): string {
  return process.env.THUMBS_DIR ?? path.join(process.cwd(), "uploads", "thumbs");
}

export function thumbFileName(slug: string): string {
  return `${slug}.webp`;
}

export function isSafeThumbName(name: string): boolean {
  return SAFE.test(name);
}

export function dataUrlToWebpBuffer(dataUrl: string): Buffer {
  const m = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) throw new Error("expected a base64 image/webp data URL");
  const buf = Buffer.from(m[1], "base64");
  if (buf.byteLength > MAX_BYTES) throw new Error("thumbnail too large");
  return buf;
}

export async function writeThumb(slug: string, dataUrl: string): Promise<string> {
  const buf = dataUrlToWebpBuffer(dataUrl);
  const name = thumbFileName(slug);
  // Defense-in-depth: never write a path that could escape thumbsDir, even if a
  // caller passes an unvalidated slug. Mirrors the read/delete guards.
  if (!isSafeThumbName(name)) throw new Error("unsafe thumbnail name");
  const dir = thumbsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buf);
  return `/api/uploads/thumbs/${name}`; // value stored in Design.thumbPath
}

export async function readThumb(name: string): Promise<Buffer | null> {
  if (!isSafeThumbName(name)) return null;
  try {
    return await fs.readFile(path.join(thumbsDir(), name));
  } catch {
    return null;
  }
}

export async function deleteThumb(name: string): Promise<void> {
  if (!isSafeThumbName(name)) return;
  await fs.rm(path.join(thumbsDir(), name), { force: true });
}
