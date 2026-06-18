import { requireUser } from "@/lib/auth";
import { submitNewPage } from "@/app/contribute/actions";
import { labelCls, inputCls, selectCls, textareaCls, btnPrimary } from "@/components/form-styles";

type SP = Promise<{ submitted?: string }>;

export default async function NewPageRequest({ searchParams }: { searchParams: SP }) {
  const { submitted } = await searchParams;
  await requireUser("/contribute/new");

  return (
    <article className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Propose a new page</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us what is missing. An admin will create the page from your details.
        </p>
      </div>
      {submitted && (
        <p className="border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          Thanks! Your request is awaiting review.
        </p>
      )}
      <form action={submitNewPage} className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Type</span>
          <select name="targetType" className={selectCls} defaultValue="item">
            <option value="item">Item</option>
            <option value="tramplerPart">Trampler part</option>
            <option value="envEntity">Environment / loot container</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Proposed name</span>
          <input name="proposedName" required className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Details &amp; sources</span>
          <textarea name="note" required rows={6} className={textareaCls} placeholder="Stats, recipe, where it drops, links…" />
        </label>
        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" className={btnPrimary}>Submit request</button>
        </div>
      </form>
    </article>
  );
}
