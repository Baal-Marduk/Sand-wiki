import Link from "next/link";

// Segmented Builder | Gallery switch for the full-bleed tool app-bars.
// `active` highlights the current tool. Styled with site tokens (mockup .tg-nav).
const items = [
  { href: "/builder", label: "Builder", key: "builder" },
  { href: "/gallery", label: "Gallery", key: "gallery" },
] as const;

export function ToolNav({ active }: { active: "builder" | "gallery" }) {
  return (
    <nav className="ml-2 flex border border-border-strong">
      {items.map((it, i) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={it.key === active ? "page" : undefined}
          className={[
            "font-display text-xs font-semibold uppercase tracking-[0.06em] px-3.5 py-[7px] transition-colors",
            i > 0 ? "border-l border-border-strong" : "",
            it.key === active
              ? "bg-primary text-[#1a0f04]"
              : "text-muted-foreground hover:bg-card-elevated hover:text-foreground",
          ].join(" ")}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
