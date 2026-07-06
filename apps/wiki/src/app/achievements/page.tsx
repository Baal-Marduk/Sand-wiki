import { AdminBack } from "@/components/AdminBack";
import { SectionBanner } from "@/components/SectionBanner";
import { ACHIEVEMENT_GROUPS, ACHIEVEMENT_COUNT } from "@/data/achievements";

export const metadata = {
  title: "Achievements",
  description:
    "Every SAND achievement and how to unlock it — combat, trampler and wasteland goals, datamined from the game files.",
};

export default function AchievementsPage() {
  return (
    <div className="pb-2">
      <SectionBanner
        eyebrow="Data"
        title="Achievements"
        tagline={`All ${ACHIEVEMENT_COUNT} achievements and their unlock conditions, straight from the game files.`}
      />
      <AdminBack />

      <div className="mx-auto max-w-6xl">
        {ACHIEVEMENT_GROUPS.map((group) => (
          <section key={group.label} className="mt-8 first:mt-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              {group.label}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{group.blurb}</p>

            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.achievements.map((a) => (
                <li
                  key={a.id}
                  className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  <div className="font-display text-base font-semibold text-foreground group-hover:text-primary">
                    {a.name}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-8 text-xs text-muted-foreground">
          Names and conditions come from the game&apos;s own localization tables. &ldquo;Molfar&rdquo; doubles as the
          platinum trophy on console (&ldquo;Unlock All Trophies&rdquo;). Per-expedition counters reset each run —
          the one-expedition goals must be done in a single raid.
        </p>
      </div>
    </div>
  );
}
