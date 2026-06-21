import { requireAdmin } from "@/lib/auth";
import { BallisticsClient } from "./BallisticsClient";

export const metadata = {
  title: "Ballistics — Sand Help",
  robots: { index: false, follow: false },
};

// Admin-only. requireAdmin() redirects non-admins (and logged-out users) to "/",
// so the page is gated server-side — not just hidden from the nav.
export default async function BallisticsPage() {
  await requireAdmin();
  return <BallisticsClient />;
}
