/* ============================================================
   SAND Tech Tree — app logic
   Layout, connectors, hover details, multi-select path costing,
   and unlock "memory" persisted to localStorage.
   ============================================================ */
(function () {
  'use strict';

  var NODES = window.TT_NODES, COLS = window.TT_COLS,
      FACTIONS = window.TT_FACTIONS, TIERS = window.TT_TIERS;

  // ---- layout constants ----
  var CARD_W = 196, CARD_H = 72, COL_W = 252, LANE_H = 92,
      PAD_LEFT = 240, PAD_TOP = 20, BAND_GAP = 56, ROOT_W = 196;

  var byId = {};
  NODES.forEach(function (n) { byId[n.id] = n; });

  // ---- faction bands ----
  var bands = {}, cursorY = PAD_TOP;
  FACTIONS.forEach(function (f) {
    var lanes = 0;
    NODES.forEach(function (n) { if (n.fac === f.id) lanes = Math.max(lanes, n.lane + 1); });
    var h = lanes * LANE_H;
    bands[f.id] = { top: cursorY, lanes: lanes, height: h, faction: f };
    cursorY += h + BAND_GAP;
  });
  var CANVAS_H = cursorY + 20;

  var maxCol = 0;
  NODES.forEach(function (n) { maxCol = Math.max(maxCol, COLS[n.code]); });
  var CANVAS_W = PAD_LEFT + maxCol * COL_W + CARD_W + 80;

  function nx(n) { return PAD_LEFT + COLS[n.code] * COL_W; }
  function ny(n) { return bands[n.fac].top + n.lane * LANE_H; }

  // ---- state ----
  var unlocked = {};   // id -> true
  var selected = {};   // id -> true (targets)
  var STORE_KEY = 'sand_techtree_unlocked_v1';

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { JSON.parse(raw).forEach(function (id) { if (byId[id]) unlocked[id] = true; }); return; }
    } catch (e) {}
    (window.TT_DEFAULT_UNLOCKED || []).forEach(function (id) { unlocked[id] = true; });
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.keys(unlocked))); } catch (e) {}
  }

  // ---- graph helpers ----
  var ancCache = {};
  function ancestors(id) {
    if (ancCache[id]) return ancCache[id];
    var out = {}, stack = (byId[id].req || []).slice();
    while (stack.length) {
      var r = stack.pop();
      if (!byId[r] || out[r]) continue;
      out[r] = true;
      (byId[r].req || []).forEach(function (x) { stack.push(x); });
    }
    ancCache[id] = out; return out;
  }
  function descendants(id) {
    var out = {}, changed = true;
    while (changed) {
      changed = false;
      NODES.forEach(function (n) {
        if (out[n.id]) return;
        if (n.req.indexOf(id) >= 0 || n.req.some(function (r) { return out[r]; })) {
          out[n.id] = true; changed = true;
        }
      });
    }
    return out;
  }

  function pathSet() {
    var set = {};
    Object.keys(selected).forEach(function (id) {
      set[id] = true;
      var a = ancestors(id);
      Object.keys(a).forEach(function (x) { set[x] = true; });
    });
    return set;
  }

  function fmt(n) { return n.toLocaleString('en-US'); }

  // ---- unlock with cascade ----
  function setUnlocked(id, on) {
    if (on) {
      unlocked[id] = true;
      var a = ancestors(id);
      Object.keys(a).forEach(function (x) { unlocked[x] = true; });
    } else {
      delete unlocked[id];
      var d = descendants(id);
      Object.keys(d).forEach(function (x) { delete unlocked[x]; });
    }
    saveState();
  }

  // ============================================================
  // RENDER
  // ============================================================
  var root = document.getElementById('tt-canvas');
  var svg = document.getElementById('tt-svg');
  var tierbar = document.getElementById('tt-tierbar');
  root.style.width = CANVAS_W + 'px';
  root.style.height = CANVAS_H + 'px';
  svg.setAttribute('width', CANVAS_W);
  svg.setAttribute('height', CANVAS_H);
  svg.setAttribute('viewBox', '0 0 ' + CANVAS_W + ' ' + CANVAS_H);

  // tier dividers + tier bar
  (function () {
    tierbar.style.width = CANVAS_W + 'px';
    TIERS.forEach(function (t, i) {
      var firstCol = t.cols[0], lastCol = t.cols[t.cols.length - 1];
      var left = PAD_LEFT + firstCol * COL_W - 24;
      var right = PAD_LEFT + lastCol * COL_W + CARD_W + 24;
      var lab = document.createElement('div');
      lab.className = 'tt-tier-label';
      lab.style.left = left + 'px';
      lab.style.width = (right - left) + 'px';
      lab.innerHTML = '<span class="tt-tier-roman">' + t.roman + '</span>' + t.label;
      tierbar.appendChild(lab);
      // divider line on canvas (skip before tier I)
      if (i > 0) {
        var dv = document.createElement('div');
        dv.className = 'tt-divider';
        dv.style.left = (left - 0) + 'px';
        dv.style.height = CANVAS_H + 'px';
        root.appendChild(dv);
      }
    });
  })();

  // faction headers + band labels
  FACTIONS.forEach(function (f) {
    var b = bands[f.id];
    var head = document.createElement('div');
    head.className = 'tt-faction';
    head.style.setProperty('--fac', f.accent);
    head.style.left = '8px';
    head.style.top = (b.top + b.height / 2 - 33) + 'px';
    head.style.width = ROOT_W + 'px';
    head.innerHTML =
      '<span class="tt-faction-glyph glyph"></span>' +
      '<div class="tt-faction-meta"><span class="tt-faction-name">' + f.name + '</span>' +
      '<span class="tt-faction-sub">Faction line</span></div>' +
      '<span class="tt-faction-lvl">' + f.level + '</span>';
    root.appendChild(head);

    // band background tint
    var bg = document.createElement('div');
    bg.className = 'tt-band';
    bg.style.top = (b.top - 18) + 'px';
    bg.style.height = (b.height + 12) + 'px';
    bg.style.width = CANVAS_W + 'px';
    bg.style.setProperty('--fac', f.accent);
    root.insertBefore(bg, root.firstChild);
  });

  // nodes
  var nodeEls = {};
  NODES.forEach(function (n) {
    var f = bands[n.fac].faction;
    var el = document.createElement('div');
    el.className = 'tnode';
    el.dataset.id = n.id;
    el.style.left = nx(n) + 'px';
    el.style.top = ny(n) + 'px';
    el.style.width = CARD_W + 'px';
    el.style.height = CARD_H + 'px';
    el.style.setProperty('--fac', f.accent);
    el.innerHTML =
      '<span class="tnode-rail"></span>' +
      '<button class="tnode-status" aria-label="Toggle unlocked"></button>' +
      '<div class="tnode-main">' +
        '<div class="tnode-head"><span class="tnode-name" title="' + n.name + '">' + n.name + '</span></div>' +
        '<div class="tnode-cost"><span class="tnode-scrap"></span>' +
        '<span class="tnode-num">' + fmt(n.scrap) + '</span>' +
        '<span class="tnode-gear">+ <i>⚙</i></span></div>' +
      '</div>' +
      '<span class="tnode-glyph glyph"></span>' +
      (n.count ? '<span class="tnode-count">' + n.count + '</span>' : '');
    root.appendChild(el);
    nodeEls[n.id] = el;
  });

  // ---- connectors ----
  var SVGNS = 'http://www.w3.org/2000/svg';
  var edgeEls = []; // {el, from, to}
  function addEdge(from, to, fromRoot) {
    var x1, y1;
    if (fromRoot) {
      var b = bands[to.fac];
      x1 = 8 + ROOT_W; y1 = b.top + b.height / 2;
    } else {
      x1 = nx(from) + CARD_W; y1 = ny(from) + CARD_H / 2;
    }
    var x2 = nx(to), y2 = ny(to) + CARD_H / 2;
    var midX = x1 + Math.max(18, (x2 - x1) / 2);
    var d = 'M ' + x1 + ' ' + y1 + ' H ' + midX + ' V ' + y2 + ' H ' + x2;
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'tt-edge');
    svg.appendChild(p);
    edgeEls.push({ el: p, from: fromRoot ? null : from.id, to: to.id });
  }
  NODES.forEach(function (n) {
    if (!n.req.length) { addEdge(null, n, true); }
    else n.req.forEach(function (r) { if (byId[r]) addEdge(byId[r], n); });
  });

  // ============================================================
  // VISUAL UPDATE
  // ============================================================
  function refresh() {
    var ps = pathSet();
    var hasSel = Object.keys(selected).length > 0;

    NODES.forEach(function (n) {
      var el = nodeEls[n.id];
      el.classList.toggle('is-unlocked', !!unlocked[n.id]);
      el.classList.toggle('is-selected', !!selected[n.id]);
      el.classList.toggle('in-path', hasSel && !!ps[n.id] && !selected[n.id]);
      el.classList.toggle('dimmed', hasSel && !ps[n.id]);
    });

    edgeEls.forEach(function (e) {
      var active = hasSel && (e.to in ps) && (e.from === null ? true : (e.from in ps));
      var done = unlocked[e.to] && (e.from === null || unlocked[e.from]);
      e.el.classList.toggle('active', active && !done);
      e.el.classList.toggle('done', done);
    });

    updateSummary(ps);
  }

  // ============================================================
  // SUMMARY PANEL
  // ============================================================
  var sumEl = document.getElementById('tt-summary-body');
  var sumCount = document.getElementById('tt-sum-count');

  function updateSummary(ps) {
    var ids = Object.keys(selected);
    var totalUnlockedCount = Object.keys(unlocked).length;
    sumCount.textContent = totalUnlockedCount + ' / ' + NODES.length + ' unlocked';

    if (!ids.length) {
      sumEl.innerHTML =
        '<div class="tt-sum-empty">Click any tech to plan a path. ' +
        'Its prerequisites light up and the remaining cost — counting only what you haven\u2019t unlocked yet — shows here. ' +
        'Select several to combine paths. Tick the ring on a card to mark it already unlocked.</div>';
      return;
    }

    var pathIds = Object.keys(ps);
    var remaining = 0, full = 0, needCount = 0;
    pathIds.forEach(function (id) {
      full += byId[id].scrap;
      if (!unlocked[id]) { remaining += byId[id].scrap; needCount++; }
    });

    // group remaining steps by tier for a readable plan
    var steps = pathIds.filter(function (id) { return !unlocked[id]; })
      .sort(function (a, b) { return COLS[byId[a].code] - COLS[byId[b].code]; });

    var targetsHtml = ids.map(function (id) {
      var n = byId[id];
      return '<span class="tt-chip" data-clear="' + id + '">' + n.name +
        '<i class="tt-chip-x">\u00d7</i></span>';
    }).join('');

    var stepsHtml = steps.map(function (id) {
      var n = byId[id];
      var fac = FACTIONS.filter(function (f) { return f.id === n.fac; })[0];
      return '<li class="tt-step" data-hl="' + id + '">' +
        '<span class="tt-step-dot" style="background:' + fac.accent + '"></span>' +
        '<span class="tt-step-code">' + n.code + '</span>' +
        '<span class="tt-step-name">' + n.name + '</span>' +
        '<span class="tt-step-cost">' + fmt(n.scrap) + '</span></li>';
    }).join('');

    sumEl.innerHTML =
      '<div class="tt-sum-targets">' + targetsHtml + '</div>' +
      '<div class="tt-sum-figures">' +
        '<div class="tt-fig tt-fig-main"><span class="tt-fig-label">Remaining to unlock</span>' +
          '<span class="tt-fig-val">' + fmt(remaining) + '<i>scrap</i></span></div>' +
        '<div class="tt-fig"><span class="tt-fig-label">Techs left</span>' +
          '<span class="tt-fig-val tt-fig-sm">' + needCount + '</span></div>' +
        '<div class="tt-fig"><span class="tt-fig-label">Full path</span>' +
          '<span class="tt-fig-val tt-fig-sm">' + fmt(full) + '</span></div>' +
      '</div>' +
      (steps.length ?
        '<div class="tt-sum-plan"><div class="tt-sum-plan-h">Build order' +
        '<button class="tt-mini-btn" id="tt-mark-path">Mark all unlocked</button></div>' +
        '<ol class="tt-steps">' + stepsHtml + '</ol></div>'
        : '<div class="tt-sum-done">Every tech on this path is already unlocked.</div>');

    var mark = document.getElementById('tt-mark-path');
    if (mark) mark.addEventListener('click', function () {
      Object.keys(ps).forEach(function (id) { unlocked[id] = true; });
      saveState(); refresh();
    });
  }

  // ============================================================
  // TOOLTIP
  // ============================================================
  var tip = document.getElementById('tt-tip');
  function showTip(n, el) {
    var a = ancestors(n.id);
    var need = 0, needN = 0;
    Object.keys(a).concat([n.id]).forEach(function (id) {
      if (!unlocked[id]) { need += byId[id].scrap; needN++; }
    });
    var reqNames = n.req.length
      ? n.req.map(function (r) { return byId[r] ? byId[r].name : r; }).join(', ')
      : 'Faction root \u2014 no prerequisite';
    var status = unlocked[n.id]
      ? '<span class="tt-tip-st ok">Unlocked</span>'
      : '<span class="tt-tip-st">Locked</span>';
    tip.innerHTML =
      '<div class="tt-tip-h"><span class="tt-tip-code">' + n.code + '</span>' +
      '<span class="tt-tip-name">' + n.name + '</span>' + status + '</div>' +
      '<div class="tt-tip-row"><span>Cost</span><b>' + fmt(n.scrap) + ' scrap' +
        (n.count ? ' \u00b7 \u00d7' + n.count : '') + '</b></div>' +
      '<div class="tt-tip-row"><span>Requires</span><b>' + reqNames + '</b></div>' +
      '<div class="tt-tip-path">' +
        (unlocked[n.id]
          ? 'Already unlocked.'
          : 'Path from your progress: <b>' + fmt(need) + ' scrap</b> across <b>' + needN + '</b> tech' + (needN === 1 ? '' : 's')) +
      '</div>';
    tip.classList.add('show');
    positionTip(el);
  }
  function positionTip(el) {
    var r = el.getBoundingClientRect();
    var tr = tip.getBoundingClientRect();
    var top = r.top - tr.height - 10;
    if (top < 8) top = r.bottom + 10;
    var left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }
  function hideTip() { tip.classList.remove('show'); }

  // ============================================================
  // EVENTS
  // ============================================================
  root.addEventListener('click', function (e) {
    var statusBtn = e.target.closest('.tnode-status');
    var card = e.target.closest('.tnode');
    if (!card) return;
    var id = card.dataset.id;
    if (statusBtn) {
      setUnlocked(id, !unlocked[id]);
      refresh();
      return;
    }
    if (selected[id]) delete selected[id]; else selected[id] = true;
    refresh();
  });

  root.addEventListener('mouseover', function (e) {
    var card = e.target.closest('.tnode');
    if (!card) return;
    var n = byId[card.dataset.id];
    if (n) showTip(n, card);
  });
  root.addEventListener('mouseout', function (e) {
    var card = e.target.closest('.tnode');
    if (card && !card.contains(e.relatedTarget)) hideTip();
  });

  // summary interactions (clear chip, highlight step)
  sumEl.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-clear]');
    if (chip) { delete selected[chip.dataset.clear]; refresh(); return; }
  });
  sumEl.addEventListener('mouseover', function (e) {
    var step = e.target.closest('[data-hl]');
    if (step) { var el = nodeEls[step.dataset.hl]; if (el) el.classList.add('flash'); }
  });
  sumEl.addEventListener('mouseout', function (e) {
    var step = e.target.closest('[data-hl]');
    if (step) { var el = nodeEls[step.dataset.hl]; if (el) el.classList.remove('flash'); }
  });

  // toolbar
  document.getElementById('tt-clear-sel').addEventListener('click', function () {
    selected = {}; refresh();
  });
  document.getElementById('tt-reset-unlocked').addEventListener('click', function () {
    if (!confirm('Reset your unlocked progress to the starting techs?')) return;
    unlocked = {};
    (window.TT_DEFAULT_UNLOCKED || []).forEach(function (id) { unlocked[id] = true; });
    saveState(); refresh();
  });

  // ---- boot ----
  loadState();
  refresh();
})();
