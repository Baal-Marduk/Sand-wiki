import Link from "next/link";
import { FaSteam } from "react-icons/fa";
import { getUser, isAdmin } from "@/lib/auth";

const linkCls = "nav-link text-base-content px-2 py-1 rounded";

export async function AuthMenu() {
  const user = await getUser();

  if (!user) {
    return (
      <a href="/api/auth/steam/login" className={`${linkCls} inline-flex items-center gap-2`}>
        <FaSteam className="size-4" aria-hidden="true" />
        Sign in
      </a>
    );
  }

  const admin = isAdmin(user.steamId);
  return (
    <div className="flex items-center gap-2">
      {admin && (
        <Link href="/admin/proposals" className={linkCls}>
          Review
        </Link>
      )}
      {/* JS-free dropdown: <details> keeps this a server component. */}
      <details className="dropdown dropdown-end">
        <summary className={`${linkCls} inline-flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <FaSteam className="size-4" aria-hidden="true" />
          {user.personaName ?? "Signed in"}
          <span aria-hidden="true" className="text-xs opacity-60">▾</span>
        </summary>
        <ul className="dropdown-content menu z-20 mt-2 w-40 rounded-box border border-base-300 bg-base-200 p-2 shadow">
          <li>
            <form action="/api/auth/steam/logout" method="post">
              <button type="submit" className="w-full cursor-pointer text-left">
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </details>
    </div>
  );
}
