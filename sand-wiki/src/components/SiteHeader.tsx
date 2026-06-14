import Link from "next/link";
import { Menu } from "lucide-react";
import { MainNav } from "@/components/MainNav";
import { SearchBox } from "@/components/SearchBox";
import { AuthMenu } from "@/components/AuthMenu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SECTIONS } from "@/lib/taxonomy";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      {/* The single "Primary" navigation landmark. MainNav's NavigationMenu root
          renders its own (unnamed) <nav>, so it never adds a second landmark
          named "Primary". Search + About live inside this nav so the e2e suite
          can scope queries to nav.getByRole(...). */}
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

        <Sheet>
          <SheetTrigger asChild className="nav:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-card border-border">
            <SheetTitle className="font-display text-primary">Menu</SheetTitle>
            <div className="mt-4 space-y-1 px-4">
              {SECTIONS.filter((s) => s.kind === "data").map((s) => (
                <Link
                  key={s.slug}
                  href={s.href ?? `/${s.slug}`}
                  className="block rounded px-2 py-2 text-foreground hover:bg-card-elevated"
                >
                  {s.label}
                </Link>
              ))}
              <Link
                href="/about"
                className="block rounded px-2 py-2 text-foreground hover:bg-card-elevated"
              >
                About
              </Link>
            </div>
            <div className="px-4">
              <SearchBox variant="navbar" />
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
