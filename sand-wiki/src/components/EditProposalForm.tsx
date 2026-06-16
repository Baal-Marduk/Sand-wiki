import Link from "next/link";
import { submitEdit } from "@/app/contribute/actions";
import { entityHref, type EditableField, type SelectOption } from "@/lib/proposal-schema";
import { EnumField } from "@/components/EnumField";
import { DirtyForm, DirtySubmit } from "@/components/DirtyForm";
import { labelCls, inputCls, textareaCls, hintCls, btnGhost } from "@/components/form-styles";

export function EditProposalForm({
  type,
  slug,
  fields,
  values,
  options,
}: {
  type: string;
  slug: string;
  fields: EditableField[];
  values: Record<string, string | number | null>;
  options: Record<string, SelectOption[]>;
}) {
  return (
    <DirtyForm action={submitEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      {fields.map((f) => (
        <label key={f.field} className="flex flex-col gap-1.5">
          <span className={labelCls}>{f.label}</span>
          {f.type === "enum" ? (
            <EnumField field={f.field} value={String(values[f.field] ?? "")} options={options[f.field] ?? []} />
          ) : f.type === "text" ? (
            <textarea name={f.field} defaultValue={values[f.field] ?? ""} className={textareaCls} rows={3} />
          ) : (
            <input
              name={f.field}
              type={f.type === "int" ? "number" : "text"}
              defaultValue={values[f.field] ?? ""}
              className={inputCls}
            />
          )}
          {f.field === "description" && (
            <span className={hintCls}>
              Link to any wiki page with <code>[[slug]]</code>.
            </span>
          )}
          {f.field === "ammoType" && (
            <span className={hintCls}>
              Weapons and ammo sharing the same Ammo type appear on each other&apos;s pages
              (e.g. <code>11x54 mm</code>).
            </span>
          )}
        </label>
      ))}
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Note / source (optional)</span>
        <textarea name="note" className={textareaCls} rows={2} placeholder="Where did you confirm this?" />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link href={entityHref(type, slug)} className={btnGhost}>Cancel</Link>
        <DirtySubmit>Submit correction</DirtySubmit>
      </div>
    </DirtyForm>
  );
}
