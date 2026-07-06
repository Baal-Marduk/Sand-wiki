import { redirect } from "next/navigation";

/** The public data hub moved to /data (the /admin URL now only fronts the
 *  auth-gated surfaces under /admin/*). Keep old links working. */
export default function AdminRedirect() {
  redirect("/data");
}
