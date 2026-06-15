"use client";

import { useState, useRef } from "react";
import { setEntityImage, setEntityDisabled } from "@/app/admin/entities/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { labelCls, inputCls } from "@/components/form-styles";

/** Admin-only strip on an entity detail page: paste an image URL/path (with a live
 *  preview), and disable/enable the entity. Both post to server actions. */
export function AdminEntityControls({
  slug,
  icon,
  imageAlt,
  disabled,
}: {
  slug: string;
  icon: string | null;
  imageAlt: string | null;
  disabled: boolean;
}) {
  const [preview, setPreview] = useState(icon ?? "");

  return (
    <div className="space-y-4">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Admin controls
      </p>

      <form action={setEntityImage} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <div className="flex items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center border border-border bg-card" aria-hidden>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="size-[80%] object-contain" />
            ) : (
              <span className="text-dim">▦</span>
            )}
          </span>
          <div className="flex-1 space-y-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Image URL / path</span>
              <input
                name="icon"
                defaultValue={icon ?? ""}
                onChange={(e) => setPreview(e.target.value.trim())}
                placeholder="/icons/example.png"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Image alt text</span>
              <input name="imageAlt" defaultValue={imageAlt ?? ""} className={inputCls} />
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm">Save image</Button>
        </div>
      </form>

      <DisableToggle slug={slug} disabled={disabled} />
    </div>
  );
}

function DisableToggle({ slug, disabled }: { slug: string; disabled: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex items-center justify-between border-t border-border pt-3">
      <span className="text-sm text-muted-foreground">
        {disabled ? "Hidden from the public." : "Visible to everyone."}
      </span>
      <form action={setEntityDisabled} ref={formRef}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
        {disabled ? (
          <Button type="submit" size="sm" variant="default">Enable</Button>
        ) : (
          <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>
            Disable
          </Button>
        )}
      </form>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Disable this entity?"
        description="It will be hidden from the public. Admins can still see and re-enable it."
        confirmLabel="Disable"
        destructive
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </div>
  );
}
