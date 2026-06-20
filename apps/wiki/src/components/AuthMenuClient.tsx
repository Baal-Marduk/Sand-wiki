"use client";
import { useEffect, useRef, useState } from "react";
import { FaSteam } from "react-icons/fa";

type Me = { steamId: string; personaName: string | null; avatar: string | null };
const linkCls =
  "nav-link rounded px-2 py-1 text-sm font-semibold text-foreground hover:text-primary";

export function AuthMenuClient() {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive) { setUser(d.user); setReady(true); } })
      .catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [open]);

  if (!ready) return <span className="w-20" aria-hidden="true" />;

  // Client-only: this line is always reached after the `ready` flag (set by useEffect) resolves, so window is guaranteed to exist.
  const returnTo = window.location.pathname + window.location.search;

  if (!user) {
    return (
      <a
        href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`}
        className={`${linkCls} inline-flex items-center gap-2`}
      >
        <FaSteam className="size-4" aria-hidden="true" />
        Sign in
      </a>
    );
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${linkCls} inline-flex cursor-pointer items-center gap-2`}
      >
        <FaSteam className="size-4" aria-hidden="true" />
        {user.personaName ?? "Signed in"}
        <span aria-hidden="true" className="text-xs opacity-60">▾</span>
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-2 min-w-40 border border-border-strong bg-card-elevated p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)]">
          <li>
            <a href="/gallery?view=mine" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-card hover:text-primary-hover">
              My designs
            </a>
          </li>
          <li>
            <form action="/api/auth/steam/logout" method="post">
              <button type="submit" className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-card hover:text-primary-hover">
                Sign out
              </button>
            </form>
          </li>
        </ul>
      )}
    </div>
  );
}
