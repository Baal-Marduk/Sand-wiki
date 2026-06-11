import { submitEdit } from "@/app/contribute/actions";
import type { EditableField } from "@/lib/proposal-schema";

export function EditProposalForm({
  type,
  slug,
  fields,
  values,
}: {
  type: string;
  slug: string;
  fields: EditableField[];
  values: Record<string, string | number | null>;
}) {
  return (
    <form action={submitEdit} className="space-y-4 max-w-2xl">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      {fields.map((f) => (
        <label key={f.field} className="block space-y-1">
          <span className="text-sm font-medium">{f.label}</span>
          {f.type === "text" ? (
            <textarea name={f.field} defaultValue={values[f.field] ?? ""} className="textarea textarea-bordered w-full" rows={3} />
          ) : (
            <input
              name={f.field}
              type={f.type === "int" ? "number" : "text"}
              defaultValue={values[f.field] ?? ""}
              className="input input-bordered w-full"
            />
          )}
        </label>
      ))}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Note / source (optional)</span>
        <textarea name="note" className="textarea textarea-bordered w-full" rows={2} placeholder="Where did you confirm this?" />
      </label>
      <button type="submit" className="btn btn-primary">Submit correction</button>
    </form>
  );
}
