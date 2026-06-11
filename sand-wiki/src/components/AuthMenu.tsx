import { getUser, isAdmin } from "@/lib/auth";

const linkCls = "nav-link text-base-content px-2 py-1 rounded";

export async function AuthMenu() {
  const user = await getUser();

  if (!user) {
    return (
      <a href="/api/auth/steam/login" className={linkCls}>
        Sign in
      </a>
    );
  }

  const admin = isAdmin(user.steamId);
  return (
    <div className="flex items-center gap-2">
      {admin && (
        <a href="/admin/proposals" className={linkCls}>
          Review
        </a>
      )}
      <span className="text-sm text-base-content/70">{user.personaName ?? "Signed in"}</span>
      <form action="/api/auth/steam/logout" method="post">
        <button type="submit" className={`${linkCls} cursor-pointer`}>
          Sign out
        </button>
      </form>
    </div>
  );
}
