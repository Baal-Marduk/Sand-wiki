import Link from "next/link";
import { actionButtonClass } from "@/components/ui/button";

export function SuggestCorrectionLink({ type, slug }: { type: string; slug: string }) {
  return (
    <Link href={`/contribute/edit?type=${type}&slug=${slug}`} className={actionButtonClass}>
      Suggest a correction
    </Link>
  );
}
