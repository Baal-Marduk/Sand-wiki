import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { editableFields, isEditableTarget } from "@/lib/proposal-schema";
import { getEntityFields, getFieldOptions } from "@/lib/proposal-entity";
import { EditProposalForm } from "@/components/EditProposalForm";

type SP = Promise<{ type?: string; slug?: string }>;

export default async function EditProposalPage({ searchParams }: { searchParams: SP }) {
  const { type = "", slug = "" } = await searchParams;
  if (!isEditableTarget(type) || !slug) notFound();
  await requireUser(`/contribute/edit?type=${type}&slug=${slug}`);

  const current = await getEntityFields(type, slug);
  if (!current) notFound();

  const fields = editableFields(type);
  const options: Record<string, string[]> = {};
  for (const f of fields) {
    if (f.type === "enum") options[f.field] = await getFieldOptions(type, f.field);
  }

  return (
    <article className="py-6 space-y-6">
      <h1 className="font-display text-2xl font-bold">Suggest a correction — {current.name}</h1>
      <p className="text-base-content/70">Change only what is wrong. An admin reviews every change before it goes live.</p>
      <EditProposalForm type={type} slug={slug} fields={fields} values={current.values} options={options} />
    </article>
  );
}
