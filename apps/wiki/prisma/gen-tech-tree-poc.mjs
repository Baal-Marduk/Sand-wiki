// Dev POC generator: emits a self-contained, read-only tech-tree visualization
// to public/tech-tree-poc.html so resource icons resolve via relative ./icons/...
// Graph layout: 3 faction lanes, tiers top->bottom, SVG edges for prereqs.
//   node tech-tree/gen-tech-tree-poc.mjs   (run from prisma/)  OR
//   node prisma/gen-tech-tree-poc.mjs      (run from sand-wiki/)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // .../prisma
const root = join(here, '..'); // sand-wiki
const data = JSON.parse(readFileSync(join(here, 'tech-tree-extracted.json'), 'utf8'));
const icons = JSON.parse(readFileSync(join(here, 'icons.json'), 'utf8')); // key -> "icons/xx.png"

// --- Resource name -> icon key map (hand-built; null/missing = flagged in UI) ---
const RES_TO_ICON = {
  'Crowns': 'item_coinCrown',
  'Alloy Steel': 'item_resourceAlloySteel',
  'Weird Coral': 'item_resourceWeirdCoral',
  'Coral Chunk': 'item_resourceCoralPiece',
  'Coral Dust': 'item_resourceCoralDust',
  'Fabric': 'item_resourceFabric',
  'Fabric Scraps': 'item_resourceFabricScraps',
  'Gunpowder': 'item_resourceGunpowder',
  'High-Grade Gunpowder': 'item_resourceHighGradeGunpowder',
  'Leviathan Meat': 'item_resourceLeviathanMeat',
  'Leviathan Skin': 'item_resourceLeviathanSkin',
  'Metal Rods': 'item_resourceMetalRods',
  'Mixtures': 'item_resourceMixtures',
  'Optic Lenses': 'item_resourceOpticLenses',
  'Reinforced Leather Strips': 'item_resourceReinforcedLeatherStrips',
  'Scrapped Ammo': 'item_resourceScrappedAmmo',
  'Threads': 'item_resourceThreads',
  'Weapon Parts': 'item_resourceWeaponParts',
  'Black Box': 'item_blackBox',
  'Ficus': 'item_ficus',
  'Crystal': 'ArtefactCrystal',
  'Crate of 1889 Chardonnay': 'item_wineBox',
  "District Officer's Portable Safe": 'item_documentSafe',
  'Scrap Metal': 'item_resourceMetal_t1',
  'Canned Sea Deer XL': 'item_cannedFish',
  // intentionally left UNMAPPED so the POC flags it (no obvious icon key):
  // 'Raw Aurogen Crystal': ???
};

const iconPath = (key) => (key && icons[key]) ? icons[key] : null;

// --- Build enriched nodes with resolved cost icons + a stable id ---
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const usedIcons = new Set();
const unmappedRes = new Set();

const nodes = data.nodes.map((n, i) => {
  const costs = (n.unlockCost || []).map((c) => {
    const key = RES_TO_ICON[c.name];
    const path = iconPath(key);
    if (path) usedIcons.add(c.name); else unmappedRes.add(c.name);
    return { name: c.name, amount: c.amount, icon: path };
  });
  return {
    id: `n${i}`, // unique; letter is a sub-column, NOT a unique key
    faction: n.faction,
    tier: n.tier,
    letter: n.letter,
    name: n.name,
    kind: n.kind,
    unlocks: n.unlocks || [],
    costs,
    prereqs: n.prereqs || [],
  };
});

// --- Resolve prereq strings ("II(a) Captain's Cabin") -> target node id ---
// letters repeat within a tier (sub-columns), so the NAME disambiguates.
const byName = new Map(); // faction|tier|letter|name -> id
for (const n of nodes) byName.set(`${n.faction}|${n.tier}|${n.letter}|${norm(n.name)}`, n.id);

const edges = [];
const unresolvedPrereqs = [];
for (const n of nodes) {
  for (const p of n.prereqs) {
    const m = p.match(/^([IVX]+)\(([a-z])\)\s*(.*)$/i);
    let target = null;
    if (m) {
      const tier = ROMAN[m[1].toUpperCase()];
      const letter = m[2].toLowerCase();
      target = byName.get(`${n.faction}|${tier}|${letter}|${norm(m[3])}`) || null;
    }
    if (target) edges.push({ from: target, to: n.id, label: p });
    else unresolvedPrereqs.push({ node: n.id, prereq: p });
  }
}

const FACTIONS = [
  { key: 'godlewski', label: 'Godlewski', color: '#4493f8' },
  { key: 'kaiser', label: 'Kaiser', color: '#e3a008' },
  { key: 'landwehr', label: 'Landwehr', color: '#6fb24a' },
];

const payload = { nodes, edges, factions: FACTIONS, unresolvedPrereqs };

const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tech-tree POC — data check</title>
<style>
  :root{--bg:#0e1116;--panel:#161b22;--panel2:#1c232d;--border:#2a3340;--text:#e6edf3;--muted:#8b98a8;
    --godlewski:#4493f8;--kaiser:#e3a008;--landwehr:#6fb24a;--warn:#f0883e;--err:#f85149;}
  *{box-sizing:border-box;}
  body{margin:0;font:13px/1.4 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--text);}
  header{position:sticky;top:0;z-index:30;display:flex;gap:14px;align-items:center;flex-wrap:wrap;
    padding:10px 16px;background:var(--panel);border-bottom:1px solid var(--border);}
  header h1{font-size:15px;margin:0;}
  .stat{color:var(--muted);font-size:12px;} .stat b{color:var(--text);}
  .pill{padding:1px 8px;border-radius:10px;font-size:11px;border:1px solid var(--border);}
  .warnpill{background:rgba(240,136,62,.12);border-color:var(--warn);color:var(--warn);cursor:pointer;}
  .board{position:relative;display:flex;flex-direction:column;padding:0 0 40px;width:max-content;min-width:100%;}
  .tier-axis{display:flex;position:sticky;top:48px;z-index:15;background:var(--bg);border-bottom:1px solid var(--border);}
  .tier-axis .lbl-pad{width:150px;flex:none;}
  .tier-axis .tlbl{width:878px;flex:none;padding:7px 14px;font-size:11px;letter-spacing:.12em;
    text-transform:uppercase;color:var(--muted);border-left:1px dashed var(--border);}
  .band{display:flex;align-items:stretch;border-bottom:1px solid var(--border);}
  .band-h{width:150px;flex:none;position:sticky;left:0;z-index:12;background:var(--panel);
    padding:12px 12px;display:flex;flex-direction:column;gap:6px;justify-content:center;border-right:1px solid var(--border);}
  .band-h .dot{width:12px;height:12px;border-radius:50%;}
  .band-h .nm{font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.04em;}
  .band-h .ct{color:var(--muted);font-size:11px;}
  .tier-col{width:878px;flex:none;padding:12px;display:flex;flex-direction:row;gap:10px;
    align-items:flex-start;border-left:1px dashed var(--border);}
  .subcol{width:206px;flex:none;display:flex;flex-direction:column;gap:10px;}
  .subcol-h{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);
    text-align:center;padding-bottom:2px;}
  .subcol-h.empty{opacity:.22;}
  .card{position:relative;z-index:2;background:var(--panel);border:1px solid var(--border);border-left-width:3px;
    border-radius:8px;padding:7px 9px;transition:box-shadow .12s,border-color .12s;}
  .card:hover{border-color:#fff;}
  .card.dim{opacity:.18;}
  .card.hl{box-shadow:0 0 0 2px #fff;opacity:1;}
  .card .top{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
  .badge{font-size:10px;padding:0 5px;border-radius:4px;background:var(--panel2);color:var(--muted);border:1px solid var(--border);}
  .badge.gate{background:rgba(248,81,73,.15);color:var(--err);border-color:var(--err);}
  .badge.part{color:#b8c4d0;}
  .name{font-weight:600;font-size:13px;flex:1;}
  .unlocks{color:var(--muted);font-size:11px;margin:2px 0 6px;}
  .unlocks code{color:#cdd9e5;}
  .costs{display:flex;flex-wrap:wrap;gap:4px 8px;}
  .cost{display:inline-flex;align-items:center;gap:3px;font-size:11px;}
  .cost img{width:18px;height:18px;object-fit:contain;image-rendering:auto;}
  .cost .noicon{width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;
    border:1px dashed var(--warn);border-radius:3px;color:var(--warn);font-size:9px;}
  .cost .amt{color:#fff;font-weight:600;} .cost .rn{color:var(--muted);}
  .cost.unmapped .rn{color:var(--warn);}
  svg.edges{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:visible;}
  svg.edges path{fill:none;stroke:var(--muted);stroke-width:1.5;opacity:.35;}
  svg.edges path.hl{stroke:#fff;opacity:.95;stroke-width:2.5;}
  #drawer{position:fixed;right:0;top:48px;bottom:0;width:0;overflow:hidden;background:var(--panel);
    border-left:1px solid var(--border);transition:width .15s;z-index:40;}
  #drawer.open{width:360px;padding:14px;overflow:auto;}
  #drawer pre{white-space:pre-wrap;word-break:break-word;font-size:11px;color:#cdd9e5;}
  .closebtn{float:right;cursor:pointer;color:var(--muted);}
</style></head><body>
<header>
  <h1>Tech-tree POC</h1>
  <span class="stat"><b id="ncount"></b> nodes</span>
  <span class="stat"><b id="ecount"></b> prereq edges</span>
  <span class="pill" style="border-color:var(--godlewski);color:var(--godlewski)">Godlewski <b id="c-g"></b></span>
  <span class="pill" style="border-color:var(--kaiser);color:var(--kaiser)">Kaiser <b id="c-k"></b></span>
  <span class="pill" style="border-color:var(--landwehr);color:var(--landwehr)">Landwehr <b id="c-l"></b></span>
  <span class="pill warnpill" id="unmapped-pill"></span>
  <span class="pill warnpill" id="unresolved-pill"></span>
  <span class="stat" style="margin-left:auto">click a node to inspect raw JSON · click a node to highlight its chain</span>
</header>
<div class="board" id="board"><svg class="edges" id="edges"></svg></div>
<div id="drawer"><span class="closebtn" onclick="closeDrawer()">✕ close</span><div id="drawer-body"></div></div>
<script>
const DATA = ${JSON.stringify(payload)};
const FAC = {godlewski:'--godlewski',kaiser:'--kaiser',landwehr:'--landwehr'};
const board = document.getElementById('board');
const facColor = f => getComputedStyle(document.documentElement).getPropertyValue(FAC[f]).trim();

// counts
document.getElementById('ncount').textContent = DATA.nodes.length;
document.getElementById('ecount').textContent = DATA.edges.length;
const cnt = f => DATA.nodes.filter(n=>n.faction===f).length;
document.getElementById('c-g').textContent = cnt('godlewski');
document.getElementById('c-k').textContent = cnt('kaiser');
document.getElementById('c-l').textContent = cnt('landwehr');

const unmappedSet = new Set();
DATA.nodes.forEach(n=>n.costs.forEach(c=>{if(!c.icon)unmappedSet.add(c.name);}));
const up = document.getElementById('unmapped-pill');
up.textContent = unmappedSet.size + ' unmapped resources';
up.title = [...unmappedSet].join(', ') || 'none';
const rp = document.getElementById('unresolved-pill');
rp.textContent = DATA.unresolvedPrereqs.length + ' unresolved prereqs';
rp.title = DATA.unresolvedPrereqs.map(u=>u.node+' <- '+u.prereq).join('\\n') || 'none';

// build bands (faction rows) x tier columns, tiers left->right
const cardEls = new Map();
const allTiers = [...new Set(DATA.nodes.map(n=>n.tier))].sort((a,b)=>a-b);
// sub-columns shown per tier = union of letters used by ANY faction at that tier
const SUBW=206, GAP=10, PAD=24;
const tierLetters={}, colW={};
for(const t of allTiers){
  const ls=[...new Set(DATA.nodes.filter(n=>n.tier===t).map(n=>n.letter))].sort();
  tierLetters[t]=ls; colW[t]=ls.length*SUBW+(ls.length-1)*GAP+PAD;
}

const axis=document.createElement('div'); axis.className='tier-axis';
const pad=document.createElement('div'); pad.className='lbl-pad'; axis.appendChild(pad);
for(const t of allTiers){ const tl=document.createElement('div'); tl.className='tlbl'; tl.style.width=colW[t]+'px'; tl.textContent='Tier '+t; axis.appendChild(tl); }
board.appendChild(axis);

for (const fac of DATA.factions){
  const band=document.createElement('div'); band.className='band';
  const facNodes=DATA.nodes.filter(n=>n.faction===fac.key);
  const h=document.createElement('div'); h.className='band-h';
  h.innerHTML='<span class="dot" style="background:'+fac.color+'"></span>'+
    '<span class="nm">'+fac.label+'</span><span class="ct">'+facNodes.length+' nodes</span>';
  band.appendChild(h);
  for(const t of allTiers){
    const col=document.createElement('div'); col.className='tier-col'; col.style.width=colW[t]+'px';
    const tnodes=facNodes.filter(n=>n.tier===t);
    for(const L of tierLetters[t]){
      const sc=document.createElement('div'); sc.className='subcol';
      const cards=tnodes.filter(n=>n.letter===L);
      const sh=document.createElement('div'); sh.className='subcol-h'+(cards.length?'':' empty'); sh.textContent='col '+L; sc.appendChild(sh);
      for(const n of cards){ const el=mkCard(n,fac.color); sc.appendChild(el); cardEls.set(n.id,el); }
      col.appendChild(sc);
    }
    band.appendChild(col);
  }
  board.appendChild(band);
}

function mkCard(n,color){
  const el=document.createElement('div'); el.className='card'; el.style.borderLeftColor=color; el.dataset.id=n.id;
  const kindCls = n.kind==='gate'?'gate':(n.kind==='part'?'part':'');
  const costsHtml = n.costs.map(c=>{
    const ic = c.icon ? '<img src="'+c.icon+'" alt="" title="'+c.name+'">'
                      : '<span class="noicon" title="no icon for '+c.name+'">?</span>';
    return '<span class="cost'+(c.icon?'':' unmapped')+'" title="'+c.name+'">'+ic+
      '<span class="amt">'+c.amount.toLocaleString()+'</span><span class="rn">'+c.name+'</span></span>';
  }).join('');
  el.innerHTML =
    '<div class="top"><span class="badge">'+n.tier+toLetter(n.letter)+'</span>'+
    '<span class="name">'+n.name+'</span><span class="badge '+kindCls+'">'+n.kind+'</span></div>'+
    (n.unlocks.length?'<div class="unlocks">unlocks: '+n.unlocks.map(u=>'<code>'+u+'</code>').join(', ')+'</div>':'')+
    '<div class="costs">'+costsHtml+'</div>';
  el.addEventListener('mouseenter',()=>highlight(n.id));
  el.addEventListener('mouseleave',clearHl);
  el.addEventListener('click',()=>openDrawer(n));
  return el;
}
function toLetter(l){ return '('+l+')'; }

// edges
const svg=document.getElementById('edges');
function drawEdges(){
  svg.innerHTML='';
  const br=board.getBoundingClientRect();
  for(const e of DATA.edges){
    const a=cardEls.get(e.from),b=cardEls.get(e.to); if(!a||!b)continue;
    const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
    const x1=ra.right-br.left, y1=ra.top-br.top+ra.height/2;
    const x2=rb.left-br.left, y2=rb.top-br.top+rb.height/2;
    const mx=(x1+x2)/2;
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d','M '+x1+' '+y1+' C '+mx+' '+y1+' '+mx+' '+y2+' '+x2+' '+y2);
    p.dataset.from=e.from; p.dataset.to=e.to;
    svg.appendChild(p);
  }
}
function highlight(id){
  const connected=new Set([id]);
  DATA.edges.forEach(e=>{ if(e.from===id)connected.add(e.to); if(e.to===id)connected.add(e.from); });
  cardEls.forEach((el,nid)=>{ el.classList.toggle('hl',nid===id); el.classList.toggle('dim',!connected.has(nid)); });
  svg.querySelectorAll('path').forEach(p=>p.classList.toggle('hl',p.dataset.from===id||p.dataset.to===id));
}
function clearHl(){ cardEls.forEach(el=>el.classList.remove('hl','dim')); svg.querySelectorAll('path').forEach(p=>p.classList.remove('hl')); }

const drawer=document.getElementById('drawer');
function openDrawer(n){ document.getElementById('drawer-body').innerHTML='<pre>'+JSON.stringify(n,null,2)+'</pre>'; drawer.classList.add('open'); }
function closeDrawer(){ drawer.classList.remove('open'); }

requestAnimationFrame(()=>{requestAnimationFrame(drawEdges);});
window.addEventListener('resize',drawEdges);
</script></body></html>`;

const outDir = join(root, 'public');
if (!existsSync(outDir)) { console.error('public/ not found at', outDir); process.exit(1); }
const out = join(outDir, 'tech-tree-poc.html');
writeFileSync(out, html, 'utf8');

console.log('Wrote', out);
console.log('Nodes:', nodes.length, '| Edges:', edges.length, '| Unresolved prereqs:', unresolvedPrereqs.length);
console.log('Mapped resources:', [...usedIcons].length, '| UNMAPPED:', [...unmappedRes].length, unmappedRes.size ? '->' : '', [...unmappedRes].join(', '));
