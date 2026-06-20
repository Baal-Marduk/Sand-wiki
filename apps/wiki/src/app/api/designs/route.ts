// apps/wiki/src/app/api/designs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createDesign, listDesigns } from "@/lib/designs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") === "mine" ? "mine" : "community";
  const sort = sp.get("sort") === "new" ? "new" : "top";
  const cursor = sp.get("cursor");
  const session = await getSession();
  // "mine" requires a session; both views pass viewerId so each item's `isMine`
  // (owner-only delete control) can be computed.
  if (view === "mine" && !session) {
    return NextResponse.json({ items: [], nextCursor: null });
  }
  const viewerId = session?.steamId ?? null;
  const data = await listDesigns({ view, sort, cursor, viewerId });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth required" }, { status: 401 });
  let body: { name?: string; buildCode?: string; thumbnail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.buildCode) return NextResponse.json({ error: "buildCode required" }, { status: 400 });
  try {
    const design = await createDesign({
      authorId: session.steamId,
      name: body.name ?? "Untitled Rig",
      buildCode: body.buildCode,
      thumbnailDataUrl: body.thumbnail,
    });
    return NextResponse.json({ slug: design.slug }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "publish failed";
    // Client errors (bad build code / bad thumbnail) → 400; everything else
    // (fs/DB failure) is a server error → 500, so ops can see real failures.
    // validateBuildCode tags all malformed-input cases with "build code"; the
    // thumbnail decoder's messages contain "thumbnail"/"base64".
    const isClientError =
      msg.includes("build code") || msg.includes("thumbnail") || msg.includes("base64");
    return NextResponse.json({ error: msg }, { status: isClientError ? 400 : 500 });
  }
}
