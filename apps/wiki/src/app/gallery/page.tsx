import { listDesigns } from "@/lib/designs";
import { getSession, sessionIsAdmin } from "@/lib/auth";
import { GalleryClient } from "@/components/gallery/GalleryClient";
import "@/components/gallery/gallery.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = {
  title: "Trampler Gallery",
  description: "Community-published trampler builds for SAND: Raiders of Sophie.",
};
export const dynamic = "force-dynamic";

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const session = await getSession();
  const signedIn = !!session;
  const admin = await sessionIsAdmin();
  // ?view=mine deep-link selects the "My designs" tab (only honoured when signed in).
  const initialView = raw === "mine" && signedIn ? "mine" : "community";
  const initial = await listDesigns({
    view: initialView,
    sort: "top",
    cursor: null,
    viewerId: session?.steamId ?? null,
  });
  return (
    <GalleryClient
      initial={initial}
      signedIn={signedIn}
      admin={admin}
      initialView={initialView}
    />
  );
}
