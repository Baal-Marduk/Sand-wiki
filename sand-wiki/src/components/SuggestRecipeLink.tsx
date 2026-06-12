import Link from "next/link";

export function SuggestRecipeLink({ slug }: { slug: string }) {
  return (
    <Link href={`/contribute/edit-recipe?slug=${slug}`} className="btn btn-ghost btn-xs">
      Suggest a correction
    </Link>
  );
}
