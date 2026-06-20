"use client";
import { useState } from "react";
import { SteamGateModal } from "@/components/SteamGateModal";
import { Button } from "@/components/ui/button";

// Like + Report controls for the design detail page. A small client island so the
// detail page itself can stay a server component. Mirrors GalleryClient's like()
// pattern (optimistic toggle, gated behind the Steam modal when signed out).
export function DesignActions({
  slug,
  initialLikeCount,
  signedIn,
}: {
  slug: string;
  initialLikeCount: number;
  signedIn: boolean;
}) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function like() {
    if (!signedIn) {
      setGateOpen(true);
      return;
    }
    // Guard against re-entry while a like/unlike is in flight.
    if (liking) return;
    setLiking(true);
    const wasLiked = liked;
    const method = wasLiked ? "DELETE" : "POST";
    // Optimistic toggle, reconciled with the server's authoritative count.
    setLiked(!wasLiked);
    setLikeCount((n) => Math.max(0, n + (wasLiked ? -1 : 1)));
    try {
      const res = await fetch(`/api/designs/${slug}/like`, { method });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.likeCount === "number") setLikeCount(data.likeCount);
      } else {
        setLiked(wasLiked);
        setLikeCount((n) => Math.max(0, n + (wasLiked ? 1 : -1)));
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount((n) => Math.max(0, n + (wasLiked ? 1 : -1)));
    } finally {
      setLiking(false);
    }
  }

  async function report() {
    if (!signedIn) {
      setGateOpen(true);
      return;
    }
    if (reported || reporting) return;
    setReporting(true);
    try {
      const res = await fetch(`/api/designs/${slug}/report`, { method: "POST" });
      if (res.ok) setReported(true);
    } finally {
      setReporting(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        className={`tg-vote${liked ? " liked" : ""}${signedIn ? "" : " locked"}`}
        onClick={like}
        title={signedIn ? "Like" : "Sign in with Steam to like"}
        aria-label={liked ? "Unlike" : "Like"}
        aria-pressed={liked}
      >
        <span className="up" aria-hidden="true">
          ▲
        </span>
        <span className="score">{likeCount.toLocaleString()}</span>
      </button>
      <Button
        variant="ghost"
        size="sm"
        onClick={report}
        disabled={reported || reporting}
      >
        {reported ? "Reported" : reporting ? "Reporting…" : "Report"}
      </Button>
      <SteamGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        returnTo={`/gallery/${slug}`}
      />
    </div>
  );
}
