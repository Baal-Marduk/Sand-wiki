// apps/wiki/src/app/api/designs/[slug]/thumb/route.ts
// Serves a design's thumbnail bytes straight from Postgres (Design.thumbnail).
// Replaces the old filesystem serve route, which broke on read-only/serverless FS.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const d = await prisma.design.findUnique({
    where: { slug },
    select: { thumbnail: true, status: true },
  });
  // Hidden designs (and missing/thumbnail-less ones) 404 — consistent with the
  // detail page treating hidden as gone.
  if (!d || !d.thumbnail || d.status === "hidden") {
    return new NextResponse("not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(d.thumbnail), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
