import { artBackdrop } from "@/lib/art";

interface SectionBannerProps {
  /** Small uppercase kicker above the title. */
  eyebrow: string;
  /** Section name — rendered as the page <h1>. */
  title: string;
  /** One line of supporting copy. */
  tagline: string;
  /** Optimized art slug under /art/optimized (e.g. "walker"). */
  art: string;
  /** CSS object-position for the backdrop crop. Defaults to centre. */
  focal?: string;
}

// Full-bleed art band that opens a section page. Breaks out of the page's
// max-w-6xl padding (-mx-4 -mt-4) so it sits flush under the header, mirroring
// the home hero at a shorter height. The scrim darkens the bottom (seam into the
// page) and the left (where the type sits) so the cream display face stays legible.
export function SectionBanner({ eyebrow, title, tagline, art, focal = "center" }: SectionBannerProps) {
  const shadow = "[text-shadow:0_1px_10px_rgba(0,0,0,0.6)]";
  return (
    <section className="relative -mx-4 -mt-4 mb-6 overflow-hidden border-b border-border">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          {...artBackdrop(art)}
          alt=""
          className="size-full object-cover"
          style={{ objectPosition: focal }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/30 to-transparent" />
      </div>
      <div className="relative mx-auto flex min-h-[148px] max-w-6xl flex-col justify-center px-6 py-9 sm:min-h-[176px]">
        <span className={`font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-primary ${shadow}`}>
          {eyebrow}
        </span>
        <h1 className={`mt-1.5 font-display text-3xl font-bold uppercase leading-[0.95] tracking-[0.02em] ${shadow} sm:text-4xl`}>
          {title}
        </h1>
        <p className={`mt-2 max-w-md text-[13.5px] leading-relaxed text-foreground/80 ${shadow}`}>
          {tagline}
        </p>
      </div>
    </section>
  );
}
