import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Lightweight index for client-side search autocomplete: all items plus the
 *  environment entities (loot containers + landmarks) that get their own dropdown groups. */
export async function GET() {
  const [items, places] = await Promise.all([
    prisma.entity.findMany({
      where: { kind: "item" },
      select: { slug: true, name: true, category: true, derivedName: true },
      orderBy: { name: "asc" },
    }),
    prisma.entity.findMany({
      where: { kind: "environment", category: { in: ["loot-containers", "landmarks"] } },
      select: { slug: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return NextResponse.json({ items, places }, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
