import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export const metadata = {
  title: "Admin — Sand Help",
  robots: { index: false, follow: false },
};

// Restricted tools, surfaced only to admins. Each links to its own route, which is
// independently gated with requireAdmin() — this landing is convenience, not the
// security boundary.
const TOOLS = [
  {
    href: "/ballistics",
    label: "Ballistics",
    desc: "Bullet drop per ammo + turret fire-rate/reload, from the datamined projectile blueprints.",
  },
  {
    href: "/crafting",
    label: "Crafting",
    desc: "Every recipe — outputs, ingredients, crafting station and time — straight from the wiki database.",
  },
  {
    href: "/contracts",
    label: "Contracts",
    desc: "Contract reward bundles + key-locked-box loot by tier, and where contract platforms spawn.",
  },
];

export default async function AdminPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-primary">Admin</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Restricted tools — visible only to you and Baal when signed in to Steam.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
          >
            <div className="font-display text-base font-semibold text-foreground group-hover:text-primary">
              {t.label}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
