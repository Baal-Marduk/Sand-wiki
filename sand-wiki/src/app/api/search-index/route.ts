import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Lightweight index of all items for client-side search autocomplete. */
export async function GET() {
  const items = await prisma.item.findMany({
    select: { slug: true, name: true, category: true, derivedName: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(items, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
