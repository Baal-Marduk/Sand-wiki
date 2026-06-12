import Link from "next/link";
import { submitEdit } from "@/app/contribute/actions";
import { entityHref, type EditableField, type SelectOption } from "@/lib/proposal-schema";
import { EnumField } from "@/components/EnumField";

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
    <form action={submitEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      {fields.map((f) => (
        <label key={f.field} className="block space-y-1">
          <span className="text-sm font-medium">{f.label}</span>
          {f.type === "enum" ? (
            <EnumField field={f.field} value={String(values[f.field] ?? "")} options={options[f.field] ?? []} />
          ) : f.type === "text" ? (
            <textarea name={f.field} defaultValue={values[f.field] ?? ""} className="textarea textarea-bordered w-full" rows={3} />
          ) : (
            <input
              name={f.field}
              type={f.type === "int" ? "number" : "text"}
              defaultValue={values[f.field] ?? ""}
              className="input input-bordered w-full"
            />
          )}
          {f.field === "description" && (
            <span className="text-xs text-base-content/50">
              Link to any wiki page with <code>[[slug]]</code>.
            </span>
          )}
        </label>
      ))}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Note / source (optional)</span>
        <textarea name="note" className="textarea textarea-bordered w-full" rows={2} placeholder="Where did you confirm this?" />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Submit correction</button>
        <Link href={entityHref(type, slug)} className="btn btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}
