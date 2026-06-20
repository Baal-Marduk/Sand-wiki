"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ToolNavBrand } from "@/components/ToolNavBrand";
import { ToolNav } from "@/components/ToolNav";
import { AuthMenuClient } from "@/components/AuthMenuClient";
import { SteamGateModal } from "@/components/SteamGateModal";
import { Button } from "@/components/ui/button";

type Item = {
  slug: string;
  name: string;
  authorName: string | null;
  chassisId: string;
  partCount: number;
  crowns: number;
  hull: number;
  thumbPath: string | null;
  likeCount: number;
  status?: string;
};
type Page = { items: Item[]; nextCursor: string | null };
type View = "community" | "mine";
type Sort = "top" | "new";

const THUMB = "#b3863f"; // single desert tint — no per-role color (from the mockup)

// Empty-thumbnail placeholder: the mockup's iso-render grid + deck illusion. Shown
// when a design has no captured .webp yet so the card isn't a flat gradient.
function ThumbPlaceholder() {
  return (
    <>
      <div className="tg-thumb-grid" />
      <div className="tg-thumb-deck" />
    </>
  );
}

export function GalleryClient({
  initial,
  signedIn,
  initialView = "community",
}: {
  initial: Page;
  signedIn: boolean;
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);
  const [sort, setSort] = useState<Sort>("top");
  const [page, setPage] = useState<Page>(initial);
  const [loading, setLoading] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  // Slugs the viewer has liked this session — drives the optimistic toggle.
  const [liked, setLiked] = useState<Set<string>>(new Set());
  // The builder's local working build (drafts never hit the DB). Shown only in "mine".
  const [localDraft, setLocalDraft] = useState<{ name: string } | null>(null);
  // Monotonic request id: a fast view/sort switch can let a stale fetch settle
  // after a newer one — we ignore any response that isn't the latest request.
  const reqIdRef = useRef(0);

  // If we mounted directly into the "mine" view (?view=mine deep-link) and the
  // server only fetched the community first page, pull the viewer's designs.
  useEffect(() => {
    if (initialView === "mine" && signedIn) load("mine", "top", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sand_blueprint_v2");
      if (raw) {
        const s = JSON.parse(raw);
        setLocalDraft({ name: s?.name || "Untitled Rig" });
      }
    } catch {
      /* ignore malformed/absent local draft */
    }
  }, []);

  async function load(nextView: View, nextSort: Sort, cursor?: string | null) {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ view: nextView, sort: nextSort });
      if (cursor) qs.set("cursor", cursor);
      const res = await fetch(`/api/designs?${qs}`, { cache: "no-store" });
      // Bail on a non-OK response: leave the current page intact rather than
      // spreading an undefined/error body.
      if (!res.ok) return;
      const data: Page = await res.json();
      // Ignore stale settles — only the latest request may mutate the page.
      if (reqIdRef.current !== myReq) return;
      setPage((prev) =>
        cursor
          ? { items: [...prev.items, ...data.items], nextCursor: data.nextCursor }
          : data,
      );
    } finally {
      // Only the latest request should clear the spinner; a stale finally must
      // not flip loading off while a newer request is still in flight.
      if (reqIdRef.current === myReq) setLoading(false);
    }
  }

  function switchView(v: View) {
    if (v === view) return;
    if (v === "mine" && !signedIn) {
      setGateOpen(true);
      return;
    }
    setView(v);
    // Fresh list — drop optimistic liked state so it doesn't leak across lists.
    setLiked(new Set());
    load(v, sort, null);
  }

  function switchSort(s: Sort) {
    setSort(s);
    // Fresh list — drop optimistic liked state so it doesn't leak across lists.
    setLiked(new Set());
    load(view, s, null);
  }

  async function like(slug: string) {
    if (!signedIn) {
      setGateOpen(true);
      return;
    }
    const wasLiked = liked.has(slug);
    const method = wasLiked ? "DELETE" : "POST";
    // Optimistic: flip the toggle + adjust the count immediately, reconcile on response.
    setLiked((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(slug);
      else next.add(slug);
      return next;
    });
    setPage((p) => ({
      ...p,
      items: p.items.map((it) =>
        it.slug === slug
          ? { ...it, likeCount: Math.max(0, it.likeCount + (wasLiked ? -1 : 1)) }
          : it,
      ),
    }));
    try {
      const res = await fetch(`/api/designs/${slug}/like`, { method });
      if (res.ok) {
        const { likeCount } = await res.json();
        setPage((p) => ({
          ...p,
          items: p.items.map((it) =>
            it.slug === slug ? { ...it, likeCount } : it,
          ),
        }));
      } else {
        // Roll back the optimistic toggle on failure.
        setLiked((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(slug);
          else next.delete(slug);
          return next;
        });
      }
    } catch {
      setLiked((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(slug);
        else next.delete(slug);
        return next;
      });
    }
  }

  const showDraft = view === "mine" && !!localDraft;

  return (
    <div className="tg-app" data-screen-label="Trampler Gallery">
      {/* ===== top bar ===== */}
      <header className="tg-appbar">
        <div className="flex items-center gap-4">
          <ToolNavBrand title="Gallery" />
          <ToolNav active="gallery" />
        </div>
        <span className="spacer" style={{ marginLeft: "auto" }} />
        <Button asChild size="sm">
          <Link href="/builder">+ New rig</Link>
        </Button>
        <AuthMenuClient />
      </header>

      {/* ===== sub toolbar (audience switch) ===== */}
      <div className="tg-toolbar">
        <div className="tg-seg">
          <button
            type="button"
            aria-selected={view === "community"}
            onClick={() => switchView("community")}
          >
            Community
          </button>
          <button
            type="button"
            aria-selected={view === "mine"}
            onClick={() => switchView("mine")}
          >
            My designs
          </button>
        </div>
        <span className="spacer" style={{ marginLeft: "auto" }} />
        <div className="tg-sortwrap">
          <span className="label">Sort</span>
          <select
            className="tg-select"
            value={sort}
            onChange={(e) => switchSort(e.target.value as Sort)}
            aria-label="Sort designs"
          >
            <option value="top">Top</option>
            <option value="new">Newest</option>
          </select>
        </div>
      </div>

      {/* ===== grid ===== */}
      <div className="tg-scroll">
        <div className="tg-grid">
          {/* Local draft card (mine view only) — the builder's working build. */}
          {showDraft && localDraft && (
            <div className="tg-card">
              <div
                className="tg-thumb"
                style={{ "--thumb": THUMB } as React.CSSProperties}
              >
                <ThumbPlaceholder />
                <span className="tg-status-badge tg-badge warning">
                  <span
                    className="dot"
                    style={{ background: "var(--warning)" }}
                  />
                  Draft
                </span>
              </div>
              <div className="tg-body">
                <div className="tg-name">{localDraft.name}</div>
                <div className="tg-sub">
                  <span style={{ color: "var(--warning)" }}>
                    Draft — not published
                  </span>
                </div>
              </div>
              <div className="tg-foot">
                <Button asChild size="sm">
                  <Link href="/builder">Edit</Link>
                </Button>
              </div>
            </div>
          )}

          {page.items.map((d) => {
            const isLiked = liked.has(d.slug);
            return (
              <div className="tg-card" key={d.slug}>
                <Link
                  href={`/gallery/${d.slug}`}
                  className="tg-thumb"
                  style={{ "--thumb": THUMB } as React.CSSProperties}
                >
                  {d.thumbPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.thumbPath}
                      alt={d.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <ThumbPlaceholder />
                  )}
                  <span className="tg-hull-badge">Hull {d.hull}</span>
                </Link>
                <div className="tg-body">
                  <Link href={`/gallery/${d.slug}`} className="tg-name">
                    {d.name}
                  </Link>
                  <div className="tg-sub">{d.authorName ?? "Unknown"}</div>
                  <div className="tg-meta">
                    <span className="m">
                      <b>{d.partCount}</b> parts
                    </span>
                    <span className="m">
                      <span className="scrap" />
                      <b>{d.crowns.toLocaleString()}</b>
                    </span>
                  </div>
                </div>
                <div className="tg-foot">
                  <button
                    type="button"
                    className={`tg-vote${isLiked ? " liked" : ""}${signedIn ? "" : " locked"}`}
                    onClick={() => like(d.slug)}
                    title={signedIn ? "Like" : "Sign in with Steam to like"}
                    aria-label={isLiked ? "Unlike" : "Like"}
                    aria-pressed={isLiked}
                  >
                    <span className="up" aria-hidden="true">
                      ▲
                    </span>
                    <span className="score">{d.likeCount.toLocaleString()}</span>
                  </button>
                  <div className="right">
                    <Link
                      href={`/gallery/${d.slug}`}
                      className="tg-icon-btn"
                      title="Open design"
                      aria-label={`Open ${d.name}`}
                    >
                      ↗
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

          {page.items.length === 0 && !showDraft && (
            <div className="tg-empty">
              <span className="eg">▦</span>
              <span className="et">
                {view === "mine" ? "No designs yet" : "No published rigs yet"}
              </span>
              <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
                {view === "mine"
                  ? "Build a rig and publish it to see it here."
                  : "Be the first to publish a trampler to the community gallery."}
              </p>
            </div>
          )}
        </div>

        {page.nextCursor && (
          <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => load(view, sort, page.nextCursor)}
            >
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>

      <SteamGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        returnTo="/gallery"
      />
    </div>
  );
}
