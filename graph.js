/*
 * graph.js — layered layout + SVG rendering of the LR item-set automaton.
 *
 * Layout: each state is placed in the column equal to its BFS distance from
 * I0, so every "forward" GOTO edge goes exactly one column to the right.
 * Edges that go back (or stay in the same column) are routed orthogonally
 * through the empty channels between columns, and over a corridor above or
 * below the graph when they span several columns. This keeps every edge off
 * the state boxes.
 */
(function (root) {
  'use strict';

  const FONT = '500 12px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const TITLE_FONT = '700 12px Inter, system-ui, sans-serif';
  const PAD_X = 12, HEADER_H = 26, LINE_H = 18, PAD_Y = 8;
  const ROW_GAP = 28, MIN_CHANNEL = 96, LANE_GAP = 14, MARGIN = 28, CORRIDOR_GAP = 14;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let ctx = null;
  function textWidth(text, font) {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  /*
   * nodes: [{ id, title, lines: [{ segs: [{ text, cls }], kernel }] }]
   * edges: [{ from, to, symbol }]
   */
  function layout(nodes, edges) {
    const byId = new Map(nodes.map(n => [n.id, n]));

    // Column = BFS depth from state 0.
    const depth = new Map([[0, 0]]);
    const queue = [0];
    while (queue.length) {
      const u = queue.shift();
      for (const e of edges) if (e.from === u && !depth.has(e.to)) { depth.set(e.to, depth.get(u) + 1); queue.push(e.to); }
    }
    for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 0);

    const ncols = Math.max(...nodes.map(n => depth.get(n.id))) + 1;
    const cols = Array.from({ length: ncols }, () => []);
    nodes.forEach(n => cols[depth.get(n.id)].push(n.id));

    // Barycentre ordering: place a node near the parents that point to it.
    const rank = new Map();
    cols[0].forEach((id, i) => rank.set(id, i));
    for (let c = 1; c < ncols; c++) {
      const score = id => {
        const ps = edges.filter(e => e.to === id && depth.get(e.from) === c - 1).map(e => rank.get(e.from));
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 1e9;
      };
      cols[c].sort((a, b) => (score(a) - score(b)) || (a - b));
      cols[c].forEach((id, i) => rank.set(id, i));
    }

    // Node sizes.
    const box = new Map();
    for (const n of nodes) {
      let w = textWidth(n.title, TITLE_FONT) + 2 * PAD_X + 30;
      for (const l of n.lines) w = Math.max(w, textWidth(l.segs.map(s => s.text).join(''), FONT) + 2 * PAD_X);
      const sep = n.lines.some(l => l.kernel) && n.lines.some(l => !l.kernel) ? 6 : 0;
      box.set(n.id, { id: n.id, col: depth.get(n.id), w: Math.ceil(w), h: HEADER_H + PAD_Y * 2 + n.lines.length * LINE_H + sep, sep });
    }

    // Classify edges.
    const kinds = edges.map(e => {
      const cf = depth.get(e.from), ct = depth.get(e.to);
      if (e.from === e.to) return 'self';
      if (ct === cf + 1) return 'forward';
      if (ct === cf) return 'same';
      if (ct === cf - 1) return 'back1';
      return 'backfar';
    });

    // Channel lanes (channel c sits to the right of column c).
    const channelEdges = Array.from({ length: ncols }, () => []);
    const corridor = { top: [], bottom: [] };
    edges.forEach((e, i) => {
      const cf = depth.get(e.from), ct = depth.get(e.to);
      if (kinds[i] === 'same') channelEdges[cf].push({ i, seg: 0 });
      if (kinds[i] === 'back1') channelEdges[ct].push({ i, seg: 0 });
      if (kinds[i] === 'backfar') { channelEdges[cf - 1].push({ i, seg: 0 }); channelEdges[ct].push({ i, seg: 1 }); }
    });

    const colW = cols.map(ids => Math.max(...ids.map(id => box.get(id).w)));
    const chanW = channelEdges.map(list => Math.max(MIN_CHANNEL, 48 + list.length * LANE_GAP));
    const colX = [];
    let x = MARGIN;
    for (let c = 0; c < ncols; c++) { colX.push(x); x += colW[c] + chanW[c]; }
    const width = x - chanW[ncols - 1] + MARGIN + 40;

    const colH = cols.map(ids => ids.reduce((s, id) => s + box.get(id).h, 0) + ROW_GAP * (ids.length - 1));
    const maxH = Math.max(...colH);

    // Decide top/bottom corridor for long back edges (needs rough y first).
    const roughY = id => {
      const b = box.get(id), c = b.col;
      let y = (maxH - colH[c]) / 2;
      for (const o of cols[c]) { if (o === id) break; y += box.get(o).h + ROW_GAP; }
      return y + b.h / 2;
    };
    edges.forEach((e, i) => {
      if (kinds[i] !== 'backfar') return;
      const mid = (roughY(e.from) + roughY(e.to)) / 2;
      (mid <= maxH / 2 ? corridor.top : corridor.bottom).push(i);
    });
    const selfLoops = edges.some((e, i) => kinds[i] === 'self');
    const topPad = MARGIN + (selfLoops ? 34 : 0) + corridor.top.length * CORRIDOR_GAP + (corridor.top.length ? 16 : 0);
    const height = topPad + maxH + MARGIN + corridor.bottom.length * CORRIDOR_GAP + (corridor.bottom.length ? 16 : 0) + 10;

    for (let c = 0; c < ncols; c++) {
      let y = topPad + (maxH - colH[c]) / 2;
      for (const id of cols[c]) { const b = box.get(id); b.x = colX[c]; b.y = y; y += b.h + ROW_GAP; }
    }

    const laneX = {};
    channelEdges.forEach((list, c) => {
      const left = colX[c] + colW[c];
      const n = list.length;
      list.forEach((ent, k) => { laneX[ent.i + ':' + ent.seg] = left + chanW[c] * (k + 1) / (n + 1); });
    });
    const corrY = {};
    corridor.top.forEach((i, k) => { corrY[i] = topPad - 16 - k * CORRIDOR_GAP; });
    corridor.bottom.forEach((i, k) => { corrY[i] = topPad + maxH + 16 + k * CORRIDOR_GAP; });

    // Port assignment: spread edge endpoints along each side of a node.
    const ports = new Map(); // key nodeId:side -> [{ i, end, want }]
    const addPort = (id, side, i, end, want) => {
      const k = id + ':' + side;
      if (!ports.has(k)) ports.set(k, []);
      ports.get(k).push({ i, end, want });
    };
    const cy = id => box.get(id).y + box.get(id).h / 2;
    edges.forEach((e, i) => {
      switch (kinds[i]) {
        case 'forward': addPort(e.from, 'R', i, 'src', cy(e.to)); addPort(e.to, 'L', i, 'dst', cy(e.from)); break;
        case 'same': addPort(e.from, 'R', i, 'src', cy(e.to)); addPort(e.to, 'R', i, 'dst', cy(e.from)); break;
        case 'back1': addPort(e.from, 'L', i, 'src', cy(e.to)); addPort(e.to, 'R', i, 'dst', cy(e.from)); break;
        case 'backfar': addPort(e.from, 'L', i, 'src', corrY[i]); addPort(e.to, 'R', i, 'dst', corrY[i]); break;
      }
    });
    const portY = {};
    for (const [k, list] of ports) {
      const b = box.get(+k.split(':')[0]);
      list.sort((a, c) => a.want - c.want);
      const top = b.y + HEADER_H + 6, bottom = b.y + b.h - 8;
      list.forEach((p, j) => { portY[p.i + ':' + p.end] = list.length === 1 ? Math.min(Math.max(b.y + b.h / 2, top), bottom) : top + (bottom - top) * j / (list.length - 1); });
    }

    // Paths and labels.
    const labels = [];
    const overlaps = (r) => labels.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
    const labelBox = (text, px, py) => {
      const w = textWidth(text, FONT) + 12, h = 18;
      return { x: px - w / 2, y: py - h / 2, w, h, text };
    };
    const place = (text, candidates) => {
      for (const [px, py] of candidates) { const r = labelBox(text, px, py); if (!overlaps(r) && !hitsNode(r)) { labels.push(r); return r; } }
      const r = labelBox(text, candidates[0][0], candidates[0][1]);
      labels.push(r);
      return r;
    };
    const hitsNode = r => [...box.values()].some(b => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y);

    const rounded = (pts, rad = 8) => {
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const d1 = Math.hypot(x1 - x0, y1 - y0), d2 = Math.hypot(x2 - x1, y2 - y1);
        const r = Math.min(rad, d1 / 2, d2 / 2);
        const ax = x1 - (x1 - x0) / (d1 || 1) * r, ay = y1 - (y1 - y0) / (d1 || 1) * r;
        const bx = x1 + (x2 - x1) / (d2 || 1) * r, by = y1 + (y2 - y1) / (d2 || 1) * r;
        d += ` L${ax},${ay} Q${x1},${y1} ${bx},${by}`;
      }
      const last = pts[pts.length - 1];
      return d + ` L${last[0]},${last[1]}`;
    };
    const bez = (p0, p1, p2, p3, t) => {
      const u = 1 - t;
      return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
    };

    const outEdges = edges.map((e, i) => {
      const s = box.get(e.from), t = box.get(e.to);
      let d, label;
      if (kinds[i] === 'self') {
        const k = edges.slice(0, i).filter((x, j) => kinds[j] === 'self' && x.from === e.from).length;
        const x0 = s.x + s.w - 26 - k * 30;
        d = `M${x0},${s.y} C${x0 - 6},${s.y - 34} ${x0 + 30},${s.y - 34} ${x0 + 22},${s.y}`;
        label = place(e.symbol, [[x0 + 12, s.y - 30]]);
      } else if (kinds[i] === 'forward') {
        const p0 = [s.x + s.w, portY[i + ':src']], p3 = [t.x, portY[i + ':dst']];
        const dx = Math.max(30, (p3[0] - p0[0]) / 2);
        const p1 = [p0[0] + dx, p0[1]], p2 = [p3[0] - dx, p3[1]];
        d = `M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`;
        label = place(e.symbol, [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8].map(tt => bez(p0, p1, p2, p3, tt)));
      } else {
        let pts;
        if (kinds[i] === 'same') {
          const lx = laneX[i + ':0'];
          pts = [[s.x + s.w, portY[i + ':src']], [lx, portY[i + ':src']], [lx, portY[i + ':dst']], [t.x + t.w, portY[i + ':dst']]];
        } else if (kinds[i] === 'back1') {
          const lx = laneX[i + ':0'];
          pts = [[s.x, portY[i + ':src']], [lx, portY[i + ':src']], [lx, portY[i + ':dst']], [t.x + t.w, portY[i + ':dst']]];
        } else {
          const l1 = laneX[i + ':0'], l2 = laneX[i + ':1'], yc = corrY[i];
          pts = [[s.x, portY[i + ':src']], [l1, portY[i + ':src']], [l1, yc], [l2, yc], [l2, portY[i + ':dst']], [t.x + t.w, portY[i + ':dst']]];
        }
        d = rounded(pts);
        // Prefer the first vertical run (inside the channel), then the others.
        const segOrder = [2, ...Array.from({ length: pts.length - 1 }, (_, j) => j + 1).filter(j => j !== 2)];
        const cands = [];
        for (const j of segOrder) {
          const [ax, ay] = pts[j - 1], [bx, by] = pts[j];
          for (const tt of [0.5, 0.3, 0.7]) cands.push([ax + (bx - ax) * tt, ay + (by - ay) * tt]);
        }
        label = place(e.symbol, cands);
      }
      return { from: e.from, to: e.to, symbol: e.symbol, d, label, kind: kinds[i] };
    });

    return { nodes, boxes: box, edges: outEdges, width: Math.ceil(width), height: Math.ceil(height) };
  }

  /*
   * view: { visible:Set, expanded:Set, current, selected, freshNodes:Set,
   *         freshFrom, marked:Set (conflict states), hideEdgesFrom:fn }
   */
  function render(L, view, zoom) {
    const parts = [];
    parts.push(`<svg class="automaton" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${L.height}" width="${Math.round(L.width * zoom)}" height="${Math.round(L.height * zoom)}" role="img" aria-label="LR automaton">`);
    parts.push(`<defs>
      <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" class="ah"/></marker>
      <marker id="ah-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" class="ah-hot"/></marker>
    </defs>`);

    const shown = L.edges.filter(e => view.expanded.has(e.from) && view.visible.has(e.to));
    parts.push('<g class="edges">');
    for (const e of shown) {
      const hot = e.from === view.freshFrom;
      const sel = view.selected === e.from || view.selected === e.to;
      parts.push(`<path d="${e.d}" class="edge${hot ? ' hot' : ''}${sel ? ' sel' : ''}" marker-end="url(#${hot ? 'ah-hot' : 'ah'})"/>`);
    }
    parts.push('</g><g class="nodes">');
    for (const n of L.nodes) {
      if (!view.visible.has(n.id)) continue;
      const b = L.boxes.get(n.id);
      const cls = ['node'];
      cls.push(view.expanded.has(n.id) ? 'expanded' : 'pending');
      if (n.id === view.current) cls.push('current');
      if (n.id === view.selected) cls.push('selected');
      if (view.freshNodes && view.freshNodes.has(n.id)) cls.push('fresh');
      if (view.marked && view.marked.has(n.id)) cls.push('marked');
      parts.push(`<g class="${cls.join(' ')}" data-state="${n.id}" transform="translate(${b.x},${b.y})" tabindex="0" role="button" aria-label="State ${esc(n.title)}">`);
      parts.push(`<rect class="node-box" width="${b.w}" height="${b.h}" rx="10"/>`);
      parts.push(`<path class="node-head" d="M0,10 a10,10 0 0 1 10,-10 h${b.w - 20} a10,10 0 0 1 10,10 v${HEADER_H - 10} h-${b.w} z"/>`);
      parts.push(`<text class="node-title" x="${PAD_X}" y="17">${esc(n.title)}</text>`);
      if (view.marked && view.marked.has(n.id)) parts.push(`<text class="node-flag" x="${b.w - PAD_X}" y="17" text-anchor="end">⚠</text>`);
      else if (!view.expanded.has(n.id)) parts.push(`<text class="node-tag" x="${b.w - PAD_X}" y="17" text-anchor="end">new</text>`);
      let y = HEADER_H + PAD_Y + 13;
      let prevKernel = true;
      n.lines.forEach(l => {
        if (prevKernel && !l.kernel && b.sep) {
          parts.push(`<line class="node-sep" x1="${PAD_X}" x2="${b.w - PAD_X}" y1="${y - 13}" y2="${y - 13}"/>`);
          y += b.sep;
        }
        prevKernel = l.kernel;
        parts.push(`<text class="item${l.kernel ? ' kernel' : ''}" x="${PAD_X}" y="${y}">${l.segs.map(s => `<tspan class="${s.cls || ''}">${esc(s.text)}</tspan>`).join('')}</text>`);
        y += LINE_H;
      });
      parts.push('</g>');
    }
    parts.push('</g><g class="labels">');
    for (const e of shown) {
      const r = e.label, hot = e.from === view.freshFrom;
      parts.push(`<g class="elabel${hot ? ' hot' : ''}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="9"/><text x="${r.x + r.w / 2}" y="${r.y + 13}" text-anchor="middle">${esc(r.text)}</text></g>`);
    }
    parts.push('</g></svg>');
    return parts.join('');
  }

  /* Parse tree: leaves left to right, parents centred over their children. */
  function renderTree(tree) {
    if (!tree) return '';
    const UNIT = 46, LEVEL = 58;
    let leaf = 0, maxDepth = 0;
    const nodes = [], links = [];
    (function walk(n, depth) {
      maxDepth = Math.max(maxDepth, depth);
      const me = { sym: n.sym, depth, leaf: !n.children.length };
      nodes.push(me);
      if (!n.children.length) { me.x = leaf++ * UNIT; }
      else {
        const kids = n.children.map(c => walk(c, depth + 1));
        me.x = (kids[0].x + kids[kids.length - 1].x) / 2;
        kids.forEach(k => links.push([me, k]));
      }
      return me;
    })(tree, 0);
    const W = Math.max(leaf * UNIT, UNIT) + 40, H = (maxDepth + 1) * LEVEL + 20;
    const X = n => n.x + 20 + UNIT / 2 - 3, Y = n => n.depth * LEVEL + 26;
    let s = `<svg class="ptree" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Parse tree">`;
    for (const [a, b] of links) s += `<path d="M${X(a)},${Y(a) + 11} C${X(a)},${Y(a) + 34} ${X(b)},${Y(b) - 34} ${X(b)},${Y(b) - 11}"/>`;
    for (const n of nodes) {
      const w = Math.max(26, textWidth(n.sym, FONT) + 14);
      s += `<g class="${n.leaf ? 'leaf' : 'inner'}"><rect x="${X(n) - w / 2}" y="${Y(n) - 11}" width="${w}" height="22" rx="11"/><text x="${X(n)}" y="${Y(n) + 4}" text-anchor="middle">${esc(n.sym)}</text></g>`;
    }
    return s + '</svg>';
  }

  root.LRGraph = { layout, render, renderTree };
})(window);
