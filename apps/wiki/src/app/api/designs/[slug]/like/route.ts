// apps/wiki/src/app/api/designs/[slug]/like/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { likeDesign, unlikeDesign } from "@/lib/designs";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });
  try {
    const likeCount = await likeDesign(slug, session.steamId);
    return NextResponse.json({ liked: true, likeCount });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });
  try {
    const likeCount = await unlikeDesign(slug, session.steamId);
    return NextResponse.json({ liked: false, likeCount });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
