"use client";
import { createPortal } from "react-dom";
import { FaSteam } from "react-icons/fa";
import { Button } from "@/components/ui/button";

export function SteamGateModal({ open, onClose, returnTo }: { open: boolean; onClose: () => void; returnTo: string }) {
  if (!open) return null;
  // Portal to <body> so the fixed full-screen scrim can't be trapped by an
  // ancestor that establishes a containing block for fixed descendants (e.g. the
  // builder app-bar's `backdrop-filter`, which would otherwise clip this overlay
  // to the bar instead of the viewport).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="steam-gate-title"
    >
      <div className="w-[444px] max-w-[calc(100vw-32px)] border border-border-strong bg-card-elevated shadow-[0_28px_70px_-16px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3.5 font-display text-sm font-semibold uppercase tracking-[0.07em] text-info">
          <FaSteam className="size-4" aria-hidden="true" />
          <span id="steam-gate-title" className="text-foreground">Sign in with Steam</span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid size-7 place-items-center border border-border text-dim hover:border-destructive hover:text-destructive">✕</button>
        </div>
        <div className="flex flex-col gap-3.5 px-4 py-4 text-sm text-muted-foreground">
          <p>Browsing the gallery is open to everyone. To <b className="text-foreground">vote, save and publish</b> rigs you need a SAND account — we sign you in through <b className="text-foreground">Steam</b>, then bring you back here.</p>
          <ul className="flex flex-col gap-2 text-[12.5px]">
            <li className="flex gap-2"><span className="font-bold text-success">✓</span>Reads your Steam name and avatar — nothing else</li>
            <li className="flex gap-2"><span className="font-bold text-success">✓</span>Saves your builds to your account so they sync across devices</li>
            <li className="flex gap-2"><span className="font-bold text-success">✓</span>Lets you upvote and publish to the community gallery</li>
          </ul>
          <p className="text-[11.5px] text-dim">We never receive your password or game library. Sign out any time.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          {/* asChild keeps the real Steam login link; info-tinted CTA via --info token. */}
          <Button asChild size="sm" className="border border-info bg-info/15 text-info hover:bg-info/25">
            <a href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`}>
              <FaSteam className="size-4" aria-hidden="true" />Continue to Steam
            </a>
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
