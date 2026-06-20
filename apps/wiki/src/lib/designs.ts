import { prisma } from "@/lib/db";
import { decodeShare, buildSummary } from "@/components/builder/builderCore.js";
import { dataUrlToWebpBuffer } from "@/lib/thumbs";

const SUFFIX = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars (0 o 1 l i)

export function slugifyName(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, ""); // a trailing hyphen could survive the slice
  return s || "rig";
}

export function makeSlug(name: string): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += SUFFIX[Math.floor(Math.random() * SUFFIX.length)];
  }
  return `${slugifyName(name)}-${suffix}`;
}

// A generous ceiling for a serialized build (SANDBP2.<base64-json>). Real builds
// are a few KB; this just stops an authenticated client from forcing a multi-MB
// base64 decode + JSON parse + row write. All "build code" errors are client 4xx.
const MAX_BUILD_CODE_LENGTH = 100_000;

/** Decodes and re-derives stats; throws a tagged "build code" error on any malformed
 *  input (so the API maps it to 400, not 500). Never trusts client stats. */
export function validateBuildCode(buildCode: string) {
  if (typeof buildCode !== "string" || buildCode.length > MAX_BUILD_CODE_LENGTH) {
    throw new Error("build code too large");
  }
  let state;
  try {
    state = decodeShare(buildCode); // throws if not a SANDBP2 code / bad base64 / bad JSON
  } catch {
    throw new Error("invalid build code");
  }
  if (!state || typeof state !== "object" || !Array.isArray(state.placements)) {
    throw new Error("build code has no placements");
  }
  const summary = buildSummary(state);
  return { state, summary };
}

export type DesignListItem = {
  slug: string;
  buildCode: string;
  name: string;
  authorName: string | null;
  chassisId: string;
  partCount: number;
  crowns: number;
  hull: number;
  thumbPath: string | null;
  likeCount: number;
  createdAt: Date;
  status: string;
};

const PAGE = 24;

export async function createDesign(opts: {
  authorId: string;
  name: string;
  buildCode: string;
  thumbnailDataUrl?: string;
}) {
  const { state, summary } = validateBuildCode(opts.buildCode);
  const name = (opts.name || "Untitled Rig").slice(0, 80);
  const slug = makeSlug(name);
  // Decode the thumbnail to bytes (throws on bad input, aborting the publish).
  // Stored in-DB; thumbPath is the public serve URL the gallery <img> points at.
  let thumbnail: Uint8Array<ArrayBuffer> | null = null;
  let thumbPath: string | null = null;
  if (opts.thumbnailDataUrl) {
    // Prisma's Bytes input wants Uint8Array<ArrayBuffer>; a Node Buffer is backed
    // by ArrayBufferLike, so copy into a fresh plain-ArrayBuffer-backed array.
    const buf = dataUrlToWebpBuffer(opts.thumbnailDataUrl);
    const bytes = new Uint8Array(buf.byteLength);
    bytes.set(buf);
    thumbnail = bytes;
    thumbPath = `/api/designs/${slug}/thumb`;
  }
  return prisma.design.create({
    data: {
      slug,
      name,
      authorId: opts.authorId,
      buildCode: opts.buildCode,
      chassisId: state.chassisId, // raw id from the validated build state, not the label
      partCount: summary.partCount,
      crowns: summary.crowns,
      hull: summary.hull,
      thumbPath,
      thumbnail,
      status: "published",
      likeCount: 0,
    },
  });
}

export async function listDesigns(opts: {
  view: "community" | "mine";
  sort: "top" | "new";
  cursor?: string | null;
  viewerId?: string | null;
}): Promise<{ items: DesignListItem[]; nextCursor: string | null }> {
  // "mine" shows the viewer's own designs (incl. admin-hidden ones so they know);
  // "community" shows only published designs.
  const where =
    opts.view === "mine"
      ? { authorId: opts.viewerId ?? "__none__" }
      : { status: "published" };
  const orderBy =
    opts.sort === "new"
      ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
      : [{ likeCount: "desc" as const }, { id: "desc" as const }];
  const rows = await prisma.design.findMany({
    where,
    orderBy,
    take: PAGE + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    // Explicit select — never pull the (large) `thumbnail` bytes into a list
    // query. `buildCode` IS pulled now: the gallery cards compute the full build
    // cost from it and hand it off to the builder ("open design"). Build codes
    // are a few KB each, so a page of 24 stays small.
    select: {
      id: true,
      slug: true,
      buildCode: true,
      name: true,
      chassisId: true,
      partCount: true,
      crowns: true,
      hull: true,
      thumbPath: true,
      likeCount: true,
      createdAt: true,
      status: true,
      author: { select: { personaName: true } },
    },
  });
  const nextCursor = rows.length > PAGE ? rows[PAGE].id : null;
  const items: DesignListItem[] = rows.slice(0, PAGE).map((d) => ({
    slug: d.slug,
    buildCode: d.buildCode,
    name: d.name,
    authorName: d.author?.personaName ?? null,
    chassisId: d.chassisId,
    partCount: d.partCount,
    crowns: d.crowns,
    hull: d.hull,
    thumbPath: d.thumbPath,
    likeCount: d.likeCount,
    createdAt: d.createdAt,
    status: d.status,
  }));
  return { items, nextCursor };
}

export async function getDesign(slug: string) {
  // Explicit select so the (large) `thumbnail` bytes are never loaded for the
  // detail page / ownership checks — the thumbnail is served by its own route.
  return prisma.design.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      buildCode: true,
      chassisId: true,
      partCount: true,
      crowns: true,
      hull: true,
      thumbPath: true,
      status: true,
      likeCount: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      author: { select: { steamId: true, personaName: true, avatar: true } },
    },
  });
}

/** Idempotent like. Liking twice creates one row and increments once. Returns the new likeCount. */
export async function likeDesign(slug: string, userId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const d = await tx.design.findUnique({
      where: { slug },
      select: { id: true, likeCount: true },
    });
    if (!d) throw new Error("not found");
    const existing = await tx.designLike.findUnique({
      where: { designId_userId: { designId: d.id, userId } },
    });
    if (existing) return d.likeCount; // already liked — no-op
    await tx.designLike.create({ data: { designId: d.id, userId } });
    const updated = await tx.design.update({
      where: { id: d.id },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return updated.likeCount;
  });
}

/** Idempotent unlike. Unliking with no existing like is a no-op. Returns the new likeCount. */
export async function unlikeDesign(slug: string, userId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const d = await tx.design.findUnique({
      where: { slug },
      select: { id: true, likeCount: true },
    });
    if (!d) throw new Error("not found");
    const existing = await tx.designLike.findUnique({
      where: { designId_userId: { designId: d.id, userId } },
    });
    if (!existing) return d.likeCount; // not liked — no-op
    await tx.designLike.delete({
      where: { designId_userId: { designId: d.id, userId } },
    });
    const updated = await tx.design.update({
      where: { id: d.id },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
    return updated.likeCount;
  });
}

export async function setDesignStatus(
  slug: string,
  status: "published" | "hidden",
): Promise<void> {
  await prisma.design.update({ where: { slug }, data: { status } });
}

export async function deleteDesign(slug: string): Promise<void> {
  const d = await prisma.design.findUnique({ where: { slug }, select: { id: true } });
  if (!d) return; // already gone — no-op rather than throwing P2025
  // Deleting the row drops the in-DB thumbnail bytes with it; no file cleanup needed.
  await prisma.design.delete({ where: { slug } });
}

export async function hasLiked(slug: string, userId: string): Promise<boolean> {
  const d = await prisma.design.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!d) return false;
  const like = await prisma.designLike.findUnique({
    where: { designId_userId: { designId: d.id, userId } },
  });
  return !!like;
}
