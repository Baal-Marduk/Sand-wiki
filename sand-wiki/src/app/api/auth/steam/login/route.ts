import { NextRequest, NextResponse } from "next/server";
import { buildSteamLoginUrl } from "@/lib/steam-openid";

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  // Only allow same-origin relative return paths (no open redirect).
  const requested = req.nextUrl.searchParams.get("returnTo") ?? "/";
  const returnPath = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const callback = new URL("/api/auth/steam/callback", origin);
  callback.searchParams.set("returnTo", returnPath);
  return NextResponse.redirect(buildSteamLoginUrl(origin, callback.toString()));
}
