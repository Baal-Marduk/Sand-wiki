// apps/wiki/src/app/api/designs/[slug]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { getDesign, deleteDesign, setDesignStatus } from "@/lib/designs";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const d = await getDesign(slug);
  if (!d || d.status === "hidden") return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ design: d });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const d = await getDesign(slug);
  // Hidden designs are treated as gone for everyone (matches GET) — an owner
  // can't rename a design an admin has taken down.
  if (!d || d.status === "hidden") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (d.author.steamId !== session.steamId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  if (body.name) await prisma.design.update({ where: { slug }, data: { name: body.name.slice(0, 80) } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });
  const d = await getDesign(slug);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  const owner = d.author.steamId === session.steamId;
  const admin = isAdmin(session.steamId);
  if (!owner && !admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Admins "hide"; owners hard-delete their own.
  if (owner) await deleteDesign(slug);
  else await setDesignStatus(slug, "hidden");
  return NextResponse.json({ ok: true });
}
