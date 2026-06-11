import { requireUser } from "@/lib/auth";
import { submitNewPage } from "@/app/contribute/actions";

type SP = Promise<{ submitted?: string }>;

export default async function NewPageRequest({ searchParams }: { searchParams: SP }) {
  const { submitted } = await searchParams;
  await requireUser("/contribute/new");

  return (
    <article className="py-6 space-y-6 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Propose a new page</h1>
      {submitted && <p className="alert alert-success">Thanks! Your request is awaiting review.</p>}
      <p className="text-base-content/70">Tell us what is missing. An admin will create the page from your details.</p>
      <form action={submitNewPage} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Type</span>
          <select name="targetType" className="select select-bordered w-full" defaultValue="item">
            <option value="item">Item</option>
            <option value="tramplerPart">Trampler part</option>
            <option value="envEntity">Environment / loot container</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Proposed name</span>
          <input name="proposedName" required className="input input-bordered w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Details &amp; sources</span>
          <textarea name="note" required rows={6} className="textarea textarea-bordered w-full" placeholder="Stats, recipe, where it drops, links…" />
        </label>
        <button type="submit" className="btn btn-primary">Submit request</button>
      </form>
    </article>
  );
}
