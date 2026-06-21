// Export builder state to an in-game .wbt Trampler save — the inverse of wbtImport.js.
// Fully client-side / offline.
//
//   build: BSON  ->  XOR(6-byte key, reset every 0xA000)  ->  gzip
//
// The BSON writer here was validated byte-for-byte against a real save. Two fields
// can't be reproduced from our data, so we use the "minimal" strategy (see
// docs/superpowers/specs/2026-06-21-wbt-export-design.md): DecorationsInfo is null
// (the game falls back to default connections) and the per-part Compartment/Definition
// hashes come from a harvested table (blank for parts we haven't seen yet). Whether the
// game accepts blanks/nulls is confirmed by loading a generated file in-game.

import partHashes from './data/part_wbt_hashes.json'

const KEY = [0x70, 0xdd, 0x1f, 0x2a, 0x0b, 0x4a]
const CHUNK = 0xa000

// XOR is symmetric — same transform as wbtImport's xorDecode.
function xorEncode(bytes) {
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ KEY[(i % CHUNK) % 6]
  return out
}

async function gzip(bytes) {
  const cs = new CompressionStream('gzip')
  const stream = new Response(bytes).body.pipeThrough(cs)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// ---- BSON writer (the subset Newtonsoft uses for these saves) ----
// Values are tagged {t, v} so JS's ambiguous numbers map to the right BSON type.
const i32 = (v) => ({ t: 0x10, v })
const dbl = (v) => ({ t: 0x01, v })
const dt = (v) => ({ t: 0x09, v: BigInt(v) })
const str = (v) => ({ t: 0x02, v })
const bin = (v) => ({ t: 0x05, v })
const nul = () => ({ t: 0x0a, v: null })
const doc = (fields) => ({ t: 0x03, v: fields }) // fields: [[key, tagged], ...]
const arr = (items) => ({ t: 0x04, v: items.map((it, i) => [String(i), it]) })

const te = new TextEncoder()
function concat(arrs) {
  let n = 0
  for (const a of arrs) n += a.length
  const o = new Uint8Array(n)
  let i = 0
  for (const a of arrs) { o.set(a, i); i += a.length }
  return o
}
function encDoc(fields) {
  const parts = []
  for (const [key, node] of fields) {
    parts.push(Uint8Array.of(node.t))
    parts.push(te.encode(key), Uint8Array.of(0))
    parts.push(encVal(node))
  }
  const body = concat(parts)
  const out = new Uint8Array(4 + body.length + 1)
  new DataView(out.buffer).setInt32(0, out.length, true)
  out.set(body, 4)
  return out // trailing byte already 0
}
function encVal(node) {
  const { t, v } = node
  switch (t) {
    case 0x01: { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return b }
    case 0x02: { const sb = te.encode(v); const b = new Uint8Array(4 + sb.length + 1); new DataView(b.buffer).setInt32(0, sb.length + 1, true); b.set(sb, 4); return b }
    case 0x03: return encDoc(v)
    case 0x04: return encDoc(v)
    case 0x05: { const b = new Uint8Array(4 + 1 + v.length); new DataView(b.buffer).setInt32(0, v.length, true); b[4] = 0; b.set(v, 5); return b }
    case 0x08: return Uint8Array.of(v ? 1 : 0)
    case 0x09: { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, v, true); return b }
    case 0x0a: return new Uint8Array(0)
    case 0x10: { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return b }
    case 0x12: { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, v, true); return b }
    default: throw new Error('unsupported BSON tag 0x' + t.toString(16))
  }
}

// The game stores compartment cells in absolute space; the chassis sits one level below
// the first deck (CellCoordinate y = -1 in observed saves). Our builder keeps parts
// relative to a chassis at (0,0,0), so absolute = relative + this origin. Import
// subtracts it back, so this round-trips.
const CHASSIS_ORIGIN = { x: 0, y: -1, z: 0 }

function hashesFor(partId) {
  const h = partHashes[partId]
  return { c: (h && h.c) || '', d: (h && h.d) || '' }
}
function compartmentDoc(partId, cx, cy, cz, rotQuarter) {
  const h = hashesFor(partId)
  return doc([
    ['Id', i32(0)],
    ['EpbId', str(`walker_${partId}_epb`)],
    ['CellCoordinate', doc([['x', i32(cx)], ['y', i32(cy)], ['z', i32(cz)]])],
    ['DecorationsInfo', nul()],
    ['Rotation', dbl((((rotQuarter % 4) + 4) % 4) * 90)],
    ['CompartmentHash', str(h.c)],
    ['DefinitionHash', str(h.d)],
  ])
}

// state: { chassisId, placements:[{partId,x,y,z,rot}], name }
// opts:  { icon: Uint8Array(512*512*4) | null, uniqueId?: string, createdAt?: number }
// returns the .wbt bytes (gzipped). Async because gzip is.
export async function stateToWbt(state, opts = {}) {
  const o = CHASSIS_ORIGIN
  const compartments = (state.placements || []).map((pl) =>
    compartmentDoc(pl.partId, pl.x + o.x, pl.y + o.y, pl.z + o.z, pl.rot || 0),
  )
  const chassisH = hashesFor(state.chassisId)
  const walker = doc([
    ['Id', str('0')],
    ['UniqueId', str(opts.uniqueId || randomGuid())],
    ['Version', i32(1)],
    ['Chassis', doc([
      ['Id', i32(0)],
      ['EpbId', str(`walker_${state.chassisId}_epb`)],
      ['CellCoordinate', doc([['x', i32(o.x)], ['y', i32(o.y)], ['z', i32(o.z)]])],
      ['DecorationsInfo', nul()],
      ['Rotation', dbl(0)],
      ['CompartmentHash', str(chassisH.c)],
      ['DefinitionHash', str(chassisH.d)],
    ])],
    ['Compartments', arr(compartments)],
  ])

  const SIZE = 512
  const icon = opts.icon && opts.icon.length === SIZE * SIZE * 4 ? opts.icon : new Uint8Array(SIZE * SIZE * 4)
  const name = (state.name || '').trim()

  const root = encDoc([
    ['textureSize', i32(SIZE)],
    ['textureRawData', bin(icon)],
    ['walker', walker],
    ['format', i32(4)],
    ['iconVersion', i32(5)],
    ['firstNameIndex', i32(0)],
    ['secondNameIndex', i32(0)],
    ['creationTime', dt(opts.createdAt || Date.now())],
    ['name', name ? str(name) : nul()],
  ])

  return gzip(xorEncode(root))
}

function randomGuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ---- icon: render an image source to a 512x512 RGBA buffer (Unity texture order:
// bottom-up rows). src is a data URL or same-origin URL; returns a blank buffer if it
// can't be loaded so export still works. ----
export async function iconRgbaFromSrc(src) {
  const SIZE = 512
  const blank = () => new Uint8Array(SIZE * SIZE * 4)
  if (!src || typeof document === 'undefined') return blank()
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image()
      im.crossOrigin = 'anonymous'
      im.onload = () => res(im)
      im.onerror = rej
      im.src = src
    })
    const c = document.createElement('canvas')
    c.width = c.height = SIZE
    const ctx = c.getContext('2d')
    // cover-fit the (likely non-square) thumbnail into the square icon
    const scale = Math.max(SIZE / img.width, SIZE / img.height)
    const dw = img.width * scale, dh = img.height * scale
    ctx.drawImage(img, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh)
    const top = ctx.getImageData(0, 0, SIZE, SIZE).data // RGBA, top-down
    const out = new Uint8Array(SIZE * SIZE * 4)
    for (let y = 0; y < SIZE; y++) {
      const srcRow = (SIZE - 1 - y) * SIZE * 4 // flip to bottom-up
      out.set(top.subarray(srcRow, srcRow + SIZE * 4), y * SIZE * 4)
    }
    return out
  } catch {
    return blank()
  }
}

// sanitise a build name into a .wbt filename
export function wbtFilename(name) {
  const base = (name || 'trampler').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  return `${base || 'trampler'}.wbt`
}

// build + trigger a browser download. src = image source for the icon (optional).
/**
 * @param {{ chassisId: string, placements?: Array<object>, name?: string }} state
 * @param {{ iconSrc?: string | null }} [opts]
 */
export async function downloadWbt(state, { iconSrc = null } = {}) {
  const icon = await iconRgbaFromSrc(iconSrc)
  const bytes = await stateToWbt(state, { icon })
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = wbtFilename(state.name)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
