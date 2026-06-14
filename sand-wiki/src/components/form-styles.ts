/** Shared Tailwind class strings for the editorial form system (contribute /
 *  edit / admin), matching the design reference: squared inputs, uppercase
 *  Oswald labels, primary CTA, destructive/secondary variants. Native form
 *  elements keep their `name`/`value` so server actions read FormData. */

export const labelCls =
  "font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

export const inputCls =
  "w-full border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-dim transition-colors hover:border-primary focus:border-primary focus:bg-card focus:outline-none";

export const selectCls = inputCls;

export const textareaCls =
  "w-full min-h-[84px] resize-y border border-border-strong bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-dim transition-colors hover:border-primary focus:border-primary focus:bg-card focus:outline-none";

export const invalidCls = "border-destructive";
export const hintCls = "text-xs text-muted-foreground";
export const errorCls = "text-xs text-destructive";

const btnBase =
  "inline-flex items-center justify-center gap-2 border font-display text-[13px] font-semibold uppercase tracking-[0.05em] transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const btnPrimary = `${btnBase} border-transparent bg-primary px-4 py-2 text-primary-foreground hover:bg-primary-hover active:bg-primary-press`;
export const btnGhost = `${btnBase} border-border-strong px-4 py-2 text-foreground hover:border-primary hover:bg-card-elevated hover:text-primary-hover`;
export const btnSecondary = `${btnBase} border-accent px-4 py-2 text-accent hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]`;
export const btnSuccess = `${btnBase} border-success px-4 py-2 text-success hover:bg-[color-mix(in_srgb,var(--success)_14%,transparent)]`;
export const btnDestructive = `${btnBase} border-destructive px-4 py-2 text-destructive hover:bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)]`;
export const btnSm = "px-3 py-1.5 text-xs";
