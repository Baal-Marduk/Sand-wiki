import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

// Lightweight current-user probe for client components (the server <AuthMenu>
// can't render inside the ssr:false tool pages). No caching: it's per-session.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { steamId: user.steamId, personaName: user.personaName, avatar: user.avatar },
  });
}
