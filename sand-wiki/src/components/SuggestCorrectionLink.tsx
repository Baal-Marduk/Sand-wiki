import Link from "next/link";

export function SuggestCorrectionLink({ type, slug }: { type: string; slug: string }) {
  return (
    <Link href={`/contribute/edit?type=${type}&slug=${slug}`} className="btn btn-ghost btn-sm">
      Suggest a correction
    </Link>
  );
}
