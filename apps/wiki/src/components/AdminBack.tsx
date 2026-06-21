import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Small "back to Data" link shown above the title on every data tool page,
 *  so you can return to the hub without re-opening the nav menu. */
export function AdminBack() {
  return (
    <Link
      href="/admin"
      className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
    >
      <ChevronLeft className="size-4" />
      Data
    </Link>
  );
}
