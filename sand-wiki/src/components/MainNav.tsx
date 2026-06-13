import Link from "next/link";
import { SECTIONS, isWipSection } from "@/lib/taxonomy";
import { CategoryIcon } from "@/components/CategoryIcon";
import { WipBadge } from "@/components/WipBadge";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";

// Full-contrast text (text-foreground, not a dim token) so nav links meet WCAG
// AA contrast; WIP entries use text-dim and are non-interactive.
const linkCls = "nav-link text-foreground px-2 py-1 text-sm font-semibold rounded";
const dropdownItemBaseCls = "flex items-center gap-2 px-2 py-1 rounded text-sm";
const dropdownItemCls = `${dropdownItemBaseCls} text-foreground hover:bg-card-elevated`;
const disabledCls = "text-dim cursor-not-allowed";

export function MainNav() {
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
                <NavigationMenuTrigger className="text-foreground bg-transparent px-2 h-auto py-1 text-sm font-semibold">
                  {section.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="w-52 space-y-1 rounded-md border border-border bg-card p-2 shadow">
                    {section.categories.map((c) => (
                      <li key={c.slug}>
                        {c.wip ? (
                          <span
                            className={`${dropdownItemBaseCls} ${disabledCls}`}
                            aria-disabled="true"
                          >
                            <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                            {c.label}
                            <span className="ml-auto">
                              <WipBadge />
                            </span>
                          </span>
                        ) : (
                          <NavigationMenuLink asChild>
                            <Link
                              href={`/${section.slug}?category=${c.slug}`}
                              className={dropdownItemCls}
                            >
                              <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                              {c.label}
                            </Link>
                          </NavigationMenuLink>
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
                <span
                  className={`${linkCls} ${disabledCls} inline-flex items-center gap-1`}
                  aria-disabled="true"
                >
                  {section.label} <WipBadge />
                </span>
              </NavigationMenuItem>
            );
          }

          const href = section.href ?? `/${section.slug}`;
          return (
            <NavigationMenuItem key={section.slug}>
              <NavigationMenuLink asChild>
                <Link href={href} className={linkCls}>
                  {section.label}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
