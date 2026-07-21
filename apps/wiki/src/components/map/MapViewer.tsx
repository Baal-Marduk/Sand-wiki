/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ToolNavBrand } from "@/components/ToolNavBrand";
import { slugForName } from "@/components/map/entityLinkIndex";
import "@/components/map/map.css";

// Faithful port of sand3d/viewer/index.html's <script type="module"> body.
// Kept as close to byte-for-byte as a React wrapper allows — see the task
// notes for the deliberate list of adaptations (scoped $, ASSETS path,
// bundled three imports, RAF handle + listener teardown, loot cross-links).
export default function MapViewer() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return mountViewer(root);
  }, []);

  return (
    <div className="sand3d-map" ref={rootRef}>
      <canvas id="c"></canvas>
      <header>
        <ToolNavBrand title="3D Map" />
        <span className="tab on" id="tabMap">Map</span>
        <span className="tab" id="tabSearch">Search</span>
        <select id="loc"></select>
        <span className="sub" id="sub"></span>
      </header>
      <aside>
        <div id="catpanel">
          <h2>Categories</h2>
          <div className="tools">
            <button id="allOn">All</button>
            <button id="allOff">None</button>
            <button id="baseBtn">Hide terrain</button>
            <button id="xrayBtn">X-ray items</button>
          </div>
          <div id="legend"></div>
        </div>
      </aside>
      <div id="info"></div>
      <div id="help">
        <b>Drag</b> look · <b>scroll</b> move · <b>WASD/QE</b> fly · <b>Shift</b> 5% speed · <b>click</b> inspect
      </div>
      <div id="hud"></div>
      <div id="tip"></div>
      <div id="load">loading…</div>
      <div id="err"></div>
      <div id="search">
        <input
          id="sbox"
          placeholder="Search objects across all 62 locations (e.g. wine, ghoul, sniper, key)…"
          autoComplete="off"
        />
        <div id="sresults"></div>
      </div>
    </div>
  );
}

function mountViewer(root) {
  const $ = (id) => root.querySelector("#" + id);
  const errEl = $("err"), loadEl = $("load"), tip = $("tip");
  function fail(msg) { errEl.style.display = "block"; errEl.innerHTML = msg; loadEl.style.display = "none"; }

  // teardown bookkeeping: removable listeners + the RAF handle
  const off = [];

  // ---- loot cross-links: item/spawner labels become wiki links when a matching entity exists ----
  const nameHtml = (label) => {
    const hit = slugForName(label);
    return hit ? `<a class="s3d-elink" href="${hit.href}">${label}</a>` : label;
  };

  // ---- renderer / scene ----
  const canvas = $("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15120e);
  scene.fog = new THREE.Fog(0x15120e, 400, 2200);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 8000);
  // first-person fly camera: pivot is the camera itself (look in place), not an orbit target.
  const euler = new THREE.Euler(0, 0, 0, "YXZ"); // yaw(Y) then pitch(X), no roll
  let sceneR = 100; // scene scale (set per location) drives all speeds
  function setLook() { camera.quaternion.setFromEuler(euler); }
  const fwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const rgt = () => new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x3a2c1c, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4); sun.position.set(0.6, 1, 0.35); scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));

  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); // updateStyle=true:
    camera.aspect = w / h; camera.updateProjectionMatrix(); } // set canvas CSS size so buffer-centre==screen-centre
  window.addEventListener("resize", resize); off.push(() => window.removeEventListener("resize", resize));
  resize();

  // ---- WASD/QE fly (move along view direction) ----
  const keys = {};
  function onKeyDown(e) { if (/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return; keys[e.code] = true; }
  function onKeyUp(e) { keys[e.code] = false; }
  window.addEventListener("keydown", onKeyDown); off.push(() => window.removeEventListener("keydown", onKeyDown));
  window.addEventListener("keyup", onKeyUp); off.push(() => window.removeEventListener("keyup", onKeyUp));
  const slowMul = () => (keys.ShiftLeft || keys.ShiftRight) ? 0.05 : 1; // hold Shift = 5% speed (fine nav)
  function flyStep(dt) {
    const sp = sceneR * 0.5 * dt * slowMul(); // speed scales with scene size; Shift = 5%
    const f = fwd(), r = rgt(), m = new THREE.Vector3();
    if (keys.KeyW) m.add(f); if (keys.KeyS) m.sub(f);
    if (keys.KeyD) m.add(r); if (keys.KeyA) m.sub(r);
    if (keys.KeyE) m.y += 1; if (keys.KeyQ) m.y -= 1;
    if (m.lengthSq()) camera.position.addScaledVector(m.normalize(), sp);
  }

  // ---- highlight materials (shared) ----
  const HOVER = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false });
  const SELECT = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x33e0ff, emissiveIntensity: 1.4 });
  let hovered = null, selected = null;
  function setMat(o, m) { if (!o) return; if (m) { if (!o._om) o._om = o.material; o.material = m; }
    else if (o._om) { o.material = o._om; o._om = null; } }

  // ---- state ----
  let CATS = [], LOCCATS = [], current = null, pickables = [], showBase = true, xray = false;
  let byCat = {}; // catKey -> {label,color, things:Map(thingKey->{label,meshes})}
  const hidden = new Set(); // hidden thing keys (blueprint); category state derives from these
  let pendingSolo = null; // blueprint to isolate after next load (from a search jump)
  let SEARCHIX = {}, LOCMAP = {}; // global thing index + key->{glb,label,cat} (from manifest)
  let SPAWNS = {}; // blueprint -> [[item label, cat], ...] (set/random spawners)
  const GLB2KEY = {}; // reverse: glb path -> location key (for the URL hash)
  let currentLocKey = null; // key of the currently-open location
  const openCats = new Set(); // expanded categories (persist across re-render)
  const loader = new GLTFLoader();
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();

  // baked assets (manifest, spawns table, *.glb.gz) are served from the wiki's public/map/ folder.
  const ASSETS = "/map/";

  // ---- load the static spawner->items table (optional; click panel lists what a spawner can become) ----
  fetch(ASSETS + "spawns.json").then(r => r.ok ? r.json() : {}).then(s => { SPAWNS = s; }).catch(() => {});

  // ---- load manifest, populate dropdown ----
  const locSel = $("loc");
  fetch(ASSETS + "manifest.json").then(r => { if (!r.ok) throw 0; return r.json(); }).then(m => {
    CATS = m.cats; LOCCATS = m.loccats;
    // global index for search: blueprint -> {label,cat,total,locs:{key:count}}
    LOCMAP = {}; SEARCHIX = {};
    m.locations.forEach(l => { LOCMAP[l.key] = { glb: l.glb, label: l.label, cat: l.cat }; GLB2KEY[l.glb] = l.key;
      (l.things || []).forEach(([label, cat, bp, count]) => {
        let e = SEARCHIX[bp]; if (!e) e = SEARCHIX[bp] = { label, cat, total: 0, locs: {} };
        e.total += count; e.locs[l.key] = (e.locs[l.key] || 0) + count; }); });
    (LOCCATS || [["island", "Islands"]]).forEach(([ck, cl]) => {
      const ks = m.locations.filter(l => l.cat === ck); if (!ks.length) return;
      const og = document.createElement("optgroup"); og.label = `${cl} (${ks.length})`;
      ks.forEach(l => { const o = document.createElement("option"); o.value = l.glb;
        o.dataset.label = l.label; o.textContent = `${l.label}  (${l.objects})`; og.appendChild(o); });
      locSel.appendChild(og);
    });
    // initial location: from the URL hash if valid, else the first dropdown entry
    const want = readHash().loc;
    if (want && LOCMAP[want]) { locSel.value = LOCMAP[want].glb; loadLoc(LOCMAP[want].glb, LOCMAP[want].label); }
    else if (locSel.value) { loadLoc(locSel.value, locSel.selectedOptions[0].dataset.label); }
  }).catch(() => fail(
    `Couldn't load <code>manifest.json</code>. The 3D viewer needs a local web server (browsers block
     <code>fetch()</code> of local files over <code>file://</code>).<br><br>Run from this folder:<br>
     <code>python3 -m http.server</code><br>then open <code>http://localhost:8000/</code>.<br><br>
     If the page is already served, the GLBs may not be baked yet.`));
  locSel.onchange = () => { loadLoc(locSel.value, locSel.selectedOptions[0].dataset.label); locSel.blur(); };

  // ---- category legend: checkbox toggles the category (cascades to its things), big row expands ----
  const thingKeyOf = o => o.userData.b || o.userData.t; // group objects by blueprint (fallback label)
  function buildGroups() { // per-location: catKey -> {things:Map}
    byCat = {};
    for (const o of pickables) {
      const cat = o.userData.c, tk = thingKeyOf(o);
      let g = byCat[cat]; if (!g) { const meta = CATS.find(c => c[0] === cat) || [cat, cat, "#888"];
        g = byCat[cat] = { label: meta[1], color: meta[2], things: new Map() }; }
      let t = g.things.get(tk); if (!t) { t = { label: o.userData.t, meshes: [] }; g.things.set(tk, t); }
      t.meshes.push(o);
    }
  }
  function catState(k) { const g = byCat[k]; let h = 0, n = 0; // 'all' | 'none' | 'some'
    for (const tk of g.things.keys()) hidden.has(tk) ? h++ : n++;
    return h === 0 ? "all" : n === 0 ? "none" : "some"; }
  function buildLegend() {
    const lg = $("legend"); lg.innerHTML = "";
    CATS.forEach(([k, label, color]) => {
      const g = byCat[k]; if (!g) return;
      const count = [...g.things.values()].reduce((a, t) => a + t.meshes.length, 0);
      const open = openCats.has(k), st = catState(k);
      const wrap = document.createElement("div");
      const row = document.createElement("div"); row.className = "catrow"; row.dataset.k = k;
      row.innerHTML = `<span class="caret">${open ? "▾" : "▸"}</span>` +
        `<input type="checkbox" ${st !== "none" ? "checked" : ""}>` +
        `<span class="sw" style="background:${color}"></span><span class="n">${label}</span><span class="c">${count}</span>`;
      const cb = row.querySelector("input"); cb.indeterminate = (st === "some");
      const things = document.createElement("div"); things.className = "things" + (open ? " open" : "");
      [...g.things.entries()].sort((a, b) => b[1].meshes.length - a[1].meshes.length).forEach(([tk, t]) => {
        const tr = document.createElement("div"); tr.className = "thingrow" + (hidden.has(tk) ? " off" : ""); tr.dataset.tk = tk;
        tr.innerHTML = `<input type="checkbox" ${hidden.has(tk) ? "" : "checked"}>` +
          `<span class="dotmini" style="background:${color}"></span><span class="n">${t.label}</span><span class="c">${t.meshes.length}</span>`;
        tr.onclick = e => { e.stopPropagation(); hidden.has(tk) ? hidden.delete(tk) : hidden.add(tk); update(); };
        things.appendChild(tr);
      });
      cb.onclick = e => { e.stopPropagation(); const hide = (st !== "none"); // checkbox: toggle whole category
        for (const tk of g.things.keys()) hide ? hidden.add(tk) : hidden.delete(tk); update(); };
      const caret = row.querySelector(".caret");
      const toggleOpen = e => { e.stopPropagation(); openCats.has(k) ? openCats.delete(k) : openCats.add(k);
        const o = openCats.has(k); things.classList.toggle("open", o); caret.textContent = o ? "▾" : "▸"; };
      caret.onclick = toggleOpen; row.onclick = toggleOpen; // big expand target (everything but the checkbox)
      wrap.appendChild(row); wrap.appendChild(things); lg.appendChild(wrap);
    });
  }
  function update() { // apply the hidden-set to objects + refresh legend UI
    for (const o of pickables) o.visible = !hidden.has(thingKeyOf(o));
    if (current) current.traverse(o => { const ud = o.userData; if (!ud) return;
      if (ud.sand) o.visible = showBase;
      else if (ud.base) o.visible = showBase; }); // transparent/non-display mats are dropped at bake time
    if (hovered && !hovered.visible) { if (hovered !== selected) setMat(hovered, null); hovered = null; tip.style.display = "none"; }
    buildLegend();
  }
  $("allOn").onclick = () => { hidden.clear(); update(); };
  $("allOff").onclick = () => { for (const k in byCat) for (const tk of byCat[k].things.keys()) hidden.add(tk); update(); };
  $("baseBtn").onclick = () => { showBase = !showBase; $("baseBtn").textContent = showBase ? "Hide terrain" : "Show terrain"; update(); };
  // X-ray: draw item meshes over terrain (depthTest off + high renderOrder). Highlight mats share the flag.
  function applyXray() {
    HOVER.depthTest = SELECT.depthTest = !xray;
    for (const o of pickables) { o.renderOrder = xray ? 10 : 0;
      if (o.material) o.material.depthTest = !xray;
      if (o._om) o._om.depthTest = !xray; }
  }
  $("xrayBtn").onclick = () => { xray = !xray; $("xrayBtn").textContent = xray ? "X-ray on" : "X-ray items";
    $("xrayBtn").style.background = xray ? "#5a4a2a" : ""; applyXray(); };

  // ---- fetch + gunzip + parse a GLB ----
  async function fetchGlb(url) {
    const r = await fetch(url); if (!r.ok) throw new Error(url + " " + r.status);
    let buf;
    if (url.endsWith(".gz")) {
      if (typeof DecompressionStream === "undefined") throw new Error("no DecompressionStream");
      buf = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    } else buf = await r.arrayBuffer();
    return await loader.parseAsync(buf, "");
  }

  function disposeCurrent() {
    if (!current) return; scene.remove(current);
    current.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    current = null; pickables = []; selected = hovered = null; $("info").style.display = "none";
  }

  async function loadLoc(glb, label) {
    currentLocKey = GLB2KEY[glb] || null; writeHash(); // reflect the open location in the URL
    loadEl.style.display = "flex"; loadEl.textContent = "loading " + (label || glb) + "…"; errEl.style.display = "none";
    try {
      const gltf = await fetchGlb(ASSETS + glb);
      disposeCurrent();
      current = gltf.scene; scene.add(current);
      pickables = [];
      current.traverse(o => { if (o.isMesh) { o.frustumCulled = true;
        if (o.userData && o.userData.t) { pickables.push(o); } // interactable object
      } });
      // frame camera on bounding box, then look at its centre
      const box = new THREE.Box3().setFromObject(current); const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3()); sceneR = Math.max(sz.x, sz.y, sz.z) * 0.6 + 5;
      camera.position.set(c.x + sceneR * 0.7, c.y + sceneR * 0.8, c.z + sceneR * 0.7);
      camera.near = Math.max(0.3, sceneR / 2000); camera.far = sceneR * 60; camera.updateProjectionMatrix();
      camera.lookAt(c); euler.setFromQuaternion(camera.quaternion, "YXZ"); // seed fly-cam orientation
      hidden.clear(); showBase = true; $("baseBtn").textContent = "Hide terrain";
      buildGroups();
      if (pendingSolo) { // arriving from a search jump: isolate one thing
        for (const k in byCat) for (const tk of byCat[k].things.keys()) if (tk !== pendingSolo) hidden.add(tk);
        for (const k in byCat) if (byCat[k].things.has(pendingSolo)) openCats.add(k);
        pendingSolo = null;
      }
      update();
      applyXray(); // re-apply x-ray to the new location's items
      applyHash(readHash()); // restore any afterLoad state (camera) from the URL
      $("sub").textContent = `${pickables.length} objects · drag to look around`;
      $("hud").textContent = label || "";
      loadEl.style.display = "none";
    } catch (e) { fail(`Failed to load <code>${glb}</code>: ${e.message}.<br>Make sure the GLBs are baked and served over http.`); }
  }

  // ---- URL hash state (extensible) ----
  // Each part knows how to read its current value and how to apply one from the hash.
  // To add filters/camera later: add an entry here (get returns null/'' to omit; apply restores).
  // `afterLoad:true` parts are applied once a location finishes loading (filters/camera need it).
  const HASH_PARTS = {
    loc: {
      get: () => currentLocKey || null,
      apply: (key) => { const l = LOCMAP[key]; if (!l) return false;
        if (key === currentLocKey) return true; // already open
        locSel.value = l.glb; loadLoc(l.glb, l.label); return true; },
    },
  };
  let _suppressHash = false;
  function readHash() {
    const out = {}, h = location.hash.replace(/^#/, "");
    if (h) for (const kv of h.split("&")) { const i = kv.indexOf("=");
      if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }
    return out;
  }
  function writeHash() {
    if (_suppressHash) return;
    const parts = [];
    for (const k in HASH_PARTS) { const v = HASH_PARTS[k].get(); if (v != null && v !== "") parts.push(k + "=" + encodeURIComponent(v)); }
    const h = parts.length ? "#" + parts.join("&") : location.pathname + location.search;
    history.replaceState(null, "", h); // replaceState: doesn't fire hashchange
  }
  function applyHash(state) { // apply the non-loc parts that need a loaded location
    for (const k in HASH_PARTS) { const p = HASH_PARTS[k];
      if (p.afterLoad && k in state) { _suppressHash = true; try { p.apply(state[k]); } finally { _suppressHash = false; } } }
  }
  // react to manual hash edits / back-forward (our own writes use replaceState, so they don't loop here)
  function onHashChange() { const s = readHash();
    if (s.loc && LOCMAP[s.loc] && s.loc !== currentLocKey) { locSel.value = LOCMAP[s.loc].glb; loadLoc(LOCMAP[s.loc].glb, LOCMAP[s.loc].label); } }
  window.addEventListener("hashchange", onHashChange); off.push(() => window.removeEventListener("hashchange", onHashChange));

  // ---- picking ----
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1; ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables.filter(o => o.visible), false); // skip filtered-out objects
    return hit.length ? hit[0].object : null;
  }
  function hoverPick(ev) {
    const o = pick(ev);
    if (o !== hovered) { if (hovered && hovered !== selected) setMat(hovered, null);
      hovered = o; if (o && o !== selected) setMat(o, HOVER); }
    if (o) { tip.style.display = "block"; tip.style.left = (ev.clientX + 13) + "px"; tip.style.top = (ev.clientY + 13) + "px";
      tip.textContent = o.userData.t; canvas.style.cursor = "pointer"; }
    else { tip.style.display = "none"; canvas.style.cursor = "grab"; }
  }
  function clickPick(ev) {
    const o = pick(ev);
    if (selected) { setMat(selected, null); if (selected === hovered) setMat(selected, HOVER); }
    selected = o;
    if (o) setMat(o, SELECT);
    showInfo(o);
  }
  let LOOTMODE = "Storm"; // Stormdive vs Voyage loot amounts — see docs/LOOT.md
  function showInfo(o) {
    if (!o) { $("info").style.display = "none"; return; }
    const cat = CATS.find(c => c[0] === o.userData.c) || ["", "?", "#888"];
    const E = SPAWNS[o.userData.b];
    let spHtml = "";
    if (E) {
      const V = (LOOTMODE === "Voyage"); // loot row = [item, stormMin, stormMax, voyageMin, voyageMax]
      const lootRows = loot => loot.map(r => { const it = r[0], mn = V ? r[3] : r[1], mx = V ? r[4] : r[2];
        return `<div class="sploot">${nameHtml(it)} <span class="spw">${mn === mx ? mn : mn + "–" + mx}</span></div>`; }).join("");
      const badge = c => { const cc = CATS.find(x => x[0] === c) || ["", "", "#888"]; return `<span class="badge" style="background:${cc[2]}"></span>`; };
      const hasLoot = (E.loot && E.loot.length) || (E.m && E.m.some(s => ((SPAWNS[s.bp] || {}).loot || []).length));
      if (hasLoot) // mode switch: same containers, different counts per game mode
        spHtml += `<div class="lootmode">Amounts: <span class="lm${V ? "" : " on"}" data-m="Storm">Stormdive</span><span class="lm${V ? " on" : ""}" data-m="Voyage">Voyage</span></div>`;
      if (E.loot && E.loot.length) // directly-clicked container: its own contents (open)
        spHtml += `<div class="splist"><div class="sphdr">Contents</div><div class="splootl">${lootRows(E.loot)}</div></div>`;
      if (E.m && E.m.length) // spawner: members open, each member's loot collapsed
        spHtml += '<div class="splist"><div class="sphdr">Can become</div>' +
          E.m.map(s => {
            const pct = (s.pct != null) ? ` <span class="spw">${s.pct}%</span>` : "";
            const cnt = (s.count) ? ` <span class="spw">×${s.count}</span>` : "";
            const row = `${badge(s.cat)}${nameHtml(s.label)}${cnt}${pct}`;
            const ml = (SPAWNS[s.bp] || {}).loot;
            return (ml && ml.length)
              ? `<details class="spdet"><summary class="sprow">${row}</summary><div class="splootl">${lootRows(ml)}</div></details>`
              : `<div class="sprow">${row}</div>`;
          }).join("") + "</div>";
    }
    $("info").style.display = "block";
    $("info").innerHTML = `<b>${nameHtml(o.userData.t)}</b><br>
      <span class="cat"><span class="badge" style="background:${cat[2]}"></span>${cat[1]}</span>
      <div class="raw">${o.userData.b || ""}</div>${spHtml}`;
    $("info").querySelectorAll(".lm").forEach(el => el.onclick = () => { LOOTMODE = el.dataset.m; showInfo(selected); });
  }

  // left-drag = look in place, click(no move) = pick, wheel = move forward (WASD/QE strafe+vertical)
  const LOOK = 0.0026;
  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  function onContextMenu(e) { e.preventDefault(); } // no menu over the 3D view
  canvas.addEventListener("contextmenu", onContextMenu); off.push(() => canvas.removeEventListener("contextmenu", onContextMenu));
  function onPointerDown(ev) { if (ev.button !== 0) return; // left only
    dragging = true; lastX = ev.clientX; lastY = ev.clientY; moved = 0;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {} }
  canvas.addEventListener("pointerdown", onPointerDown); off.push(() => canvas.removeEventListener("pointerdown", onPointerDown));
  function onPointerMove(ev) {
    if (dragging) {
      const dx = ev.clientX - lastX, dy = ev.clientY - lastY; lastX = ev.clientX; lastY = ev.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      const lim = Math.PI / 2 - 0.02; // look: turn the view in place
      euler.y -= dx * LOOK; euler.x = Math.max(-lim, Math.min(lim, euler.x - dy * LOOK)); setLook();
      tip.style.display = "none";
      canvas.style.cursor = "grabbing"; return;
    }
    hoverPick(ev);
  }
  canvas.addEventListener("pointermove", onPointerMove); off.push(() => canvas.removeEventListener("pointermove", onPointerMove));
  function endDrag(ev) { if (!dragging) return; const wasClick = (moved < 6); dragging = false;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    canvas.style.cursor = "grab"; if (wasClick) clickPick(ev); }
  canvas.addEventListener("pointerup", endDrag); off.push(() => canvas.removeEventListener("pointerup", endDrag));
  function onWheel(ev) { ev.preventDefault();
    camera.position.addScaledVector(fwd(), -Math.sign(ev.deltaY) * sceneR * 0.06 * slowMul()); }
  canvas.addEventListener("wheel", onWheel, { passive: false }); off.push(() => canvas.removeEventListener("wheel", onWheel));

  // ---- Map / Search tabs ----
  function setView(v) {
    $("tabMap").classList.toggle("on", v === "map");
    $("tabSearch").classList.toggle("on", v === "search");
    $("search").classList.toggle("on", v === "search");
    for (const k in keys) keys[k] = false; // drop held movement keys when leaving the 3D view
  }
  $("tabMap").onclick = () => setView("map");
  $("tabSearch").onclick = () => { setView("search"); $("sbox").focus(); };

  // ---- search across all locations ----
  function renderSearch(q) {
    q = q.trim().toLowerCase(); const out = $("sresults"); out.innerHTML = "";
    if (!q) { out.innerHTML = '<p class="sub">Type to search objects across all ' + Object.keys(LOCMAP).length + " locations.</p>"; return; }
    const hits = Object.keys(SEARCHIX).filter(bp => { const e = SEARCHIX[bp];
      return e.label.toLowerCase().includes(q) || bp.toLowerCase().includes(q); });
    hits.sort((a, b) => SEARCHIX[b].total - SEARCHIX[a].total);
    if (!hits.length) { out.innerHTML = '<p class="sub">No matches.</p>'; return; }
    hits.slice(0, 80).forEach(bp => { const e = SEARCHIX[bp];
      const c = CATS.find(x => x[0] === e.cat) || ["", "?", "#888"];
      const div = document.createElement("div"); div.className = "sresult";
      let chips = ""; Object.keys(e.locs).sort((a, b) => e.locs[b] - e.locs[a]).forEach(k => {
        chips += `<span class="chip" data-k="${k}" data-bp="${bp}">${LOCMAP[k].label} <b>×${e.locs[k]}</b></span>`; });
      div.innerHTML = `<div class="h"><span class="sw" style="background:${c[2]}"></span>${e.label}` +
        `<span class="tot">· ${c[1]} · ${e.total} across ${Object.keys(e.locs).length} locations</span></div>` +
        `<div class="chips">${chips}</div>`;
      out.appendChild(div);
    });
    out.querySelectorAll(".chip").forEach(ch => ch.onclick = () => jumpTo(ch.dataset.k, ch.dataset.bp));
  }
  function onSearchInput(e) { renderSearch(e.target.value); }
  $("sbox").addEventListener("input", onSearchInput); off.push(() => $("sbox").removeEventListener("input", onSearchInput));
  function jumpTo(locKey, bp) { const loc = LOCMAP[locKey]; if (!loc) return;
    pendingSolo = bp; setView("map"); locSel.value = loc.glb; loadLoc(loc.glb, loc.label); }

  // ---- loop ----
  let last = performance.now();
  let rafId;
  function tick(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now;
    flyStep(dt); renderer.render(scene, camera); rafId = requestAnimationFrame(tick); }
  rafId = requestAnimationFrame(tick);
  renderSearch("");

  return () => {
    cancelAnimationFrame(rafId);
    off.forEach(f => f());
    renderer.dispose();
    disposeCurrent();
  };
}
