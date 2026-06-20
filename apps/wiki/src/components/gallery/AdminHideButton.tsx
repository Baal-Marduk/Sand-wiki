"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Admin-only button to hide a reported design. Calls DELETE /api/designs/[slug]
// which, for a non-owner admin, sets status="hidden" rather than hard-deleting.
// On success the design drops out of public lists and 404s on the detail page.
export function AdminHideButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/designs/${slug}`, { method: "DELETE" });
      if (res.ok) {
        location.assign("/gallery");
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
