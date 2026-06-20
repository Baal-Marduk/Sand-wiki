// apps/wiki/src/app/api/uploads/thumbs/[file]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readThumb } from "@/lib/thumbs";

export const dynamic = "force-dynamic"; // filesystem-served; never statically analysed/exported
type Ctx = { params: Promise<{ file: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { file } = await params;
  const buf = await readThumb(file); // returns null for unsafe names / missing files
  if (!buf) return new NextResponse("not found", { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" },
  });
}
