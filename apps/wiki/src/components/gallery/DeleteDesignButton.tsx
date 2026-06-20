"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Delete a design (owner or admin). Calls DELETE /api/designs/[slug], which
// hard-deletes for an owner or admin. On the gallery grid we drop the card in
// place via onDeleted; standalone (no callback) navigates to the gallery.
export function DeleteDesignButton({
  slug,
  onDeleted,
}: {
  slug: string;
  onDeleted?: () => void;
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
        setBusy(false);
        if (onDeleted) onDeleted();
        else location.assign("/gallery");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(`Failed to delete: ${data.error ?? res.status}`);
        setBusy(false);
      }
    } catch {
      setError("Network error — could not delete.");
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
        aria-label="Delete this design"
      >
        {busy ? "Deleting…" : "Delete"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this design?"
        description="This permanently removes it from the gallery. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirm}
      />
    </>
  );
}
