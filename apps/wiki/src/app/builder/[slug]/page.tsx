import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getDesign, hasLiked } from "@/lib/designs";
import { getSession, sessionIsAdmin } from "@/lib/auth";
import BuilderViewClient from "@/components/builder/BuilderViewClient";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function originFromRequest(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const d = await getDesign(slug);
  if (!d) return {};
  const origin = await originFromRequest();
  const title = `${d.name} — Trampler Builder`;
  const description = `${d.partCount} parts · Hull ${d.hull} · by ${d.author?.personaName ?? "Unknown"}`;
  const images = d.thumbPath ? [`${origin}${d.thumbPath}`] : [];
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images,
      type: "website",
      url: `${origin}/builder/${slug}`,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}

export default async function DesignViewPage({ params }: Props) {
  const { slug } = await params;
  const d = await getDesign(slug);
  if (!d) notFound();

  const session = await getSession();
  const signedIn = !!session;
  const admin = await sessionIsAdmin();
  const isOwner = !!session && d.authorId === session.steamId;
  const initialLiked = session ? await hasLiked(slug, session.steamId) : false;

  return (
    <BuilderViewClient
      buildCode={d.buildCode}
      name={d.name}
      authorName={d.author?.personaName ?? null}
      slug={d.slug}
      likeCount={d.likeCount}
      initialLiked={initialLiked}
      signedIn={signedIn}
      canDelete={isOwner || admin}
    />
  );
}
