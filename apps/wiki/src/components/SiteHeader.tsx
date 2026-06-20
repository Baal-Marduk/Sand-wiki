import Link from "next/link";
import { MainNav } from "@/components/MainNav";
import { SearchBox } from "@/components/SearchBox";
import { AuthMenu } from "@/components/AuthMenu";
import { MobileNav } from "@/components/MobileNav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      {/* The single "Primary" navigation landmark. Search + About live inside
          this nav so the e2e suite can scope queries to nav.getByRole(...). */}
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4"
      >
        <Link
          href="/"
          aria-label="SAND HELP — home"
          className="group font-display text-xl font-bold tracking-wide text-foreground transition-colors hover:text-primary focus-visible:text-primary"
        >
          SAND
          <span
            aria-hidden="true"
            className="mx-0.5 text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
          >
            ·
          </span>
          HELP
        </Link>

        <div className="hidden flex-1 nav:block">
          <MainNav />
        </div>
        <div className="flex-1 nav:hidden" />

        <div className="hidden items-center gap-2 nav:flex">
          <SearchBox variant="navbar" />
          <Link
            href="/about"
            className="nav-link text-foreground hover:text-primary px-2 py-1 text-sm font-semibold rounded"
          >
            About
          </Link>
          <AuthMenu />
        </div>

        <MobileNav />
      </nav>
    </header>
  );
}
