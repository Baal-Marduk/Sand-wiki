"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ToolNavBrand } from "@/components/ToolNavBrand";
import { ToolNav } from "@/components/ToolNav";
import { AuthMenuClient } from "@/components/AuthMenuClient";
import { SteamGateModal } from "@/components/SteamGateModal";
import { Button } from "@/components/ui/button";
import { DeleteDesignButton } from "@/components/gallery/DeleteDesignButton";
import { designShareUrl } from "@/lib/share";
import { costBreakdown, COST_ROWS, decodeShare, buildSummary } from "@/components/builder/builderCore.js";

type Item = {
  slug: string;
  buildCode: string;
  name: string;
  authorName: string | null;
  chassisId: string;
  partCount: number;
  crowns: number;
  hull: number;
  thumbPath: string | null;
  likeCount: number;
  isMine: boolean;
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
  admin = false,
  initialView = "community",
}: {
  initial: Page;
  signedIn: boolean;
  admin?: boolean;
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
    if (initialView === "mine") load("mine", "top", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Client-only hydration from localStorage; runs once after mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem("sand_blueprint_v2");
      if (raw) {
        const s = JSON.parse(raw);
        setLocalDraft({ name: s?.name || "Untitled Rig" });
      }
    } catch {
      /* ignore malformed/absent local draft */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
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
    // "My designs" is open to everyone: signed out it shows the local draft
    // (the published list just comes back empty without an account).
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

  // "Open design" hands the build off to the builder via the localStorage key the
  // builder reads on mount (sand_load_code). The <Link href="/builder"> then does
  // the client navigation. Set synchronously in the click handler before nav.
  function loadInBuilder(buildCode: string) {
    try {
      localStorage.setItem("sand_load_code", buildCode);
    } catch {
      /* ignore storage failures — the builder just starts empty */
    }
  }

  // Delete: drop the card from the current page immediately (the server has
  // hard-deleted it); a reload would have dropped it from the list too.
  function removeFromList(slug: string) {
    setPage((p) => ({ ...p, items: p.items.filter((it) => it.slug !== slug) }));
  }

  // Copy a design's share link to the clipboard; flash a per-card "copied" tick.
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  async function copyShare(slug: string) {
    try {
      await navigator.clipboard.writeText(designShareUrl(slug, window.location.origin));
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug((c) => (c === slug ? null : c)), 1500);
    } catch {
      /* clipboard unavailable / write rejected — no-op */
    }
  }

  // Full per-card cost, computed from the build code. Falls back to the stored
  // crowns total if a code somehow fails to decode.
  function cardCost(d: Item): Record<string, number> {
    try {
      return costBreakdown(decodeShare(d.buildCode));
    } catch {
      return { crowns: d.crowns, mechanical: 0, pneumatic: 0, computing: 0 };
    }
  }

  // Crew compartments + turret-slot ("cannon") count, recomputed from the build code
  // (same source of truth the builder uses), so existing designs get them with no
  // schema change or backfill.
  function cardStats(d: Item): { crew: number; cannons: number } {
    try {
      const s = buildSummary(decodeShare(d.buildCode));
      return { crew: s.crew ?? 0, cannons: s.cannons ?? 0 };
    } catch {
      return { crew: 0, cannons: 0 };
    }
  }

  const showDraft = view === "mine" && !!localDraft;

  return (
    <div className="tg-app" data-screen-label="Trampler Gallery">
      {/* ===== top bar ===== */}
      <header className="tg-appbar">
        <div className="flex items-center gap-4">
          <ToolNavBrand title="Trampler Builder" />
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
            aria-pressed={view === "community"}
            onClick={() => switchView("community")}
          >
            Community
          </button>
          <button
            type="button"
            aria-pressed={view === "mine"}
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
        {page.items.length === 0 && !showDraft ? (
          // Empty state lives OUTSIDE the max-width grid so it centers across the
          // full scroll width rather than within the left-aligned grid track.
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
        ) : (
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
            const cost = cardCost(d);
            const stats = cardStats(d);
            // Others' designs open the read-only view page; your own open straight
            // in the editor for quick tweaking. (The draft card above always edits.)
            const openProps = d.isMine
              ? { href: "/builder", onClick: () => loadInBuilder(d.buildCode) }
              : { href: `/builder/${d.slug}` };
            const openTitle = d.isMine ? "Open in builder" : "View design";
            return (
              <div className="tg-card" key={d.slug}>
                <Link
                  {...openProps}
                  className="tg-thumb"
                  title={openTitle}
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
                  <Link {...openProps} className="tg-name">
                    {d.name}
                  </Link>
                  <div className="tg-sub">{d.authorName ?? "Unknown"}</div>
                  <div className="tg-meta">
                    <span className="m">
                      <b>{d.partCount}</b> parts
                    </span>
                    <span className="m">
                      <b>{stats.crew}</b> crew
                    </span>
                    <span className="m">
                      <b>{stats.cannons}</b> cannons
                    </span>
                    {COST_ROWS.map(([key, label, icon]) => (
                      <span className="m" key={key} title={label}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={icon}
                          alt=""
                          width={14}
                          height={14}
                          style={{ objectFit: "contain" }}
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                        />
                        <b>{(cost[key] ?? 0).toLocaleString()}</b>
                      </span>
                    ))}
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
                  <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {(admin || d.isMine) && (
                      <DeleteDesignButton slug={d.slug} onDeleted={() => removeFromList(d.slug)} />
                    )}
                    <button
                      type="button"
                      className="tg-icon-btn"
                      title={copiedSlug === d.slug ? "Link copied!" : "Copy share link"}
                      aria-label={`Copy share link for ${d.name}`}
                      onClick={() => copyShare(d.slug)}
                    >
                      {copiedSlug === d.slug ? "✓" : "🔗"}
                    </button>
                    <Link
                      {...openProps}
                      className="tg-icon-btn"
                      title={openTitle}
                      aria-label={d.isMine ? `Open ${d.name} in the builder` : `View ${d.name}`}
                    >
                      ↗
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

        </div>
        )}

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
