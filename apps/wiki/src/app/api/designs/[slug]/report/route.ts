// apps/wiki/src/app/api/designs/[slug]/report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { reportDesign } from "@/lib/designs";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  try {
    await reportDesign(slug, session.steamId, body.reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Only a missing design is a 404; DB failures are genuine 500s.
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not found") return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
