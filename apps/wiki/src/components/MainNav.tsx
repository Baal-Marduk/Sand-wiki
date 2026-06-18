"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SECTIONS, isWipSection } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";
import { WipBadge } from "@/components/WipBadge";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "@/components/ui/navigation-menu";

// Trigger restyled to the design's nav-item (muted→primary, no accent fill). The
// override neutralises navigationMenuTriggerStyle's gold hover/open background;
// the auto-appended chevron rotates on open.
const triggerCls =
  "nav-link inline-flex h-auto cursor-pointer items-center gap-1 rounded-none bg-transparent px-2 py-1 text-sm font-semibold text-foreground hover:bg-transparent hover:text-primary focus:bg-transparent focus:text-primary data-[state=open]:bg-transparent data-[state=open]:text-primary data-[state=open]:hover:bg-transparent data-[state=open]:focus:bg-transparent data-[state=open]:focus:text-primary";
const navItemCls = "nav-link rounded px-2 py-1 text-sm font-semibold text-foreground hover:text-primary";
const disabledNavCls =
  "inline-flex cursor-not-allowed items-center gap-1.5 px-2 py-1 text-sm font-semibold text-muted-foreground";
// Dropdown rows (.menu-item): icon + label, light warm hover wash + primary text.
const itemCls =
  "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-primary/10 hover:text-primary-hover";
const itemDisabledCls =
  "flex cursor-not-allowed items-center gap-2.5 px-2.5 py-2 text-sm text-muted-foreground";
// Lift the open dropdown panel off the near-black page: lighter surface, a
// stronger border and a real shadow so it reads as elevated rather than flat.
const contentCls =
  "group-data-[viewport=false]/navigation-menu:bg-card-elevated group-data-[viewport=false]/navigation-menu:border-border-strong group-data-[viewport=false]/navigation-menu:shadow-lg group-data-[viewport=false]/navigation-menu:shadow-black/50";

export function MainNav() {
  const router = useRouter();
  return (
    // viewport={false} keeps each dropdown's content positioned beneath its own
    // item and inside this NavigationMenu's DOM subtree (no portaled viewport),
    // so the Primary <nav> landmark in SiteHeader contains the category links
    // that the e2e suite queries via nav.getByRole(...).
    <NavigationMenu viewport={false} className="max-w-none justify-start">
      <NavigationMenuList className="flex-wrap justify-start gap-1">
        {SECTIONS.map((section) => {
          if (section.kind === "data" && section.categories.length > 0) {
            return (
              <NavigationMenuItem key={section.slug}>
                {/* Hover still opens the category dropdown; a click (or Enter)
                    navigates to the section's index page. */}
                <NavigationMenuTrigger
                  className={triggerCls}
                  onClick={() => router.push(`/${section.slug}`)}
                >
                  {section.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent className={contentCls}>
                  <ul className="grid w-52 gap-0.5">
                    {section.categories.map((c) => (
                      <li key={c.slug}>
                        {c.wip ? (
                          <span className={itemDisabledCls} aria-disabled="true">
                            <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                            {c.label}
                            <span className="ml-auto">
                              <WipBadge />
                            </span>
                          </span>
                        ) : (
                          <Link href={`/${section.slug}?category=${c.slug}`} className={itemCls}>
                            <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                            {c.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          }

          if (isWipSection(section)) {
            return (
              <NavigationMenuItem key={section.slug}>
                <span className={disabledNavCls} aria-disabled="true">
                  {section.label} <WipBadge />
                </span>
              </NavigationMenuItem>
            );
          }

          const href = section.href ?? `/${section.slug}`;
          return (
            <NavigationMenuItem key={section.slug}>
              <Link href={href} className={navItemCls}>
                {section.label}
              </Link>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
