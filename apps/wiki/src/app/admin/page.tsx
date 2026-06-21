import Link from "next/link";

export const metadata = {
  title: "Data — Sand Help",
};

// Data tools — each links to its own route. Public landing hub.
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

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-primary">Data</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Datamined reference tables — ballistics, crafting recipes and contract rewards.
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
