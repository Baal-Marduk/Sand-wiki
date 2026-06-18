/** Small "soon" tag shown next to disabled (work-in-progress) navigation entries. */
export function WipBadge() {
  return (
    <span className="inline-flex items-center border border-border-strong bg-card-elevated px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      soon
    </span>
  );
}
