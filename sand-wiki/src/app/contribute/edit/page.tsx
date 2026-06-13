import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { editableFields, isEditableTarget } from "@/lib/proposal-schema";
import { getEntityFields, getEnumOptions } from "@/lib/proposal-entity";
import type { SelectOption } from "@/lib/proposal-schema";
import { EditProposalForm } from "@/components/EditProposalForm";

type SP = Promise<{ type?: string; slug?: string }>;

export default async function EditProposalPage({ searchParams }: { searchParams: SP }) {
  const { type = "", slug = "" } = await searchParams;
  if (!isEditableTarget(type) || !slug) notFound();
  await requireUser(`/contribute/edit?type=${type}&slug=${slug}`);

  const current = await getEntityFields(type, slug);
  if (!current) notFound();

  const fields = editableFields(type);
  const options: Record<string, SelectOption[]> = {};
  for (const f of fields) {
    if (f.type === "enum") options[f.field] = await getEnumOptions(type, f.field);
  }

  return (
    <article className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">
          Suggest a correction — {current.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Change only what is wrong. An admin reviews every change before it goes live.
        </p>
      </div>
      <EditProposalForm type={type} slug={slug} fields={fields} values={current.values} options={options} />
    </article>
  );
}
