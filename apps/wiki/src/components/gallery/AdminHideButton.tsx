"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// Admin-only button to hide a reported design. Calls DELETE /api/designs/[slug]
// which, for a non-owner admin, sets status="hidden" rather than hard-deleting.
// On success the design drops out of public lists and 404s on the detail page.
export function AdminHideButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);

  async function handleHide() {
    if (!window.confirm("Hide this design? It will be removed from public listings.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/designs/${slug}`, { method: "DELETE" });
      if (res.ok) {
        location.assign("/gallery");
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to hide design: ${data.error ?? res.status}`);
        setBusy(false);
      }
    } catch {
      alert("Network error — could not hide design.");
      setBusy(false);
    }
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleHide}
      disabled={busy}
      aria-label="Hide this design (admin action)"
    >
      {busy ? "Hiding…" : "Hide design"}
    </Button>
  );
}
