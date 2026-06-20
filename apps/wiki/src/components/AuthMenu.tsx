import { FaSteam } from "react-icons/fa";
import { getUser } from "@/lib/auth";

const linkCls = "nav-link rounded px-2 py-1 text-sm font-semibold text-foreground hover:text-primary";

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

  return (
    <div className="flex items-center gap-2">
      {/* JS-free dropdown: <details> keeps this a server component. */}
      <details className="relative">
        <summary
          className={`${linkCls} inline-flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden`}
        >
          <FaSteam className="size-4" aria-hidden="true" />
          {user.personaName ?? "Signed in"}
          <span aria-hidden="true" className="text-xs opacity-60">▾</span>
        </summary>
        <ul className="absolute right-0 z-30 mt-2 min-w-40 border border-border-strong bg-card-elevated p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)]">
          <li>
            <a href="/gallery?view=mine" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-card hover:text-primary-hover">
              My designs
            </a>
          </li>
          <li>
            <form action="/api/auth/steam/logout" method="post">
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-card hover:text-primary-hover"
              >
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </details>
    </div>
  );
}
