import Link from "next/link";
import { btnGhost, btnSm } from "@/components/form-styles";

export function EditTabsLink({ type, slug }: { type: string; slug: string }) {
  return (
    <Link href={`/contribute/edit-tabs?type=${type}&slug=${slug}`} className={`${btnGhost} ${btnSm}`}>
      Edit tabs
    </Link>
  );
}
