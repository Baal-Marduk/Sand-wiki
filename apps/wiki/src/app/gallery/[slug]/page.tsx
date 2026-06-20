import { notFound } from "next/navigation";
import Link from "next/link";
import { getDesign } from "@/lib/designs";
import { getSession } from "@/lib/auth";
import { ToolNavBrand } from "@/components/ToolNavBrand";
import { ToolNav } from "@/components/ToolNav";
import { AuthMenuClient } from "@/components/AuthMenuClient";
import { DesignActions } from "@/components/gallery/DesignActions";
import "@/components/gallery/gallery.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export default async function DesignPage({ params }: Props) {
  const { slug } = await params;
  const d = await getDesign(slug);
  if (!d || d.status === "hidden") notFound();

  const session = await getSession();
  const signedIn = !!session;

  return (
    <div className="tg-app" data-screen-label="Trampler Gallery">
      <header className="tg-appbar">
        <div className="flex items-center gap-4">
          <ToolNavBrand title="Gallery" />
          <ToolNav active="gallery" />
        </div>
        <span className="spacer" style={{ marginLeft: "auto" }} />
        <AuthMenuClient />
      </header>

      <div className="tg-scroll">
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "grid",
            gap: 16,
          }}
        >
          <Link href="/gallery" className="fbtn">
            ← Back to gallery
          </Link>
          <div className="tg-card">
            <div
              className="tg-thumb"
              style={{ height: 360, "--thumb": "#b3863f" } as React.CSSProperties}
            >
              {d.thumbPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.thumbPath}
                  alt={d.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <>
                  <div className="tg-thumb-grid" />
                  <div className="tg-thumb-deck" />
                </>
              )}
              <span className="tg-hull-badge">Hull {d.hull}</span>
            </div>
            <div className="tg-body">
              <div className="tg-name" style={{ fontSize: 24 }}>
                {d.name}
              </div>
              <div className="tg-sub">by {d.author?.personaName ?? "Unknown"}</div>
              <div className="tg-meta">
                <span className="m">
                  <b>{d.partCount}</b> parts
                </span>
                <span className="m">
                  <span className="scrap" />
                  <b>{d.crowns.toLocaleString()}</b> crowns
                </span>
              </div>
            </div>
            <div className="tg-foot">
              <DesignActions
                slug={d.slug}
                initialLikeCount={d.likeCount}
                signedIn={signedIn}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
