"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import "./tech-tree.css";
import type { TechTree, TechNode } from "@/lib/tech-tree/types";
import { LAYOUT, computeLayout, ancestors, pathCost } from "@/lib/tech-tree/layout";
import { actionButtonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ToolNavBrand } from "@/components/ToolNavBrand";
import { AuthMenuClient } from "@/components/AuthMenuClient";

const STORE_KEY = "sand_techtree_unlocked_v1";
const fmt = (n: number) => n.toLocaleString("en-US");

// Re-anchoring scroll must happen before paint (no flash). Fall back to useEffect during SSR
// to avoid React's "useLayoutEffect does nothing on the server" warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 1.1; // multiplicative per wheel notch / button press
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function Glyph({ icon, alt }: { icon: string | null; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return icon ? <img src={icon} alt="" aria-hidden loading="lazy" decoding="async" /> : <span aria-label={alt}>▦</span>;
}

function CostIcon({ icon, href, alt }: { icon: string | null; href: string | null; alt: string }) {
  const g = <Glyph icon={icon} alt={alt} />;
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="tt-cost-link" title={alt}>{g}</a>
    : g;
}

export function TechTreeView({ tree }: { tree: TechTree }) {
  const layout = useMemo(() => computeLayout(tree), [tree]);
  const byId = useMemo(() => Object.fromEntries(tree.nodes.map((n) => [n.slug, n])) as Record<string, TechNode>, [tree]);
  const posById = useMemo(() => Object.fromEntries(layout.positions.map((p) => [p.slug, p])), [layout]);
  const accentOf = useMemo(() => Object.fromEntries(tree.factions.map((f) => [f.id, f.accent])), [tree]);

  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ slug: string; rect: DOMRect } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const appliedZoom = useRef(1); // zoom the current scroll position is consistent with
  const pendingAnchor = useRef<{ ax: number; ay: number } | null>(null);
  const didDeepLink = useRef(false);

  useEffect(() => {
    // Client-only hydration from localStorage; must run after mount, not during render.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { setUnlocked(new Set((JSON.parse(raw) as string[]).filter((s) => byId[s]))); return; }
    } catch { /* ignore */ }
    setUnlocked(new Set(tree.defaultUnlocked));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [byId, tree.defaultUnlocked]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (didDeepLink.current) return;
    const slug = new URLSearchParams(window.location.search).get("select");
    if (!slug || !byId[slug]) return;
    didDeepLink.current = true;
    setSelected(new Set([slug]));
    const vp = viewportRef.current, pos = posById[slug];
    if (vp && pos) {
      vp.scrollTo({
        left: Math.max(0, pos.x + LAYOUT.CARD_W / 2 - vp.clientWidth / 2),
        top: Math.max(0, pos.y + LAYOUT.CARD_H / 2 - vp.clientHeight / 2),
        behavior: "smooth",
      });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [byId, posById]);

  const persist = useCallback((s: Set<string>) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
  }, []);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = useCallback(() => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } }, []);
  const cancelShow = useCallback(() => { if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; } }, []);
  const scheduleShow = useCallback((slug: string, rect: DOMRect) => {
    cancelHide(); cancelShow();
    showTimer.current = setTimeout(() => setHover({ slug, rect }), 320);
  }, [cancelHide, cancelShow]);
  const scheduleHide = useCallback(() => { cancelShow(); cancelHide(); hideTimer.current = setTimeout(() => setHover(null), 140); }, [cancelHide, cancelShow]);

  const ps = useMemo(() => {
    const set = new Set<string>();
    for (const t of selected) { set.add(t); ancestors(tree.nodes, t).forEach((a) => set.add(a)); }
    return set;
  }, [selected, tree.nodes]);
  const hasSel = selected.size > 0;

  const toggleUnlocked = useCallback((slug: string) => {
    setUnlocked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
        // cascade: iteratively remove any node whose prereq is no longer unlocked
        let changed = true;
        while (changed) { changed = false; for (const n of tree.nodes) { if (next.has(n.slug) && n.prereqs.some((r) => !next.has(r))) { next.delete(n.slug); changed = true; } } }
      } else {
        next.add(slug);
        ancestors(tree.nodes, slug).forEach((a) => next.add(a));
      }
      persist(next);
      return next;
    });
  }, [tree.nodes, persist]);

  const toggleSelected = useCallback((slug: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  }, []);

  const pan = useRef<{ x: number; y: number; left: number; top: number; active: boolean } | null>(null);
  const panned = useRef(false);
  const onPanDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".tnode-status")) return; // let the ring handle its own clicks
    const vp = viewportRef.current; if (!vp) return;
    pan.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop, active: false };
  }, []);
  const onPanMove = useCallback((e: React.PointerEvent) => {
    const p = pan.current, vp = viewportRef.current; if (!p || !vp) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.active && Math.hypot(dx, dy) < 4) return; // movement threshold → still a click
    if (!p.active) { p.active = true; vp.setPointerCapture(e.pointerId); vp.classList.add("is-panning"); }
    vp.scrollLeft = p.left - dx;
    vp.scrollTop = p.top - dy;
  }, []);
  const endPan = useCallback((e: React.PointerEvent) => {
    const vp = viewportRef.current;
    if (pan.current?.active) panned.current = true;
    if (vp) { vp.classList.remove("is-panning"); if (vp.hasPointerCapture?.(e.pointerId)) vp.releasePointerCapture(e.pointerId); }
    pan.current = null;
  }, []);

  const zoomTo = useCallback((factor: number, anchorX?: number, anchorY?: number) => {
    const vp = viewportRef.current; if (!vp) return;
    const prev = zoomRef.current;
    const z = clampZoom(prev * factor);
    if (z === prev) return;
    // Defer the scroll re-anchor to the layout effect below: it must run AFTER the canvas
    // transform + sizer have resized, otherwise the browser clamps scrollLeft/Top against the
    // stale (pre-resize) scroll bounds and the cursor anchor visibly jumps each step.
    pendingAnchor.current = { ax: anchorX ?? vp.clientWidth / 2, ay: anchorY ?? vp.clientHeight / 2 };
    zoomRef.current = z;
    setZoom(z);
  }, []);

  // After the new zoom has been committed to the DOM (sizer resized, canvas scaled), re-anchor
  // scroll so the point under the cursor stays fixed. `appliedZoom` tracks the zoom the current
  // scroll matches, so the ratio is correct even if React coalesces several zoom steps.
  useIsoLayoutEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const from = appliedZoom.current;
    appliedZoom.current = zoom;
    const p = pendingAnchor.current; pendingAnchor.current = null;
    if (!p || from === zoom) return;
    const ratio = zoom / from;
    vp.scrollLeft = (vp.scrollLeft + p.ax) * ratio - p.ax;
    vp.scrollTop = (vp.scrollTop + p.ay) * ratio - p.ay;
  }, [zoom]);

  useEffect(() => {
    const vp = viewportRef.current; if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      // Scale the step to the scroll delta so trackpads (many tiny deltas) and mice (few large
      // deltas) both zoom smoothly; clamp so a single event is always a gentle step.
      const factor = Math.min(1.25, Math.max(0.8, Math.exp(-e.deltaY * 0.0015)));
      zoomTo(factor, e.clientX - r.left, e.clientY - r.top);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const fitToScreen = useCallback(() => {
    const vp = viewportRef.current; if (!vp) return;
    const z = clampZoom(Math.min(vp.clientWidth / layout.canvasW, vp.clientHeight / layout.canvasH));
    zoomRef.current = z;
    setZoom(z);
    vp.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }, [layout.canvasW, layout.canvasH]);

  const cost = useMemo(() => pathCost(tree.nodes, [...selected], unlocked), [tree.nodes, selected, unlocked]);

  return (
    <div className="tt-app">
      <header className="tt-appbar">
        <ToolNavBrand title="Tech Tree" />
        <div className="tt-toolbar">
          <span className="tt-progress">{unlocked.size} / {tree.nodes.length} unlocked</span>
          <div className="tt-zoom">
            <button type="button" className={actionButtonClass} onClick={() => zoomTo(1 / ZOOM_STEP)} aria-label="Zoom out">−</button>
            <span className="tt-zoom-val">{Math.round(zoom * 100)}%</span>
            <button type="button" className={actionButtonClass} onClick={() => zoomTo(ZOOM_STEP)} aria-label="Zoom in">+</button>
            <button type="button" className={actionButtonClass} onClick={fitToScreen}>Fit</button>
          </div>
          <button type="button" className={actionButtonClass} onClick={() => setSelected(new Set())}>Clear selection</button>
          <button type="button" className={actionButtonClass} onClick={() => setResetOpen(true)}>Reset progress</button>
        </div>
        <span style={{ marginLeft: "auto" }} />
        <AuthMenuClient />
      </header>

      <div className="tt-legend">
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--border-strong)" }} />Locked</span>
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--success)", background: "color-mix(in srgb,var(--success) 14%,transparent)" }} />Unlocked</span>
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--primary)", boxShadow: "0 0 0 1px var(--primary)" }} />On selected path</span>
        <span className="hint">Click a tech to plan its path · click the ring to mark it already unlocked · select several to combine</span>
      </div>

      <div className="tt-viewport" ref={viewportRef}
           onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={endPan}
           onPointerLeave={endPan} onPointerCancel={endPan}
           onClickCapture={(e) => { if (panned.current) { panned.current = false; e.stopPropagation(); } }}>
        <div id="tt-tierbar" style={{ width: layout.canvasW * zoom }}>
          {layout.tiers.map((t) => {
            const first = t.cols[0], last = t.cols[t.cols.length - 1];
            const left = LAYOUT.PAD_LEFT + first * LAYOUT.COL_W - 24;
            const right = LAYOUT.PAD_LEFT + last * LAYOUT.COL_W + LAYOUT.CARD_W + 24;
            return (
              <div key={t.tier} className="tt-tier-label" style={{ left: left * zoom, width: (right - left) * zoom }}>
                <span className="tt-tier-roman">{t.roman}</span>{t.label}
              </div>
            );
          })}
        </div>

        <div className="tt-sizer" style={{ width: layout.canvasW * zoom, height: layout.canvasH * zoom }}>
        <div id="tt-canvas" style={{ position: "relative", width: layout.canvasW, height: layout.canvasH, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
          <svg id="tt-svg" width={layout.canvasW} height={layout.canvasH} viewBox={`0 0 ${layout.canvasW} ${layout.canvasH}`} xmlns="http://www.w3.org/2000/svg">
            {layout.edges.map((e) => {
              const to = posById[e.to]; if (!to) return null;
              let x1: number, y1: number;
              if (e.from === null) {
                const b = layout.bands[byId[e.to].faction];
                x1 = 8 + LAYOUT.ROOT_W; y1 = b.top + b.height / 2;
              } else {
                const from = posById[e.from]; if (!from) return null;
                x1 = from.x + LAYOUT.CARD_W; y1 = from.y + LAYOUT.CARD_H / 2;
              }
              const x2 = to.x, y2 = to.y + LAYOUT.CARD_H / 2;
              const midX = x1 + Math.max(18, (x2 - x1) / 2);
              const active = hasSel && ps.has(e.to) && (e.from === null || ps.has(e.from));
              const done = unlocked.has(e.to) && (e.from === null || unlocked.has(e.from));
              const cls = "tt-edge" + (done ? " done" : active ? " active" : "");
              return <path key={`${e.from ?? "root"}->${e.to}`} className={cls} d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`} />;
            })}
          </svg>

          {tree.factions.map((f) => {
            const b = layout.bands[f.id];
            return (
              <div key={f.id}>
                <div className="tt-band" style={{ ["--fac" as string]: f.accent, top: b.top - 18, height: b.height + 12, width: layout.canvasW }} />
                <div className="tt-faction" style={{ ["--fac" as string]: f.accent, left: 8, top: b.top + b.height / 2 - 33, width: LAYOUT.ROOT_W }}>
                  <span className="tt-faction-glyph glyph"><Glyph icon={f.rootPart?.icon ?? null} alt={f.name} /></span>
                  <div className="tt-faction-meta">
                    <span className="tt-faction-name">{f.name}</span>
                    {f.rootPart?.href ? (
                      <Link className="tt-faction-root" href={f.rootPart.href}>{f.rootPart.name}</Link>
                    ) : (
                      <span className="tt-faction-sub">Faction line</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {tree.nodes.map((n) => {
            const p = posById[n.slug]; if (!p) return null;
            const cls = ["tnode",
              unlocked.has(n.slug) ? "is-unlocked" : "",
              selected.has(n.slug) ? "is-selected" : "",
              hasSel && ps.has(n.slug) && !selected.has(n.slug) ? "in-path" : "",
              hasSel && !ps.has(n.slug) ? "dimmed" : "",
            ].filter(Boolean).join(" ");
            return (
              <div key={n.slug} className={cls}
                   style={{ ["--fac" as string]: accentOf[n.faction], left: p.x, top: p.y, width: LAYOUT.CARD_W, height: LAYOUT.CARD_H }}
                   role="button"
                   tabIndex={0}
                   onClick={() => toggleSelected(n.slug)}
                   onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleSelected(n.slug); } }}
                   onMouseEnter={(ev) => scheduleShow(n.slug, (ev.currentTarget as HTMLElement).getBoundingClientRect())}
                   onMouseLeave={scheduleHide}>
                <span className="tnode-rail" />
                <button className="tnode-status" aria-label={`Mark ${n.name} ${unlocked.has(n.slug) ? "locked" : "unlocked"}`} aria-pressed={unlocked.has(n.slug)}
                        onClick={(ev) => { ev.stopPropagation(); toggleUnlocked(n.slug); }} />
                <div className="tnode-main">
                  <div className="tnode-head"><span className="tnode-name" title={n.name}>{n.name}</span></div>
                  <div className="tnode-cost">
                    {n.crownsIcon
                      ? <span className="tnode-coin"><Glyph icon={n.crownsIcon} alt="Crowns" /></span>
                      : <span className="tnode-scrap" />}
                    <span className="tnode-num">{fmt(n.crowns)}</span>
                  </div>
                </div>
                <span className="tnode-glyph glyph"><Glyph icon={n.glyphIcon} alt={n.name} /></span>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {hover && <Tooltip node={byId[hover.slug]} rect={hover.rect} unlocked={unlocked} nodes={tree.nodes} onEnter={cancelHide} onLeave={scheduleHide} />}

      <aside className="tt-summary">
        <div className="tt-summary-h"><span className="ti">Path planner</span></div>
        <div id="tt-summary-body">
          {selected.size === 0 ? (
            <div className="tt-sum-empty">Click any tech to plan a path. Its prerequisites light up and the remaining cost — counting only what you haven’t unlocked yet — shows here. Select several to combine paths. Tick the ring on a card to mark it already unlocked.</div>
          ) : (
            <>
              <div className="tt-sum-targets">
                {[...selected].map((s) => (
                  <span key={s} className="tt-chip" onClick={() => toggleSelected(s)}>{byId[s].name}<i className="tt-chip-x">×</i></span>
                ))}
              </div>
              {cost.materials.length > 0 && (
                <div className="tt-sum-mats">
                  <div className="tt-sum-mats-h">Materials needed</div>
                  <div className="tt-mat-grid">
                    {cost.materials.map((m) => (
                      <span key={m.name} className="tt-mat"><span className="tt-mat-ic"><CostIcon icon={m.icon} href={m.href} alt={m.name} /></span><b>{fmt(m.amount)}</b><span className="tt-mat-name">{m.name}</span></span>
                    ))}
                  </div>
                </div>
              )}
              <div className="tt-sum-figures">
                <div className="tt-fig tt-fig-main"><span className="tt-fig-label">Remaining to unlock</span><span className="tt-fig-val">{fmt(cost.remainingCrowns)}<i>crowns</i></span></div>
                <div className="tt-fig"><span className="tt-fig-label">Techs left</span><span className="tt-fig-val tt-fig-sm">{cost.techsLeft}</span></div>
                <div className="tt-fig"><span className="tt-fig-label">Full path</span><span className="tt-fig-val tt-fig-sm">{fmt(cost.fullCrowns)}</span></div>
              </div>
              {cost.techsLeft > 0 ? (
                <div className="tt-sum-plan">
                  <div className="tt-sum-plan-h">Build order
                    <button className="tt-mini-btn" onClick={() => { const next = new Set(unlocked); ps.forEach((id) => next.add(id)); setUnlocked(next); persist(next); }}>Mark all unlocked</button>
                  </div>
                  <ol className="tt-steps">
                    {[...ps].filter((id) => !unlocked.has(id)).sort((a, b) => layout.cols[`${byId[a].tier}${byId[a].letter}`] - layout.cols[`${byId[b].tier}${byId[b].letter}`]).map((id) => (
                      <li key={id} className="tt-step">
                        <span className="tt-step-dot" style={{ background: accentOf[byId[id].faction] }} />
                        <span className="tt-step-name">{byId[id].name}</span>
                        <span className="tt-step-cost">{fmt(byId[id].crowns)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : <div className="tt-sum-done">Every tech on this path is already unlocked.</div>}
            </>
          )}
        </div>
      </aside>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset progress?"
        description="This unchecks every tech and clears all your unlocked progress."
        confirmLabel="Reset"
        destructive
        onConfirm={() => { const cleared = new Set<string>(); setUnlocked(cleared); persist(cleared); }}
      />
    </div>
  );
}

function Tooltip({ node, rect, unlocked, nodes, onEnter, onLeave }: {
  node: TechNode; rect: DOMRect; unlocked: Set<string>; nodes: TechNode[];
  onEnter: () => void; onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  useEffect(() => {
    const tr = ref.current?.getBoundingClientRect();
    const h = tr?.height ?? 0, w = tr?.width ?? 252;
    let top = rect.top - h - 10; if (top < 8) top = rect.bottom + 10;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top, left });
  }, [rect]);
  const isUnlocked = unlocked.has(node.slug);
  const reqNames = node.prereqs.length
    ? node.prereqs.map((r) => nodes.find((n) => n.slug === r)?.name ?? r).join(", ")
    : "Faction root — no prerequisite";
  return (
    <div id="tt-tip" ref={ref} className="show" style={{ top: pos.top, left: pos.left }}
         onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="tt-tip-h">
        <span className="tt-tip-name">{node.name}</span>
        <span className={"tt-tip-st" + (isUnlocked ? " ok" : "")}>{isUnlocked ? "Unlocked" : "Locked"}</span>
      </div>
      <div className="tt-tip-cost">
        {node.costs.map((c) => (
          <div key={c.name} className="tt-tip-costrow">
            <span className="tt-tip-ic"><CostIcon icon={c.icon} href={c.href} alt={c.name} /></span>
            <b>{fmt(c.amount)}</b><span>{c.name}</span>
          </div>
        ))}
      </div>
      <div className="tt-tip-row"><span>Requires</span><b>{reqNames}</b></div>
      {node.unlocks.length > 0 && (
        <div className="tt-tip-unlocks">
          <span className="tt-tip-unlocks-h">Unlocks</span>
          <div className="tt-tip-unlocks-list">
            {node.unlocks.map((u) => (
              u.href
                ? <Link key={u.name} href={u.href} className="tt-tip-unlock-link">{u.name}</Link>
                : <span key={u.name} className="tt-tip-unlock-link is-plain">{u.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
