"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import "./tech-tree.css";
import type { TechTree, TechNode } from "@/lib/tech-tree/types";
import { LAYOUT, computeLayout, ancestors, pathCost } from "@/lib/tech-tree/layout";

const STORE_KEY = "sand_techtree_unlocked_v1";
const fmt = (n: number) => n.toLocaleString("en-US");

function Glyph({ icon, alt }: { icon: string | null; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return icon ? <img src={icon} alt="" aria-hidden /> : <span aria-label={alt}>▦</span>;
}

export function TechTreeView({ tree }: { tree: TechTree }) {
  const layout = useMemo(() => computeLayout(tree), [tree]);
  const byId = useMemo(() => Object.fromEntries(tree.nodes.map((n) => [n.slug, n])) as Record<string, TechNode>, [tree]);
  const posById = useMemo(() => Object.fromEntries(layout.positions.map((p) => [p.slug, p])), [layout]);
  const accentOf = useMemo(() => Object.fromEntries(tree.factions.map((f) => [f.id, f.accent])), [tree]);

  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ slug: string; rect: DOMRect } | null>(null);

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

  const persist = useCallback((s: Set<string>) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
  }, []);

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

  const cost = useMemo(() => pathCost(tree.nodes, [...selected], unlocked), [tree.nodes, selected, unlocked]);

  return (
    <div className="tt-app">
      <header className="tt-appbar">
        <Link href="/" className="tt-brand"><span className="tt-brand-mark">S</span><span className="tt-brand-name">SAND<span className="sub">·</span>WIKI</span></Link>
        <span className="tt-page-title">Tech Tree</span>
        <div className="tt-toolbar">
          <span className="tt-progress">{unlocked.size} / {tree.nodes.length} unlocked</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear selection</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            if (!confirm("Reset your unlocked progress to the starting techs?")) return;
            const d = new Set(tree.defaultUnlocked); setUnlocked(d); persist(d);
          }}>Reset progress</button>
        </div>
      </header>

      <div className="tt-legend">
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--border-strong)" }} />Locked</span>
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--success)", background: "color-mix(in srgb,var(--success) 14%,transparent)" }} />Unlocked</span>
        <span className="tt-legend-item"><span className="tt-legend-sw" style={{ borderColor: "var(--primary)", boxShadow: "0 0 0 1px var(--primary)" }} />On selected path</span>
        <span className="hint">Click a tech to plan its path · click the ring to mark it already unlocked · select several to combine</span>
      </div>

      <div className="tt-viewport">
        <div id="tt-tierbar" style={{ width: layout.canvasW }}>
          {layout.tiers.map((t) => {
            const first = t.cols[0], last = t.cols[t.cols.length - 1];
            const left = LAYOUT.PAD_LEFT + first * LAYOUT.COL_W - 24;
            const right = LAYOUT.PAD_LEFT + last * LAYOUT.COL_W + LAYOUT.CARD_W + 24;
            return (
              <div key={t.tier} className="tt-tier-label" style={{ left, width: right - left }}>
                <span className="tt-tier-roman">{t.roman}</span>{t.label}
              </div>
            );
          })}
        </div>

        <div id="tt-canvas" style={{ position: "relative", width: layout.canvasW, height: layout.canvasH }}>
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
                  <span className="tt-faction-glyph glyph"><Glyph icon={null} alt={f.name} /></span>
                  <div className="tt-faction-meta"><span className="tt-faction-name">{f.name}</span><span className="tt-faction-sub">Faction line</span></div>
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
                   onMouseEnter={(ev) => setHover({ slug: n.slug, rect: (ev.currentTarget as HTMLElement).getBoundingClientRect() })}
                   onMouseLeave={() => setHover((h) => (h?.slug === n.slug ? null : h))}>
                <span className="tnode-rail" />
                <button className="tnode-status" aria-label={`Mark ${n.name} ${unlocked.has(n.slug) ? "locked" : "unlocked"}`} aria-pressed={unlocked.has(n.slug)}
                        onClick={(ev) => { ev.stopPropagation(); toggleUnlocked(n.slug); }} />
                <div className="tnode-main">
                  <div className="tnode-head"><span className="tnode-name" title={n.name}>{n.name}</span></div>
                  <div className="tnode-cost"><span className="tnode-scrap" /><span className="tnode-num">{fmt(n.crowns)}</span></div>
                </div>
                <span className="tnode-glyph glyph"><Glyph icon={n.glyphIcon} alt={n.name} /></span>
              </div>
            );
          })}
        </div>
      </div>

      {hover && <Tooltip node={byId[hover.slug]} rect={hover.rect} unlocked={unlocked} nodes={tree.nodes} />}

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
              <div className="tt-sum-figures">
                <div className="tt-fig tt-fig-main"><span className="tt-fig-label">Remaining to unlock</span><span className="tt-fig-val">{fmt(cost.remainingCrowns)}<i>crowns</i></span></div>
                <div className="tt-fig"><span className="tt-fig-label">Techs left</span><span className="tt-fig-val tt-fig-sm">{cost.techsLeft}</span></div>
                <div className="tt-fig"><span className="tt-fig-label">Full path</span><span className="tt-fig-val tt-fig-sm">{fmt(cost.fullCrowns)}</span></div>
              </div>
              {cost.materials.length > 0 && (
                <div className="tt-sum-mats">
                  <div className="tt-sum-plan-h">Materials needed</div>
                  <div className="tt-mat-grid">
                    {cost.materials.map((m) => (
                      <span key={m.name} className="tt-mat"><span className="tt-mat-ic"><Glyph icon={m.icon} alt={m.name} /></span><b>{fmt(m.amount)}</b> {m.name}</span>
                    ))}
                  </div>
                </div>
              )}
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
    </div>
  );
}

function Tooltip({ node, rect, unlocked, nodes }: { node: TechNode; rect: DOMRect; unlocked: Set<string>; nodes: TechNode[] }) {
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
    <div id="tt-tip" ref={ref} className="show" style={{ top: pos.top, left: pos.left }}>
      <div className="tt-tip-h">
        <span className="tt-tip-name">{node.name}</span>
        <span className={"tt-tip-st" + (isUnlocked ? " ok" : "")}>{isUnlocked ? "Unlocked" : "Locked"}</span>
      </div>
      <div className="tt-tip-cost">
        {node.costs.map((c) => (
          <div key={c.name} className="tt-tip-costrow">
            <span className="tt-tip-ic"><Glyph icon={c.icon} alt={c.name} /></span>
            <b>{fmt(c.amount)}</b><span>{c.name}</span>
          </div>
        ))}
      </div>
      <div className="tt-tip-row"><span>Requires</span><b>{reqNames}</b></div>
      {node.unlocks.length > 0 && <div className="tt-tip-row"><span>Unlocks</span><b>{node.unlocks.map((u) => u.name).join(", ")}</b></div>}
    </div>
  );
}
