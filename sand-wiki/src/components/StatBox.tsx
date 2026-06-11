/** The flat wiki-stat columns on Item that StatBox renders. */
export interface ItemStatFields {
  statType: string | null;
  damage: number | null;
  playerDamage: number | null;
  tramplerDamage: number | null;
  splashDamage: number | null;
  magazine: number | null;
}

/** Prominent grid of wiki-sourced gameplay stats, shown under the detail header.
 *  Renders nothing when there are no displayable stats. */
export function StatBox({ item, typeLabel }: { item: ItemStatFields; typeLabel?: string }) {
  const cells: { label: string; node: React.ReactNode }[] = [];
  if (item.damage != null) cells.push({ label: "Damage", node: item.damage });
  if (item.playerDamage != null) cells.push({ label: "Damage (Player)", node: item.playerDamage });
  if (item.tramplerDamage != null) cells.push({ label: "Damage (Trampler)", node: item.tramplerDamage });
  if (item.splashDamage != null) cells.push({ label: "Splash Damage", node: item.splashDamage });
  if (item.magazine != null) cells.push({ label: "Magazine", node: item.magazine });
  const typeValue = typeLabel ?? item.statType;
  if (typeValue) cells.push({ label: "Type", node: typeValue });
  if (cells.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-base-300 rounded-box overflow-hidden">
      {cells.map((c) => (
        <div key={c.label} className="bg-base-200 px-3 py-2">
          <dt className="text-[0.65rem] uppercase tracking-wide text-base-content/60">{c.label}</dt>
          <dd className="font-medium">{c.node}</dd>
        </div>
      ))}
    </dl>
  );
}
