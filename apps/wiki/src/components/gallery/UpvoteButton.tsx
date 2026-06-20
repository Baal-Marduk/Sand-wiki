"use client";
import { useState } from "react";
import { SteamGateModal } from "@/components/SteamGateModal";

// Standalone like/upvote control (used on the design view page). Optimistic
// toggle reconciled with the server's authoritative count; Steam-gated when
// signed out. Mirrors GalleryClient's like() pattern.
export function UpvoteButton({
  slug,
  initialLikeCount,
  initialLiked,
  signedIn,
}: {
  slug: string;
  initialLikeCount: number;
  initialLiked: boolean;
  signedIn: boolean;
}) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  async function toggle() {
    if (!signedIn) {
      setGateOpen(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const wasLiked = liked;
    const method = wasLiked ? "DELETE" : "POST";
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
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`tg-vote${liked ? " liked" : ""}${signedIn ? "" : " locked"}`}
        onClick={toggle}
        aria-pressed={liked}
        aria-label={liked ? "Remove upvote" : "Upvote"}
        title={signedIn ? "Upvote" : "Sign in with Steam to upvote"}
      >
        <span className="up" aria-hidden="true">
          ▲
        </span>
        <span className="score">{likeCount.toLocaleString()}</span>
      </button>
      <SteamGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        returnTo={`/builder/${slug}`}
      />
    </>
  );
}
