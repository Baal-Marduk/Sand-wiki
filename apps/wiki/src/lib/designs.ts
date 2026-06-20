import { prisma } from "@/lib/db";
import { decodeShare, buildSummary } from "@/components/builder/builderCore.js";
import { writeThumb, thumbFileName, deleteThumb } from "@/lib/thumbs";

const SUFFIX = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars (0/o, 1/l/i)

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

/** Decodes and re-derives stats; throws on malformed codes. Never trusts client stats. */
export function validateBuildCode(buildCode: string) {
  const state = decodeShare(buildCode); // throws if not a SANDBP2 code
  if (!state || typeof state !== "object" || !Array.isArray(state.placements)) {
    throw new Error("build code has no placements");
  }
  const summary = buildSummary(state);
  return { state, summary };
}

export type DesignListItem = {
  slug: string;
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
  // Write the thumbnail BEFORE create so a write failure aborts the publish.
  let thumbPath: string | null = null;
  if (opts.thumbnailDataUrl) {
    thumbPath = await writeThumb(slug, opts.thumbnailDataUrl);
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
    include: { author: { select: { personaName: true } } },
  });
  const nextCursor = rows.length > PAGE ? rows[PAGE].id : null;
  const items: DesignListItem[] = rows.slice(0, PAGE).map((d) => ({
    slug: d.slug,
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
  return prisma.design.findUnique({
    where: { slug },
    include: {
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

export async function reportDesign(
  slug: string,
  reporterId: string,
  reason?: string,
): Promise<void> {
  const d = await prisma.design.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!d) throw new Error("not found");
  await prisma.designReport.create({
    data: { designId: d.id, reporterId, reason: reason?.slice(0, 500) },
  });
}

export async function setDesignStatus(
  slug: string,
  status: "published" | "hidden",
): Promise<void> {
  await prisma.design.update({ where: { slug }, data: { status } });
}

export async function deleteDesign(slug: string): Promise<void> {
  const d = await prisma.design.findUnique({
    where: { slug },
    select: { thumbPath: true },
  });
  await prisma.design.delete({ where: { slug } });
  // Best-effort thumbnail cleanup (deleteThumb swallows missing files / unsafe names).
  if (d?.thumbPath) await deleteThumb(thumbFileName(slug));
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
