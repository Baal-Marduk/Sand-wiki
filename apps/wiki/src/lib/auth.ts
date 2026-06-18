import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { verifySession, type SessionPayload } from "./session";

export const SESSION_COOKIE = "sand_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const MIN_SECRET_LENGTH = 32;

/** The session-signing secret, validated. Throws loudly if missing/weak so a
 *  misconfigured deploy fails fast and visibly rather than silently logging
 *  everyone out (reads) or 500ing mid-login (writes). */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET is missing or too short (need >= ${MIN_SECRET_LENGTH} chars). ` +
        `Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return secret;
}

/** Pure allowlist check — `csv` defaults to the ADMIN_STEAM_IDS env var. */
export function isAdmin(steamId: string, csv = process.env.ADMIN_STEAM_IDS): boolean {
  const ids = (csv ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(steamId);
}

export async function getSession(): Promise<SessionPayload | null> {
  const secret = getSessionSecret();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token, secret);
}

/** Boolean admin check for the current request. Safe in any Server Component:
 *  no session → false. Use to branch UI / pass into visibility-aware queries. */
export async function sessionIsAdmin(): Promise<boolean> {
  const session = await getSession();
  return !!session && isAdmin(session.steamId);
}

export async function getUser() {
  const session = await getSession();
  if (!session) return null;
  return prisma.steamUser.findUnique({ where: { steamId: session.steamId } });
}

/** Require a logged-in user; redirects to Steam login (with a return path) if absent. */
export async function requireUser(returnTo = "/"): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect(`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session;
}

/** Require an admin; redirects everyone else to home so /admin isn't usable. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || !isAdmin(session.steamId)) redirect("/");
  return session;
}
