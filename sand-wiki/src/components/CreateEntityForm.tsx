"use client";

import { useState } from "react";
import { createEntity } from "@/app/admin/entities/actions";
import type { EditableField, SelectOption } from "@/lib/proposal-schema";
import { Button } from "@/components/ui/button";
import { labelCls, inputCls, selectCls, textareaCls } from "@/components/form-styles";

type Kind = "item" | "environment" | "trampler-part";

const KIND_LABELS: Record<Kind, string> = {
  item: "Item",
  environment: "Environment",
  "trampler-part": "Trampler part",
};

export function CreateEntityForm({
  config,
  categoryOptions,
  rarities,
}: {
  config: Record<Kind, { fields: EditableField[]; categories: string[] }>;
  categoryOptions: Record<Kind, SelectOption[]>;
  rarities: SelectOption[];
}) {
  const [kind, setKind] = useState<Kind>("item");
  // Category is controlled so switching Kind clears a now-invalid selection (a stale
  // slug from another kind would otherwise reach the server and error opaquely).
  const [category, setCategory] = useState("");
  // name + category are rendered explicitly; skip them in the generic field loop.
  const extraFields = config[kind].fields.filter((f) => f.field !== "name" && f.field !== "category");

  return (
    <form action={createEntity} className="space-y-4">
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Kind</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as Kind);
            setCategory("");
          }}
          className={selectCls}
        >
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Slug</span>
        <input name="slug" required placeholder="test-rifle" className={inputCls} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Name</span>
        <input name="name" required className={inputCls} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Category</span>
        <select
          name="category"
          required
          className={selectCls}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="" disabled>Select a category…</option>
          {categoryOptions[kind].map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Image URL / path</span>
        <input name="icon" placeholder="/icons/example.png" className={inputCls} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Image alt text</span>
        <input name="imageAlt" className={inputCls} />
      </label>

      {extraFields.map((f) => (
        <label key={f.field} className="flex flex-col gap-1.5">
          <span className={labelCls}>{f.label}</span>
          {f.field === "rarity" ? (
            <select name="rarity" className={selectCls} defaultValue="">
              <option value="">—</option>
              {rarities.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : f.type === "text" ? (
            <textarea name={f.field} rows={3} className={textareaCls} />
          ) : (
            <input name={f.field} type={f.type === "int" ? "number" : "text"} className={inputCls} />
          )}
        </label>
      ))}

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit">Create entity</Button>
      </div>
    </form>
  );
}
