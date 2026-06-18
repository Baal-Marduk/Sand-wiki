"use client";

import { submitLinksEdit } from "@/app/contribute/actions";
import { DirtyForm, DirtySubmit } from "@/components/DirtyForm";
import { LinkPicker } from "@/components/LinkPicker";
import type { LinkOption } from "@/lib/link-picker";
import type { LinkRowDraft } from "@/lib/link-proposal";
import type { LinkField } from "@/lib/entity-links";
import { labelCls, textareaCls } from "@/components/form-styles";

/** One role's tab editor: hidden type/slug/role, the search-to-add LinkPicker, an
 *  optional source note, and a dirty-gated submit. The picker emits the index-aligned
 *  link* FormData arrays the server action (default `submitLinksEdit`) parses. */
export function LinkEditForm({
  type,
  slug,
  role,
  label,
  fields,
  rows,
  items,
  action = submitLinksEdit,
  optionNoun = "item",
  allowCustom = true,
}: {
  type: string;
  slug: string;
  role: string;
  label: string;
  fields: readonly LinkField[];
  rows: LinkRowDraft[];
  items: LinkOption[];
  action?: (formData: FormData) => void | Promise<void>;
  optionNoun?: string;
  allowCustom?: boolean;
}) {
  return (
    <DirtyForm action={action} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="role" value={role} />

      <LinkPicker
        label={label}
        fields={fields}
        rows={rows}
        items={items}
        optionNoun={optionNoun}
        allowCustom={allowCustom}
      />

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Note / source (optional)</span>
        <textarea name="note" className={textareaCls} rows={2} placeholder="Where did you confirm this?" />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <DirtySubmit>Submit {label} change</DirtySubmit>
      </div>
    </DirtyForm>
  );
}
