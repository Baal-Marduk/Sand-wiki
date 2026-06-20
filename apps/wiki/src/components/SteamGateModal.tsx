"use client";
import { FaSteam } from "react-icons/fa";

export function SteamGateModal({ open, onClose, returnTo }: { open: boolean; onClose: () => void; returnTo: string }) {
  if (!open) return null;
  return (
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
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <a href={`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`} className="btn btn-sm inline-flex items-center gap-2 border border-info bg-info/15 text-info hover:bg-info/25">
            <FaSteam className="size-4" aria-hidden="true" />Continue to Steam
          </a>
        </div>
      </div>
    </div>
  );
}
