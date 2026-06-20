"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Admin-only button to hide a design from the gallery grid. Calls DELETE
// /api/designs/[slug] which, for a non-owner admin, sets status="hidden" rather
// than hard-deleting. On success the design drops out of all public lists; in the
// grid we remove the card in place via the onHidden callback.
export function AdminHideButton({
  slug,
  onHidden,
}: {
  slug: string;
  onHidden?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/designs/${slug}`, { method: "DELETE" });
      if (res.ok) {
        // On the gallery grid we drop the card in place via the callback; the
        // standalone use (no callback) falls back to a full navigation.
        if (onHidden) onHidden();
        else location.assign("/gallery");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(`Failed to hide design: ${data.error ?? res.status}`);
        setBusy(false);
      }
    } catch {
      setError("Network error — could not hide design.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={busy}
        aria-label="Hide this design (admin action)"
      >
        {busy ? "Hiding…" : "Hide design"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Hide this design?"
        description="It will be removed from public listings."
        confirmLabel="Hide"
        destructive
        onConfirm={handleConfirm}
      />
    </>
  );
}
