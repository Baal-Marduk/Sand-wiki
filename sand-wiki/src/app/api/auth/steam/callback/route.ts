import { NextRequest, NextResponse } from "next/server";
import { verifyAssertion } from "@/lib/steam-openid";
import { signSession } from "@/lib/session";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const params = req.nextUrl.searchParams;

  // Guard: return_to must point back at our own callback (anti-replay/forgery).
  const expectedReturn = new URL("/api/auth/steam/callback", origin).toString();
  const returnedTo = params.get("openid.return_to") ?? "";
  if (!returnedTo.startsWith(expectedReturn)) {
    return NextResponse.redirect(new URL("/?auth=error", origin));
  }

  const steamId = await verifyAssertion(params);
  if (!steamId) return NextResponse.redirect(new URL("/?auth=error", origin));

  // Best-effort profile enrichment; failure must not block login.
  let personaName: string | null = null;
  let avatar: string | null = null;
  const key = process.env.STEAM_API_KEY;
  if (key) {
    try {
      const r = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`,
      );
      const j = await r.json();
      const p = j?.response?.players?.[0];
      if (p) {
        personaName = p.personaname ?? null;
        avatar = p.avatar ?? null;
      }
    } catch {
      /* ignore */
    }
  }

  await prisma.steamUser.upsert({
    where: { steamId },
    create: { steamId, personaName, avatar },
    update: { personaName, avatar, lastSeenAt: new Date() },
  });

  const secret = process.env.SESSION_SECRET!;
  const token = signSession({ steamId, exp: Date.now() + SESSION_TTL_MS }, secret);

  const requested = params.get("returnTo") ?? "/";
  const dest = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const res = NextResponse.redirect(new URL(dest, origin));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
