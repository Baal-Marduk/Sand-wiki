'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ToolNavBrand } from '@/components/ToolNavBrand'
import { ToolNav } from '@/components/ToolNav'
import { AuthMenuClient } from '@/components/AuthMenuClient'
import { SteamGateModal } from '@/components/SteamGateModal'
import { actionButtonClass } from '@/components/ui/button'
import { UpvoteButton } from '@/components/gallery/UpvoteButton'
import { DeleteDesignButton } from '@/components/gallery/DeleteDesignButton'
import { designShareUrl } from '@/lib/share'
import { decodeShare, manifest, buildSummary, costBreakdown, COST_ROWS } from './builderCore.js'
import BuilderScene from './BuilderScene'
import '@/components/gallery/gallery.css' // for the .tg-vote upvote styling

// Read-only view of a published trampler: orbit-only 3D + stats, with upvote,
// edit-to-clone, share-link, and (owner/admin) delete actions.
export default function BuilderView({
  buildCode, name, authorName, slug, likeCount, initialLiked, signedIn, canDelete,
}) {
  const router = useRouter()
  const [gateOpen, setGateOpen] = useState(false)
  const [flash, setFlash] = useState('')

  // Decode once. A malformed code yields null → friendly fallback.
  const state = useMemo(() => {
    try { return decodeShare(buildCode) } catch { return null }
  }, [buildCode])

  const man = useMemo(() => (state ? manifest(state) : { rows: [], total: 0 }), [state])
  const summary = useMemo(() => (state ? buildSummary(state) : null), [state])
  const cost = useMemo(() => (state ? costBreakdown(state) : { crowns: 0, mechanical: 0, pneumatic: 0, computing: 0 }), [state])

  function note(msg) {
    setFlash(msg)
    window.clearTimeout(note._t)
    note._t = window.setTimeout(() => setFlash(''), 2000)
  }

  // Edit = clone: hand the build to the editor (login required), then open it.
  function edit() {
    if (!signedIn) { setGateOpen(true); return }
    try { localStorage.setItem('sand_load_code', buildCode) } catch { /* ignore */ }
    router.push('/builder')
  }

  function share() {
    navigator.clipboard.writeText(designShareUrl(slug, window.location.origin))
      .then(() => note('Link copied'))
      .catch(() => note('Copy failed'))
  }

  return (
    <div className="tb-app" data-screen-label="Trampler Builder">
      <header className="tb-appbar">
        <ToolNavBrand title="Trampler Builder" />
        <ToolNav active="builder" />
        <span className="spacer" />
        <UpvoteButton slug={slug} initialLikeCount={likeCount} initialLiked={initialLiked} signedIn={signedIn} />
        <button type="button" className={actionButtonClass} onClick={edit}>✎ Edit</button>
        <button type="button" className={actionButtonClass} onClick={share}>⤴ {flash || 'Share'}</button>
        {canDelete && <DeleteDesignButton slug={slug} />}
        <AuthMenuClient />
      </header>

      <div className="tb-body">
        <section className="tb-viewport">
          {state ? (
            <BuilderScene
              state={state}
              level={1}
              activePart={null}
              activeRot={0}
              selectedId={null}
              readOnly
            />
          ) : (
            <div className="bld-loading">This build couldn’t be loaded.</div>
          )}
        </section>

        <aside className="tb-panel right">
          <div className="tb-panel-head">{name}</div>
          <div className="tb-section">
            <div className="tb-section-h">By</div>
            <div className="tb-mani-row"><span className="tb-mani-name">{authorName ?? 'Unknown'}</span></div>
          </div>

          {summary && (
            <div className="tb-section">
              <div className="tb-section-h">Summary</div>
              <div className="tb-mani-row"><span className="tb-mani-name">Parts</span><span className="tb-mani-qty">{summary.partCount}</span></div>
              <div className="tb-mani-row"><span className="tb-mani-name">Hull</span><span className="tb-mani-qty">{summary.hull}</span></div>
              <div className="tb-mani-row"><span className="tb-mani-name">Crew</span><span className="tb-mani-qty">{summary.crew}</span></div>
            </div>
          )}

          <div className="tb-section">
            <div className="tb-section-h">Build Cost</div>
            <div className="tb-cost">
              {COST_ROWS.map(([key, label, icon]) => (
                <div key={key} className={`tb-cost-row ${cost[key] ? '' : 'zero'}`}>
                  <img className="tb-cost-ic" src={icon} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                  <span className="tb-cost-val">{(cost[key] ?? 0).toLocaleString()}</span>
                  <span className="tb-cost-label">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {man.rows.length > 0 && (
            <div className="tb-section">
              <div className="tb-section-h">Manifest</div>
              {man.rows.map((r) => (
                <div key={r.part.id} className="tb-mani-row">
                  <span className="tb-mani-name">{r.part.name}</span>
                  <span className="tb-mani-qty">×{r.n}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <SteamGateModal open={gateOpen} onClose={() => setGateOpen(false)} returnTo={`/builder/${slug}`} />
    </div>
  )
}
