/*
 * app.js — user interface for the LR Parser Visualizer.
 *
 * The construction is split into phases. Each phase has its own step counter
 * so that "Next step" reveals exactly one unit of work:
 *   grammar  – augmented grammar, FIRST/FOLLOW, grammar-class summary
 *   items    – canonical collection: one state expanded per step
 *   merge    – (LALR only) one pair/group of same-core CLR states merged per step
 *   table    – ACTION/GOTO table: one entry per step
 *   parse    – one shift / reduce / accept / error action per step
 */
(function () {
  'use strict';

  const LR = window.LREngine;
  const GR = window.LRGraph;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------------------------------------------------ *
   *  Example grammars
   * ------------------------------------------------------------------ */
  const EXAMPLES = [
    { group: 'Conflict-free examples', items: [
      { id: 'expr', label: 'Expression grammar (SLR, LALR, CLR)', variant: 'SLR(1)', input: 'id + id * id',
        grammar: 'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id',
        note: 'Classic expression grammar (Dragon Book 4.1). It is SLR(1), LALR(1) and CLR(1), but not LR(0).' },
      { id: 'cc', label: 'S → C C (LR(0) and every larger class)', variant: 'LALR(1)', input: 'c c d c d',
        grammar: 'S -> C C\nC -> c C | d',
        note: 'Dragon Book 4.55. In LALR(1), CLR states I3/I6, I4/I7 and I8/I9 have equal cores and are merged into I36, I47 and I89.' },
      { id: 'list', label: 'S → ( L ) | x (LR(0))', variant: 'LR(0)', input: '( x , ( x , x ) )',
        grammar: 'S -> ( L ) | x\nL -> S | L , S',
        note: 'A small list grammar that is LR(0), so even the simplest table has no conflicts.' },
      { id: 'parens', label: 'Balanced parentheses with ε (SLR)', variant: 'SLR(1)', input: '( ( ) ) ( )',
        grammar: 'S -> ( S ) S | ε',
        note: 'Uses an ε-production. LR(0) has a shift-reduce conflict on "(", which SLR(1) removes using FOLLOW(S) = { ), $ }.' },
    ] },
    { group: 'Conflict demos (one per variant)', items: [
      { id: 'c-lr0', label: 'Not LR(0): expression grammar (shift-reduce)', variant: 'LR(0)', input: 'id + id * id',
        grammar: 'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id',
        note: 'LR(0) reduces on every terminal, so E → T · clashes with shifting * in I2 and I9. Switch to SLR(1) to see the conflicts disappear.' },
      { id: 'c-lr0rr', label: 'Not LR(0): A → x vs B → x (reduce-reduce)', variant: 'LR(0)', input: 'x a',
        grammar: 'S -> A a | B b\nA -> x\nB -> x',
        note: 'After reading x, LR(0) cannot choose between A → x and B → x. SLR(1) separates them, because FOLLOW(A) = { a } and FOLLOW(B) = { b }.' },
      { id: 'c-slr', label: 'Not SLR(1): L = R grammar (shift-reduce)', variant: 'SLR(1)', input: 'id = * id',
        grammar: 'S -> L = R | R\nL -> * R | id\nR -> L',
        note: 'Dragon Book 4.48. "=" is in FOLLOW(R), so SLR(1) reduces R → L in I2 where it should shift "=". LALR(1) and CLR(1) both handle it.' },
      { id: 'c-lalr', label: 'Not LALR(1): merged reduce-reduce', variant: 'LALR(1)', input: 'a c d',
        grammar: 'S -> a A d | b B d | a B e | b A e\nA -> c\nB -> c',
        note: 'CLR(1) is conflict-free. Merging the two states that hold A → c · and B → c · creates reduce-reduce conflicts on d and e.' },
      { id: 'c-clr', label: 'Not CLR(1): ambiguous E → E + E | E * E', variant: 'CLR(1)', input: 'id + id * id',
        grammar: 'E -> E + E | E * E | ( E ) | id',
        note: 'An ambiguous grammar is not LR(k) for any k. Even CLR(1) has shift-reduce conflicts on + and *.' },
      { id: 'c-else', label: 'Not CLR(1): dangling else', variant: 'CLR(1)', input: 'i i a e a',
        grammar: 'S -> i S e S | i S | a',
        note: 'i = if, e = else, a = statement. The dangling-else ambiguity is a shift-reduce conflict on e in every LR variant.' },
      { id: 'c-rr', label: 'Not CLR(1): S → A | B (reduce-reduce)', variant: 'CLR(1)', input: 'x',
        grammar: 'S -> A | B\nA -> x\nB -> x',
        note: 'x can be derived through A or through B. Both reductions have lookahead $, so every variant has a reduce-reduce conflict.' },
    ] },
  ];
  // Review 1 mode (index.html?review1): only the LR(0) and SLR(1) variants are shown.
  const REVIEW1 = /review1/i.test(location.search + location.hash);
  const SHOWN_VARIANTS = REVIEW1 ? ['LR(0)', 'SLR(1)'] : ['LR(0)', 'SLR(1)', 'CLR(1)', 'LALR(1)'];
  if (REVIEW1) {
    document.documentElement.classList.add('review1');
    EXAMPLES.forEach(gr => { gr.items = gr.items.filter(e => SHOWN_VARIANTS.includes(e.variant) || e.id === 'cc'); });
    EXAMPLES[0].items.find(e => e.id === 'cc').variant = 'LR(0)';
    EXAMPLES[0].items.find(e => e.id === 'cc').note = 'Dragon Book 4.55. An LR(0) grammar: the LR(0) table has no conflicts.';
    EXAMPLES[0].items.find(e => e.id === 'expr').note = 'Classic expression grammar (Dragon Book 4.1). It is SLR(1) but not LR(0).';
    EXAMPLES[0].items.find(e => e.id === 'expr').label = 'Expression grammar (SLR(1))';
  }
  const ALL_EXAMPLES = EXAMPLES.flatMap(g => g.items);
  const shownClasses = () => Object.entries(app.classes).filter(([v]) => SHOWN_VARIANTS.includes(v));

  const VARIANT_INFO = {
    'LR(0)': { items: 'LR(0) items', rule: 'A complete item A → α · puts "reduce" in every ACTION column of its state, with no lookahead.' },
    'SLR(1)': { items: 'LR(0) items', rule: 'A complete item A → α · puts "reduce" only under the terminals in FOLLOW(A).' },
    'CLR(1)': { items: 'LR(1) items', rule: 'A complete item [A → α ·, a] puts "reduce" only under its own lookahead a.' },
    'LALR(1)': { items: 'LR(1) items, merged by core', rule: 'CLR(1) states with the same core are merged. A complete item [A → α ·, a] puts "reduce" under its merged lookaheads a.' },
  };
  const PHASE_LABEL = { grammar: 'Grammar', items: 'Item sets', merge: 'LALR merge', table: 'Parsing table', parse: 'Parse string' };

  /* ------------------------------------------------------------------ *
   *  State
   * ------------------------------------------------------------------ */
  const app = {
    variant: 'SLR(1)',
    model: null,
    classes: null,
    parse: null,
    phase: 'grammar',
    step: { grammar: 0, items: 0, merge: 0, table: 0, parse: 0 },
    sel: null,
    zoom: 1,
    showClosure: true,
    layouts: {},
    timer: null,
  };

  const g = () => app.model.grammar;
  const isNT = s => g().isNT(s);
  const autoOf = key => (key === 'lalr' ? app.model.lalr : app.model.canonical);
  const tableKey = () => (app.model.lalr ? 'lalr' : 'canonical');
  const withLaOf = auto => auto.kind !== 'lr0';
  const sname = (auto, id) => 'I' + auto.states[id].name;

  /* ------------------------------------------------------------------ *
   *  Formatting helpers
   * ------------------------------------------------------------------ */
  const sym = s => `<span class="${isNT(s) ? 'nt' : 't'}">${esc(s)}</span>`;
  const seq = arr => (arr.length ? arr.map(sym).join(' ') : '<span class="muted">ε</span>');
  const prodH = p => `${sym(p.lhs)} → ${seq(p.rhs)}`;
  const setH = arr => '{ ' + arr.map(esc).join(', ') + ' }';
  // Numbered productions, shown at the top of every phase so r1, r2, … can be read anywhere.
  const prodStrip = () => `<div class="prod-strip" aria-label="Numbered productions"><span class="strip-label">Productions</span>${g().prods.map(p => `<span><span class="pn">r${p.id}</span> ${prodH(p)}</span>`).join('')}</div>`;
  function followStrip() {
    if (app.variant === 'LR(0)') return '<div class="prod-strip follow-strip"><span class="strip-label">LR(0) rule</span><span>a complete item A → α · (including the ε-item A → ε ·) puts rN in <b>every</b> ACTION column</span></div>';
    if (app.variant !== 'SLR(1)') return '';
    const ff = app.model.ff;
    return `<div class="prod-strip follow-strip"><span class="strip-label">FOLLOW sets (SLR reduce columns)</span>${g().nonterminals.map(n => `<span>FOLLOW(${sym(n)}) = ${setH(laList(ff.follow[n]))}</span>`).join('')}</div>`;
  }
  const laList = set => LR.sortLa(g(), set);

  // Items show the production number (r1, r2, …) so they can be matched with the
  // reduce entries of the table. An ε-production A → ε has the item A → ε · .
  function itemH(it, withLa, noTag) {
    const p = g().prods[it.p];
    const parts = p.rhs.length
      ? [...p.rhs.slice(0, it.dot).map(sym), '<span class="dotc">·</span>', ...p.rhs.slice(it.dot).map(sym)]
      : ['<span class="epsc">ε</span>', '<span class="dotc">·</span>'];
    let s = `${sym(p.lhs)} → ${parts.join(' ')}`;
    if (withLa && it.la) s += ` <span class="lac">, ${laList(it.la).map(esc).join(' / ')}</span>`;
    if (!noTag) s += ` <span class="pn-tag">r${it.p}</span>`;
    return s;
  }
  function itemSegs(it, withLa) {
    const p = g().prods[it.p];
    const before = p.rhs.slice(0, it.dot).join(' '), after = p.rhs.slice(it.dot).join(' ');
    const segs = p.rhs.length
      ? [{ text: p.lhs, cls: 'lhs' }, { text: ' → ' + (before ? before + ' ' : '') }, { text: '·', cls: 'dot' }]
      : [{ text: p.lhs, cls: 'lhs' }, { text: ' → ' }, { text: 'ε', cls: 'eps' }, { text: ' ' }, { text: '·', cls: 'dot' }];
    if (after) segs.push({ text: ' ' + after });
    if (it.dot === p.rhs.length) segs.forEach(s => { s.cls = (s.cls || '') + ' done'; });
    if (withLa && it.la) segs.push({ text: '  , ' + laList(it.la).join('/'), cls: 'la' });
    segs.push({ text: '   r' + it.p, cls: 'pn' });
    return segs;
  }

  /* ------------------------------------------------------------------ *
   *  Build
   * ------------------------------------------------------------------ */
  function build(keepPhase) {
    stopPlay();
    const text = $('#grammarInput').value;
    const m = LR.build(text, app.variant);
    const msg = $('#grammarMsg');
    if (m.errors.length) {
      app.model = null;
      msg.innerHTML = m.errors.map(e => `<span class="err">✗ ${esc(e)}</span>`).join('');
      $('#classMini').innerHTML = '';
      renderAll();
      return;
    }
    app.model = m;
    app.classes = LR.classify(text);
    app.layouts = {};
    app.sel = null;
    for (const k in app.step) app.step[k] = 0;
    runParse();
    const phases = phaseList();
    if (!keepPhase) app.phase = 'grammar';
    else if (!phases.includes(app.phase)) app.phase = 'table';

    const G = m.grammar;
    let html = `<span class="ok">✓ ${G.prods.length - 1} productions · ${G.terminals.length} terminals · ${G.nonterminals.length} non-terminals · ${m.automaton.states.length} ${app.variant} states</span>`;
    html += G.warnings.map(w => `<span class="warn">⚠ ${esc(w)}</span>`).join('');
    if (m.canonical.truncated) html += `<span class="warn">⚠ Stopped after 400 states: the grammar is too large to show step by step.</span>`;
    msg.innerHTML = html;
    renderClassMini();
    renderAll();
  }

  function runParse() {
    const m = app.model;
    app.parse = LR.parseInput(m.grammar, m.automaton, m.table, $('#inputString').value);
  }

  function setVariant(v, keepPhase = true) {
    app.variant = v;
    document.querySelectorAll('#variantSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.variant === v)));
    build(keepPhase);
  }

  function renderClassMini() {
    if (!app.classes) { $('#classMini').innerHTML = ''; return; }
    $('#classMini').innerHTML = shownClasses().map(([v, r]) =>
      `<button type="button" data-variant-pick="${v}" class="${v === app.variant ? 'current' : ''}" title="${r.conflicts ? r.conflicts + ' conflict(s)' : 'No conflicts'}">
        <b>${v}</b><span class="verdict-pill ${r.conflicts ? 'no' : 'yes'}">${r.conflicts ? '✗ ' + r.conflicts : '✓'}</span></button>`).join('');
  }

  /* ------------------------------------------------------------------ *
   *  Phases and stepping
   * ------------------------------------------------------------------ */
  function phaseList() {
    const p = ['grammar', 'items'];
    if (app.model && app.model.lalr) p.push('merge');
    p.push('table', 'parse');
    return p;
  }
  function maxStep(ph) {
    const m = app.model;
    if (!m) return 0;
    switch (ph) {
      case 'items': return m.canonical.expansions.length;
      case 'merge': return m.lalr.merges.length;
      case 'table': return m.table.entries.length;
      case 'parse': return app.parse.rows.length;
      default: return 0;
    }
  }

  function goPhase(ph) { stopPlay(); app.phase = ph; app.sel = null; renderAll(true); }
  function next() {
    if (!app.model) return;
    const ph = app.phase;
    if (app.step[ph] < maxStep(ph)) { app.step[ph]++; app.sel = null; renderAll(true); return false; }
    const ps = phaseList(), i = ps.indexOf(ph);
    if (i < ps.length - 1) { app.phase = ps[i + 1]; app.sel = null; renderAll(true); }
    return true;
  }
  function prev() {
    if (!app.model) return;
    const ph = app.phase;
    if (app.step[ph] > 0) { app.step[ph]--; app.sel = null; renderAll(true); return; }
    const ps = phaseList(), i = ps.indexOf(ph);
    if (i > 0) { app.phase = ps[i - 1]; app.sel = null; renderAll(true); }
  }
  function toEnd() { stopPlay(); if (!app.model) return; app.step[app.phase] = maxStep(app.phase); app.sel = null; renderAll(true); }
  function toStart() { stopPlay(); if (!app.model) return; app.step[app.phase] = 0; app.sel = null; renderAll(true); }

  function togglePlay() {
    if (app.timer) { stopPlay(); return; }
    if (!app.model) return;
    if (app.step[app.phase] >= maxStep(app.phase)) app.step[app.phase] = 0;
    $('#btnPlay').classList.add('playing');
    const delay = app.phase === 'table' ? 380 : 850;
    app.timer = setInterval(() => {
      if (app.step[app.phase] >= maxStep(app.phase)) { stopPlay(); return; }
      next();
      if (app.step[app.phase] >= maxStep(app.phase)) stopPlay();
    }, delay);
    renderAll(true);
  }
  function stopPlay() {
    if (app.timer) clearInterval(app.timer);
    app.timer = null;
    const b = $('#btnPlay');
    if (b) b.classList.remove('playing');
  }

  /* ------------------------------------------------------------------ *
   *  Rendering shell
   * ------------------------------------------------------------------ */
  function renderAll(stepChanged) {
    renderTabs();
    renderToolbar();
    const view = $('#phaseView');
    const keep = {};
    view.querySelectorAll('[data-keep-scroll]').forEach(el => { keep[el.dataset.keepScroll] = [el.scrollLeft, el.scrollTop]; });

    if (!app.model) {
      view.innerHTML = '<div class="empty">Fix the grammar on the left, then press <b>Build parser</b>.</div>';
      $('#stepNote').innerHTML = '';
      $('#inspector').innerHTML = '';
      $('#inspectorTag').textContent = '';
      return;
    }
    const after = ({ grammar: renderGrammar, items: renderItems, merge: renderMerge, table: renderTable, parse: renderParse })[app.phase]();
    view.querySelectorAll('[data-keep-scroll]').forEach(el => {
      const k = keep[el.dataset.keepScroll];
      if (k) { el.scrollLeft = k[0]; el.scrollTop = k[1]; }
    });
    if (typeof after === 'function') after(!!stepChanged);
  }

  function renderTabs() {
    const ps = phaseList();
    $('#phaseTabs').innerHTML = ps.map((p, i) => {
      const done = app.model && p !== app.phase && app.step[p] >= maxStep(p) && maxStep(p) > 0;
      return `<button role="tab" class="phase-tab${p === app.phase ? ' active' : ''}${done ? ' done' : ''}" data-phase="${p}" aria-selected="${p === app.phase}">
        <span class="num">${done ? '✓' : i + 1}</span>${PHASE_LABEL[p]}</button>`;
    }).join('');
  }

  function renderToolbar() {
    const ph = app.phase, max = maxStep(ph), k = app.step[ph];
    const titles = {
      grammar: 'Augmented grammar and FIRST / FOLLOW',
      items: app.model && app.model.canonical.kind === 'lr1' ? 'Canonical collection of LR(1) item sets' : 'Canonical collection of LR(0) item sets',
      merge: 'LALR(1): merging states with identical cores',
      table: `${app.variant} ACTION / GOTO table`,
      parse: 'Parsing the test string',
    };
    $('#phaseTitle').textContent = titles[ph];
    $('#stepCounter').textContent = app.model && max ? `step ${k} / ${max}` : '';
    const ps = phaseList(), nextPhase = ps[ps.indexOf(ph) + 1];
    const btn = $('#btnNext');
    const atEnd = !app.model || (k >= max && !nextPhase);
    btn.disabled = atEnd;
    btn.firstChild.textContent = k >= max && nextPhase ? `Continue to ${PHASE_LABEL[nextPhase]} ` : 'Next step ';
    $('#btnPrev').disabled = !app.model || (k === 0 && ps.indexOf(ph) === 0);
    $('#btnReset').disabled = !app.model || k === 0;
    $('#btnEnd').disabled = !app.model || k >= max;
    $('#btnPlay').disabled = !app.model || max === 0;
  }

  function note(html, tone) {
    const el = $('#stepNote');
    el.className = 'step-note' + (tone ? ' ' + tone : '');
    el.innerHTML = html;
  }
  function inspector(tag, html) {
    $('#inspectorTag').textContent = tag;
    $('#inspector').innerHTML = `<div class="insp">${html}</div>`;
  }

  /* ------------------------------------------------------------------ *
   *  Phase 1: grammar
   * ------------------------------------------------------------------ */
  function renderGrammar() {
    const G = g(), ff = app.model.ff;
    const prods = G.prods.map(p => `<div><span class="pn">r${p.id}</span>${prodH(p)}${p.id === 0 ? '<span class="aug">(augmented: reduce by r0 = ACCEPT)</span>' : ''}</div>`).join('');
    const fRows = G.nonterminals.map(n => {
      const first = laList(ff.first[n]).map(esc);
      if (ff.nullable.has(n)) first.push('ε');
      return `<tr><td class="mono">${sym(n)}</td><td class="mono">{ ${first.join(', ')} }</td><td class="mono">${setH(laList(ff.follow[n]))}</td></tr>`;
    }).join('');
    const cls = shownClasses().map(([v, r]) => `
      <tr class="clickable${v === app.variant ? ' current' : ''}" data-variant-pick="${v}">
        <td class="mono"><b>${v}</b></td><td>${VARIANT_INFO[v].items}</td><td class="mono">${r.states}</td>
        <td class="mono">${r.conflicts ? `${r.counts['shift-reduce']} S/R · ${r.counts['reduce-reduce']} R/R` : '0'}</td>
        <td><span class="verdict-pill ${r.conflicts ? 'no' : 'yes'}">${r.conflicts ? '✗ not ' + v : '✓ ' + v}</span></td></tr>`).join('');

    $('#phaseView').innerHTML = `
      <div class="grid-2">
        <div>
          <h3 class="sec">Augmented grammar</h3>
          <div class="card prod-list">${prods}</div>
        </div>
        <div>
          <h3 class="sec">Symbols</h3>
          <div class="card">
            <p class="muted" style="margin:0 0 6px;font-size:12px">Non-terminals</p>
            <div class="chips">${G.allNonterminals.map(n => `<span class="chip nt">${esc(n)}</span>`).join('')}</div>
            <p class="muted" style="margin:12px 0 6px;font-size:12px">Terminals</p>
            <div class="chips">${[...G.terminals, '$'].map(t => `<span class="chip t">${esc(t)}</span>`).join('')}</div>
          </div>
          <h3 class="sec">FIRST and FOLLOW</h3>
          <div class="card" style="padding:0"><table class="plain"><thead><tr><th>Non-terminal</th><th>FIRST</th><th>FOLLOW</th></tr></thead><tbody>${fRows}</tbody></table></div>
        </div>
      </div>
      <h3 class="sec">Which LR classes is this grammar in?</h3>
      <div class="card" style="padding:0">
        <table class="plain"><thead><tr><th>Variant</th><th>Items</th><th>States</th><th>Conflicts</th><th>Verdict</th></tr></thead><tbody>${cls}</tbody></table>
      </div>
      <p class="hierarchy">${REVIEW1 ? 'LR(0) ⊂ SLR(1): every LR(0) grammar is also SLR(1), because SLR(1) only removes reduce entries that LR(0) adds. CLR(1) and LALR(1) are planned for the next phase. Click a row to switch variants.' : 'LR(0) ⊂ SLR(1) ⊂ LALR(1) ⊂ CLR(1): every LR(0) grammar is SLR(1), every SLR(1) grammar is LALR(1), and every LALR(1) grammar is CLR(1). Click a row to switch variants.'}</p>`;

    note(`The grammar is <b>augmented</b> with a new start production <span class="mono">r0: ${prodH(G.prods[0])}</span>, so the parser has exactly one accepting situation. Productions are numbered r0…r${G.prods.length - 1}; these numbers appear in the reduce entries of the table. Press <b>Next step</b> to start building the ${app.variant} item sets.`);
    inspector('GUIDE', `
      <h3>How to use</h3>
      <p>1. Type a grammar or load an example, then pick a variant.</p>
      <p>2. Press <b>Next step</b> (or <kbd>→</kbd>) to watch each phase grow one step at a time. <b>▶</b> plays a phase, and <b>⏭</b> completes it.</p>
      <p>3. Click any state in the diagram, or any cell in the table, to see where it came from.</p>
      <h4>This variant</h4>
      <p><b>${app.variant}</b> uses ${VARIANT_INFO[app.variant].items}.</p>
      <p>${VARIANT_INFO[app.variant].rule}</p>
      <h4>Notation</h4>
      <p><span class="nt">Blue</span> = non-terminal, <span class="t">teal</span> = terminal, <span class="dotc">·</span> = parser position${app.model.canonical.kind === 'lr1' ? ', <span class="lac">, a/b</span> = lookaheads' : ''}.</p>`);
  }

  /* ------------------------------------------------------------------ *
   *  Automaton graph (shared by the item-set and merge phases)
   * ------------------------------------------------------------------ */
  function getLayout(key) {
    const ck = key + '|' + app.showClosure;
    if (!app.layouts[ck]) {
      const auto = autoOf(key), withLa = withLaOf(auto);
      const nodes = auto.states.map(st => ({
        id: st.id,
        title: 'I' + st.name,
        lines: st.items.filter(it => it.kernel || app.showClosure).map(it => ({ kernel: !!it.kernel, segs: itemSegs(it, withLa) })),
      }));
      app.layouts[ck] = GR.layout(nodes, auto.transitions);
    }
    return app.layouts[ck];
  }
  function graphTools(extraLegend) {
    return `<div class="graph-tools">
      <div class="group">
        <button class="btn icon small" type="button" data-zoom="-1" title="Zoom out" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
        <span class="counter" style="min-width:42px;text-align:center">${Math.round(app.zoom * 100)}%</span>
        <button class="btn icon small" type="button" data-zoom="1" title="Zoom in" aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg></button>
        <button class="btn small" type="button" data-zoom="fit">Fit</button>
        <label class="check"><input type="checkbox" id="chkClosure" ${app.showClosure ? 'checked' : ''}> show closure items</label>
      </div>
      <div class="legend"><span><i class="cur"></i>being expanded</span><span><i class="pen"></i>new, not expanded yet</span>${extraLegend || ''}</div>
    </div>`;
  }
  function graphHTML(key, view) {
    return `<div class="graph-wrap" data-keep-scroll="graph-${key}" data-graph="${key}">${GR.render(getLayout(key), view, app.zoom)}</div>`;
  }
  function revealNodes(key, ids) {
    const wrap = document.querySelector(`.graph-wrap[data-graph="${key}"]`);
    if (!wrap || !ids.length) return;
    const L = getLayout(key), z = app.zoom;
    const bs = ids.map(id => L.boxes.get(id)).filter(Boolean);
    let x0 = Math.min(...bs.map(b => b.x)) * z, x1 = Math.max(...bs.map(b => b.x + b.w)) * z;
    let y0 = Math.min(...bs.map(b => b.y)) * z, y1 = Math.max(...bs.map(b => b.y + b.h)) * z;
    if (x1 - x0 > wrap.clientWidth) { x0 = bs[0].x * z; x1 = (bs[0].x + bs[0].w) * z; }
    if (y1 - y0 > wrap.clientHeight) { y0 = bs[0].y * z; y1 = (bs[0].y + bs[0].h) * z; }
    if (x0 < wrap.scrollLeft || x1 > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = Math.max(0, (x0 + x1) / 2 - wrap.clientWidth / 2);
    if (y0 < wrap.scrollTop || y1 > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = Math.max(0, (y0 + y1) / 2 - wrap.clientHeight / 2);
  }

  /* ------------------------------------------------------------------ *
   *  Phase 2: canonical collection, one state expanded per step
   * ------------------------------------------------------------------ */
  function itemsView(k) {
    const auto = app.model.canonical;
    const visible = new Set([0]), expanded = new Set();
    for (let i = 0; i < k; i++) { expanded.add(i); auto.expansions[i].gotos.forEach(x => visible.add(x.to)); }
    const exp = k > 0 ? auto.expansions[k - 1] : null;
    return {
      visible, expanded,
      current: k === 0 ? 0 : k - 1,
      freshFrom: k === 0 ? -1 : k - 1,
      freshNodes: new Set(k === 0 ? [0] : exp.gotos.filter(x => x.isNew).map(x => x.to)),
    };
  }

  function renderItems() {
    const m = app.model, auto = m.canonical, k = app.step.items, max = maxStep('items');
    const view = itemsView(k);
    view.selected = app.sel && app.sel.type === 'state' && app.sel.auto === 'canonical' ? app.sel.id : null;
    if (k === max && !m.lalr) view.marked = new Set(m.table.conflicts.map(c => c.state));
    const withLa = withLaOf(auto);
    const startItem = itemH({ p: 0, dot: 0, la: new Set(['$']) }, withLa);

    const log = [`<div class="log-row${k === 0 ? ' current' : ''}"><span class="when">start</span><div>I0 = CLOSURE({ ${startItem} }) — ${auto.states[0].items.length} items</div></div>`];
    auto.expansions.forEach((ex, i) => {
      const cls = i + 1 === k ? ' current' : i + 1 > k ? ' future' : '';
      const chips = ex.gotos.length
        ? ex.gotos.map(x => `<span class="goto-chip" data-sel-state="${x.to}" data-auto="canonical">GOTO(I${i}, ${esc(x.symbol)}) = I${x.to} ${x.isNew ? '<span class="new">new</span>' : '<span class="old">existing</span>'}</span>`).join('')
        : '<span class="muted">no symbol after a dot: no transitions</span>';
      log.push(`<div class="log-row${cls}"><span class="when">step ${i + 1}</span><div>Expand <button class="link" data-sel-state="${i}" data-auto="canonical">I${i}</button><br>${chips}</div></div>`);
    });

    $('#phaseView').innerHTML = prodStrip() +
      graphTools(k === max && view.marked && view.marked.size ? '<span><i class="mk"></i>state with a conflict</span>' : '') +
      graphHTML('canonical', view) +
      `<h3 class="sec" style="margin-top:16px">Construction log</h3><div class="log" data-keep-scroll="log">${log.join('')}</div>`;

    // Step note.
    if (k === 0) {
      note(`Start from the augmented item <span class="mono">${startItem}</span> and take its <b>closure</b>: for every non-terminal B right after a dot, add B's productions with the dot at the start${withLa ? ' (lookaheads from FIRST(β a))' : ''}. This is the initial state <b>I0</b>.`);
    } else {
      const ex = auto.expansions[k - 1];
      const fresh = ex.gotos.filter(x => x.isNew), old = ex.gotos.filter(x => !x.isNew);
      let s = `<b>Step ${k}: expand I${ex.state}.</b> `;
      if (!ex.gotos.length) s += `I${ex.state} has no symbol after a dot (it only holds complete items), so it has no outgoing transitions.`;
      else {
        s += `For each symbol X after a dot, compute GOTO(I${ex.state}, X): move the dot over X, then take the closure. `;
        if (fresh.length) s += `New state${fresh.length > 1 ? 's' : ''}: ${fresh.map(x => `<b>I${x.to}</b> (on <span class="mono">${esc(x.symbol)}</span>)`).join(', ')}. `;
        if (old.length) s += `Already known: ${old.map(x => `<span class="mono">${esc(x.symbol)}</span> → I${x.to}`).join(', ')}.`;
      }
      if (k === max) s += `<br><b>Collection complete:</b> ${auto.states.length} states, ${auto.transitions.length} transitions.${m.lalr ? ' Next, LALR(1) merges states that have the same core.' : ''}`;
      note(s, k === max ? 'good' : '');
    }

    const focus = app.sel && app.sel.type === 'state' && app.sel.auto === 'canonical' ? app.sel.id : view.current;
    stateInspector('canonical', focus, k);
    return changed => {
      const log = document.querySelector('.log'), cur = log && log.querySelector('.log-row.current');
      if (changed && cur) log.scrollTop = cur.offsetTop - log.clientHeight + cur.offsetHeight + 8;
      if (changed) revealNodes('canonical', [view.current, ...view.freshNodes]);
    };
  }

  // Explains how a state was derived: GOTO kernel + closure items with reasons.
  function stateInspector(key, id, upToStep) {
    const m = app.model, auto = autoOf(key), st = auto.states[id], withLa = withLaOf(auto);
    if (!st) { inspector('', '<div class="empty">Select a state.</div>'); return; }
    const G = g();
    const kernel = st.items.filter(it => it.kernel), clos = st.items.filter(it => !it.kernel);
    let h = `<h3>State I${esc(st.name)}</h3><p>${st.items.length} item${st.items.length === 1 ? '' : 's'}: ${kernel.length} kernel, ${clos.length} added by closure.</p>`;

    if (key === 'lalr') {
      h += `<p>Merged from CLR(1) states ${st.members.map(x => 'I' + x).join(' + ')}, which have the same core. Its lookaheads are the union of theirs.</p>`;
    }
    h += '<h4>How it was derived</h4>';
    if (!st.from) {
      h += `<div class="formula">I0 = CLOSURE({ ${itemH(st.items[0], withLa)} })</div>`;
    } else {
      const fromName = sname(auto, st.from.state);
      h += `<div class="formula">I${esc(st.name)} = GOTO(${fromName}, ${sym(st.from.symbol)})</div>`;
      h += `<p>Take the items of ${fromName} with ${sym(st.from.symbol)} right after the dot, and move the dot past it. These are the <b>kernel</b> items:</p>`;
      // Source items come from the canonical collection.
      const canonState = key === 'lalr' ? m.canonical.states[st.members[0]] : st;
      const canonFrom = canonState.from && m.canonical.states[canonState.from.state];
      kernel.forEach(it => {
        h += `<div class="item-line kernel">${itemH(it, withLa)}</div>`;
        const ci = canonState.items.find(x => x.p === it.p && x.dot === it.dot);
        if (canonFrom && ci && ci.src !== undefined) h += `<div class="why">from ${itemH(canonFrom.items[ci.src], false)} in ${fromName}</div>`;
      });
    }
    if (clos.length) {
      h += `<p>Then <b>CLOSURE</b> adds the productions of every non-terminal that follows a dot:</p>`;
      clos.forEach(it => {
        const B = G.prods[it.p].lhs;
        const parents = st.items.filter(x => G.prods[x.p].rhs[x.dot] === B);
        h += `<div class="item-line">${itemH(it, withLa)}</div><div class="why">`;
        h += parents.map(par => {
          const beta = G.prods[par.p].rhs.slice(par.dot + 1);
          let s = `${sym(B)} follows the dot in ${itemH(par, false)}`;
          if (withLa) {
            const la = m.ff.firstOfSeq(beta, par.la).set;
            s += `; lookahead = FIRST(${beta.map(sym).join(' ')}${beta.length ? ' ' : ''}<span class="lac">${laList(par.la).map(esc).join('/')}</span>) = ${setH(laList(la))}`;
          }
          return s;
        }).join('<br>');
        h += '</div>';
      });
    }
    const outs = auto.transitions.filter(t => t.from === id);
    const known = from => key !== 'canonical' || upToStep === undefined || from < upToStep;
    const ins = auto.transitions.filter(t => t.to === id && known(t.from) && !(st.from && t.from === st.from.state && t.symbol === st.from.symbol));
    const expandedYet = known(id);
    h += '<h4>Transitions out</h4>';
    h += !expandedYet ? '<p class="muted">Not expanded yet.</p>'
      : outs.length ? outs.map(t => `<div class="item-line">on ${sym(t.symbol)} → <button class="link" data-sel-state="${t.to}" data-auto="${key}">${sname(auto, t.to)}</button></div>`).join('')
      : '<p class="muted">None. Every item is complete, so this state only reduces.</p>';
    if (ins.length) h += '<h4>Also reached from</h4>' + ins.map(t => `<div class="item-line"><button class="link" data-sel-state="${t.from}" data-auto="${key}">${sname(auto, t.from)}</button> on ${sym(t.symbol)}</div>`).join('');

    const confl = (key === tableKey()) ? m.table.conflicts.filter(c => c.state === id) : [];
    if (confl.length) h += `<h4>Conflicts in this state (${app.variant})</h4>` + confl.map(c => `<div class="conflict-item" data-sel-cell="${c.state}|${esc(c.symbol)}"><span class="ct">${c.types.join(' + ')}</span>on ${sym(c.symbol)}: ${[...new Set(c.entries.map(e => e.text))].map(esc).join(' / ')}</div>`).join('');
    inspector('I' + st.name, h);
  }

  /* ------------------------------------------------------------------ *
   *  Phase 3 (LALR only): merge same-core states
   * ------------------------------------------------------------------ */
  function renderMerge() {
    const m = app.model, L = m.lalr, C = m.canonical, k = app.step.merge, max = maxStep('merge');
    const conflictStates = new Set(m.table.conflicts.map(c => c.state));
    const cards = L.merges.map((mg, i) => {
      const st = L.states[mg.merged];
      const status = i < k ? (conflictStates.has(mg.merged) ? 'bad' : 'done') : 'wait';
      const cls = i >= k ? ' pending' : i === k - 1 ? ' current' : '';
      const rows = st.items.map(it => {
        const cells = mg.members.map(mm => {
          const ci = C.states[mm].items.find(x => x.p === it.p && x.dot === it.dot);
          return `<td>${laList(ci.la).map(esc).join(' / ')}</td>`;
        }).join('');
        return `<tr><td>${itemH(it, false)}</td>${cells}<td class="u">${laList(it.la).map(esc).join(' / ')}</td></tr>`;
      }).join('');
      return `<div class="merge-card${cls}${status === 'bad' ? ' bad' : ''}">
        <div class="mh"><span>${mg.members.map(x => `<button class="link" data-sel-state="${x}" data-auto="canonical">I${x}</button>`).join(' + ')}<span class="arrow">→</span><button class="link" data-sel-state="${mg.merged}" data-auto="lalr">I${esc(st.name)}</button></span>
        <span class="status-pill ${status}">${status === 'wait' ? 'same core: waiting' : status === 'bad' ? '⚠ merged, conflict' : '✓ merged'}</span></div>
        <div class="mt"><table><thead><tr><th>Core item</th>${mg.members.map(x => `<th>Lookahead in I${x}</th>`).join('')}<th>Merged lookahead</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>`;
    }).join('');
    const unchanged = L.states.filter(s => s.members.length === 1);
    const done = k >= max;

    $('#phaseView').innerHTML = `${prodStrip()}
      <div class="card" style="margin-bottom:12px">
        <b>CLR(1): ${C.states.length} states → LALR(1): ${L.states.length} states.</b>
        <span class="muted">${L.merges.length} group${L.merges.length === 1 ? '' : 's'} of states share a core. Unchanged: ${unchanged.map(s => 'I' + s.name).join(', ') || 'none'}.</span>
      </div>
      ${cards || '<div class="empty">No two CLR(1) states have the same core, so the LALR(1) automaton is the same as CLR(1).</div>'}
      ${done ? `<h3 class="sec" style="margin-top:18px">LALR(1) automaton after merging</h3>${graphTools(conflictStates.size ? '<span><i class="mk"></i>state with a conflict</span>' : '')}${graphHTML('lalr', {
        visible: new Set(L.states.map(s => s.id)), expanded: new Set(L.states.map(s => s.id)), current: -1, freshFrom: -1,
        selected: app.sel && app.sel.type === 'state' && app.sel.auto === 'lalr' ? app.sel.id : null, marked: conflictStates,
      })}` : ''}`;

    if (k === 0) {
      note(`LALR(1) starts from the ${C.states.length} CLR(1) states. Two states have the same <b>core</b> when they contain the same LR(0) items and differ only in lookaheads. Each step merges one such group into a single state, taking the <b>union</b> of the lookaheads. ${L.merges.length ? `${L.merges.length} group(s) to merge.` : 'Nothing to merge here.'}`);
      inspector('MERGE', `<h3>Why merge?</h3><p>CLR(1) is precise but can have many states. LALR(1) has as many states as LR(0)/SLR(1) but keeps per-item lookaheads, so it is nearly as powerful as CLR(1). This is what YACC and Bison build.</p><p>Merging never adds shift-reduce conflicts, but it can add <b>reduce-reduce</b> conflicts when the union of lookaheads overlaps.</p>`);
    } else {
      const mg = L.merges[k - 1], st = L.states[mg.merged];
      let s = `<b>Step ${k}:</b> ${mg.members.map(x => 'I' + x).join(' and ')} have the same core, so they become <b>I${esc(st.name)}</b>. Lookaheads are united item by item. Transitions into either state now go to I${esc(st.name)}.`;
      let tone = '';
      if (conflictStates.has(mg.merged)) {
        const cs = m.table.conflicts.filter(c => c.state === mg.merged);
        s += `<br>⚠ After merging, I${esc(st.name)} has a <b>${cs[0].types.join(' + ')}</b> conflict on ${cs.map(c => sym(c.symbol)).join(', ')}. The CLR states had no conflict, but the united lookaheads overlap. This grammar is <b>not LALR(1)</b>.`;
        tone = 'bad';
      }
      if (done) s += `<br><b>Merging complete:</b> ${L.states.length} LALR(1) states.`;
      note(s, tone || (done ? 'good' : ''));
      if (!(app.sel && app.sel.type === 'state')) stateInspector('lalr', mg.merged);
    }
    if (app.sel && app.sel.type === 'state') stateInspector(app.sel.auto, app.sel.id);
    return changed => {
      const cur = document.querySelector('.merge-card.current');
      if (changed && cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
  }

  /* ------------------------------------------------------------------ *
   *  Phase 4: ACTION / GOTO table, one entry per step
   * ------------------------------------------------------------------ */
  function conflictType(list) {
    const shifts = list.some(e => e.kind === 'shift');
    const reduces = new Set(list.filter(e => e.kind === 'reduce').map(e => e.prod)).size;
    const t = [];
    if (shifts && reduces) t.push('shift-reduce');
    if (reduces > 1) t.push('reduce-reduce');
    if (!t.length) t.push('accept-reduce');
    return t;
  }

  function explainEntry(e) {
    const m = app.model, auto = m.automaton, G = g(), withLa = withLaOf(auto);
    const st = auto.states[e.state], sn = sname(auto, e.state);
    const items = e.items.map(i => `<span class="mono">${itemH(st.items[i], withLa)}</span>`).join(' and ');
    const where = e.kind === 'goto' ? `GOTO[${sn}, ${sym(e.symbol)}]` : `ACTION[${sn}, ${sym(e.symbol)}]`;
    switch (e.kind) {
      case 'shift': return `${where} = <b>${esc(e.text)}</b>: <b>shift</b>, because ${sn} contains ${items} with ${sym(e.symbol)} after the dot, and GOTO(${sn}, ${sym(e.symbol)}) = ${sname(auto, e.to)}.`;
      case 'accept': return `${where} = <b>acc</b>: ${sn} contains the complete augmented item ${items}, so on end of input the parser <b>accepts</b>.`;
      case 'goto': return `${where} = <b>${esc(e.text)}</b>, because the automaton has a transition from ${sn} on ${sym(e.symbol)} to ${sname(auto, e.to)}. It is used right after a reduction to ${sym(e.symbol)}.`;
      default: {
        const p = G.prods[e.prod];
        let why;
        if (e.basis === 'all') why = `LR(0) has no lookahead, so the reduce goes in <b>every</b> ACTION column`;
        else if (e.basis === 'follow') why = `${sym(e.symbol)} ∈ FOLLOW(${sym(p.lhs)}) = ${setH(laList(m.ff.follow[p.lhs]))}`;
        else why = `${sym(e.symbol)} is a lookahead of this item`;
        return `${where} = <b>${esc(e.text)}</b>: <b>reduce</b> by r${e.prod} (${prodH(p)}), because ${items} is complete and ${why}.`;
      }
    }
  }

  function renderTable() {
    const m = app.model, T = m.table, auto = m.automaton, k = app.step.table, max = maxStep('table');
    const visible = T.entries.slice(0, k);
    const cur = k > 0 ? T.entries[k - 1] : null;
    const cells = new Map();
    visible.forEach(e => { const key = e.state + '|' + e.symbol; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(e); });
    const selCell = app.sel && app.sel.type === 'cell' ? app.sel.key : null;

    const head1 = `<tr><th class="state" rowspan="2">State</th><th colspan="${T.terms.length}">ACTION</th>${T.nts.length ? `<th class="grp-goto" colspan="${T.nts.length}">GOTO</th>` : ''}</tr>`;
    const head2 = `<tr>${T.terms.map(t => `<th>${sym(t)}</th>`).join('')}${T.nts.map((n, i) => `<th class="${i === 0 ? 'grp-goto' : ''}">${sym(n)}</th>`).join('')}</tr>`;
    const rows = auto.states.map(st => {
      const tds = [...T.terms, ...T.nts].map((s, ci) => {
        const key = st.id + '|' + s, list = cells.get(key) || [];
        const texts = [...new Map(list.map(e => [e.text, e])).values()];
        const cls = [];
        if (texts.length > 1) cls.push('conflict');
        if (cur && cur.state === st.id && cur.symbol === s) cls.push('fresh');
        if (selCell === key) cls.push('selected');
        if (ci === T.terms.length) cls.push('first-goto');
        const label = texts.length > 1 ? ` aria-label="conflict: ${texts.map(e => e.text).join(' and ')}"` : '';
        return `<td class="${cls.join(' ')}" data-sel-cell="${esc(key)}"${label}>${texts.map(e => `<span class="a ${e.kind}" title="${e.kind === 'reduce' ? esc(g().prods[e.prod].lhs + ' → ' + (g().prods[e.prod].rhs.join(' ') || 'ε')) : ''}">${esc(e.text)}</span>`).join('')}</td>`;
      }).join('');
      return `<tr class="${cur && cur.state === st.id ? 'row-current' : ''}"><th class="state" data-sel-state="${st.id}" data-auto="${tableKey()}">I${esc(st.name)}</th>${tds}</tr>`;
    }).join('');

    const shownConflicts = T.conflicts.filter(c => {
      const list = cells.get(c.state + '|' + c.symbol) || [];
      return new Set(list.map(e => e.text)).size > 1;
    });
    const done = k >= max;
    const nS = shownConflicts.filter(c => c.types.includes('shift-reduce')).length;
    const nR = shownConflicts.filter(c => c.types.includes('reduce-reduce')).length;
    let verdict;
    if (!done) verdict = `<div class="verdict pending"><span class="big">…</span><div><b>Filling the table: ${k} of ${max} entries</b><span>${shownConflicts.length ? `${shownConflicts.length} conflicting cell(s) so far.` : 'No conflicts so far.'}</span></div></div>`;
    else if (!T.conflicts.length) verdict = `<div class="verdict ok"><span class="big">✓</span><div><b>No conflicts. The grammar is ${app.variant}.</b><span>Every cell has at most one action, so the parser is deterministic.</span></div></div>`;
    else verdict = `<div class="verdict bad" role="alert"><span class="big">✗</span><div><b>${T.conflicts.length} conflict${T.conflicts.length > 1 ? 's' : ''} (${nS} shift-reduce, ${nR} reduce-reduce). The grammar is NOT ${app.variant}.</b><span>Conflicting cells are marked with a dashed border, stripes and ⚠. ${suggestion()}</span></div></div>`;

    const clist = shownConflicts.map(c => {
      const list = cells.get(c.state + '|' + c.symbol);
      const uniq = [...new Map(list.map(e => [e.text, e])).values()];
      return `<div class="conflict-item" data-sel-cell="${c.state}|${esc(c.symbol)}"><span class="ct">${conflictType(list).join(' + ')} conflict</span><b class="mono">ACTION[${sname(auto, c.state)}, ${esc(c.symbol)}] = ${uniq.map(e => esc(e.text)).join(' / ')}</b>
        <p>${uniq.map(explainEntry).join('<br>')}</p><p><b>The grammar is not ${app.variant}.</b></p></div>`;
    }).join('');

    $('#phaseView').innerHTML = `
      ${prodStrip()}${followStrip()}
      <div class="table-wrap" data-keep-scroll="table"><table class="lr"><thead>${head1}${head2}</thead><tbody>${rows}</tbody></table></div>
      ${verdict}
      ${clist ? `<div class="conflict-list">${clist}</div>` : ''}`;

    if (!cur) {
      note(`The table has one row per state. <b>ACTION</b> columns are terminals and $ (shift <span class="mono">sN</span>, reduce <span class="mono">rN</span>, accept). <b>GOTO</b> columns are non-terminals. ${VARIANT_INFO[app.variant].rule} Press <b>Next step</b> to fill one entry at a time.`);
    } else {
      let s = `<b>Entry ${k}:</b> ${explainEntry(cur)}`;
      let tone = '';
      const list = cells.get(cur.state + '|' + cur.symbol);
      if (new Set(list.map(e => e.text)).size > 1) {
        const others = [...new Set(list.filter(e => e.text !== cur.text).map(e => e.text))];
        s += `<br><b>⚠ ${conflictType(list).join(' + ')} conflict!</b> This cell already holds <b>${others.map(esc).join(', ')}</b>, so the parser cannot decide what to do. <b>The grammar is not ${app.variant}.</b>`;
        tone = 'bad';
      }
      if (done) s += `<br><b>Table complete.</b> ${T.conflicts.length ? `${T.conflicts.length} conflict(s): the grammar is not ${app.variant}.` : `No conflicts: the grammar is ${app.variant}.`}`;
      note(s, tone || (done && !T.conflicts.length ? 'good' : done ? 'bad' : ''));
    }

    if (app.sel && app.sel.type === 'state') stateInspector(app.sel.auto, app.sel.id);
    else if (selCell) cellInspector(selCell, cells);
    else if (cur) cellInspector(cur.state + '|' + cur.symbol, cells, cur);
    else inspector('RULES', `<h3>${app.variant} table rules</h3>
      <p><b>Shift:</b> if [A → α · a β] is in I<sub>i</sub> and GOTO(I<sub>i</sub>, a) = I<sub>j</sub>, then ACTION[i, a] = s<sub>j</sub>.</p>
      <p><b>Reduce:</b> ${VARIANT_INFO[app.variant].rule}</p>
      <p><b>Accept:</b> if S' → S · is in I<sub>i</sub>, then ACTION[i, $] = acc.</p>
      <p><b>Goto:</b> if GOTO(I<sub>i</sub>, A) = I<sub>j</sub>, then GOTO[i, A] = j.</p>
      <p>A cell that receives two different actions is a <b>conflict</b>.</p>`);

    return changed => {
      const wrap = document.querySelector('.table-wrap'), cell = wrap && wrap.querySelector('td.fresh');
      if (changed && cell) {
        const r = cell.getBoundingClientRect(), w = wrap.getBoundingClientRect();
        if (r.bottom > w.bottom || r.top < w.top + 62) wrap.scrollTop += r.top - w.top - w.height / 2;
        if (r.right > w.right || r.left < w.left + 62) wrap.scrollLeft += r.left - w.left - w.width / 2;
      }
    };
  }

  function suggestion() {
    const order = ['LR(0)', 'SLR(1)', 'LALR(1)', 'CLR(1)'].filter(v => SHOWN_VARIANTS.includes(v));
    const better = order.slice(order.indexOf(app.variant) + 1).find(v => app.classes[v] && !app.classes[v].conflicts);
    return better ? `This grammar is ${better}; switch variants to compare.` : REVIEW1 ? 'The grammar needs a stronger LR variant (or is ambiguous).' : 'No LR(1) variant handles it. The grammar is probably ambiguous.';
  }

  function cellInspector(key, cells, cur) {
    const m = app.model, auto = m.automaton, withLa = withLaOf(auto);
    const [sid, symbol] = [+key.split('|')[0], key.slice(key.indexOf('|') + 1)];
    const st = auto.states[sid], sn = sname(auto, sid);
    const list = cells.get(key) || [];
    const isGoto = isNT(symbol);
    let h = `<h3>${isGoto ? 'GOTO' : 'ACTION'}[${sn}, ${esc(symbol)}]</h3>`;
    if (!list.length) h += '<p class="muted">Empty: this combination is a syntax error (or not filled yet).</p>';
    const uniq = [...new Map(list.map(e => [e.text, e])).values()];
    if (uniq.length > 1) h += `<div class="conflict-item"><span class="ct">${conflictType(list).join(' + ')} conflict</span> ${uniq.map(e => esc(e.text)).join(' vs ')}<p>Two actions compete for one cell, so the grammar is <b>not ${app.variant}</b>.</p></div>`;
    h += uniq.map(e => `<p class="entry-why"><span class="a ${e.kind}">${esc(e.text)}</span> ${explainEntry(e)}</p>`).join('');
    const hl = new Set(list.flatMap(e => e.items));
    h += `<h4>Items of <button class="link" data-sel-state="${sid}" data-auto="${tableKey()}">${sn}</button></h4>`;
    h += st.items.map((it, i) => `<div class="item-line${hl.has(i) ? ' hl' : ''}">${itemH(it, withLa)}</div>`).join('');
    inspector(sn + ' · ' + symbol, h);
  }

  /* ------------------------------------------------------------------ *
   *  Phase 5: parse the test string
   * ------------------------------------------------------------------ */
  function stackH(snap) {
    return '<span class="stk">' + snap.map(e => (e.sym !== null ? `<span class="sy">${sym(e.sym)}</span>` : '') + `<span class="st">${esc(e.state)}</span>`).join('') + '</span>';
  }
  function actionH(r) {
    const a = r.action, G = g();
    let s;
    if (a.kind === 'shift') s = `<span class="act shift"><b>Shift</b> ${sym(a.symbol)}<span class="sub">push ${esc(a.symbol)} and state ${esc(a.to)}</span>`;
    else if (a.kind === 'reduce') {
      const p = G.prods[a.prod];
      s = `<span class="act reduce"><b>Reduce</b> by r${a.prod}: ${prodH(p)}<span class="sub">${a.pop === 0 ? 'ε-production: pop nothing' : `pop ${a.pop} symbol${a.pop === 1 ? '' : 's'}`}, GOTO[I${esc(a.gotoFrom)}, ${esc(p.lhs)}] = ${esc(a.gotoTo)} → stack ${stackH(a.after)}</span>`;
    } else if (a.kind === 'accept') s = `<span class="act accept"><b>Accept</b><span class="sub">ACTION[I${esc(r.stack[r.stack.length - 1].state)}, $] = acc</span>`;
    else {
      const top = r.stack[r.stack.length - 1].state;
      s = `<span class="act error"><b>Error</b><span class="sub">${a.unknown ? `"${esc(r.lookahead)}" is not a terminal of this grammar. ` : ''}ACTION[I${esc(top)}, ${esc(r.lookahead)}] is empty. Expected: ${a.expected.length ? a.expected.map(esc).join(', ') : 'nothing'}</span>`;
    }
    if (r.conflict) s += `<span class="cf">⚠ cell holds ${r.conflict.map(esc).join(' / ')}: conflict resolved by choosing ${a.kind === 'shift' ? 'shift' : 'the earliest production'}</span>`;
    return s + '</span>';
  }

  function renderParse() {
    const m = app.model, P = app.parse, k = app.step.parse, max = maxStep('parse');
    const done = k >= max;
    const curRow = k > 0 ? P.rows[k - 1] : null;
    const pos = curRow ? curRow.pos : 0;
    const failPos = done && !P.result.accepted ? P.result.pos : -1;
    const toks = P.tokens.map((t, i) => {
      const cls = i === failPos ? 'fail' : i < pos ? 'done' : i === pos ? 'now' : '';
      return `<span class="tok ${cls}">${esc(t)}</span>`;
    }).join('');
    const rows = P.rows.slice(0, k).map((r, i) => {
      const cls = r.action.kind === 'error' ? 'err' : r.action.kind === 'accept' ? 'acc' : i === k - 1 ? 'current' : '';
      const inp = r.input.map((t, j) => j === 0 ? `<span class="first">${esc(t)}</span>` : esc(t)).join(' ');
      return `<tr class="${cls}"><td class="n">${i + 1}</td><td>${stackH(r.stack)}</td><td class="inp">${inp}</td><td>${actionH(r)}</td></tr>`;
    }).join('');

    let result = '';
    if (done) {
      if (P.result.accepted) result = `<div class="result ok"><span class="big">ACCEPT</span><div><b>The string is in the language.</b><p>${P.tokens.length - 1} token(s) parsed in ${P.rows.length} steps by the ${app.variant} parser.</p></div></div>`;
      else {
        const r = P.result;
        const why = r.limit ? 'The step limit was reached.'
          : r.unknown ? `Token ${r.pos + 1}, "${esc(r.token)}", is not a terminal of this grammar.`
          : `Failure at token ${r.pos + 1} ("${esc(r.token)}") in state I${esc(m.automaton.states[r.state].name)}: no ACTION entry. Expected one of: ${r.expected.map(esc).join(', ') || 'nothing'}.`;
        result = `<div class="result bad" role="alert"><span class="big">REJECT</span><div><b>The string is not in the language.</b><p>${why}</p></div></div>`;
      }
    }
    const warn = m.table.conflicts.length ? `<div class="banner-warn">⚠ This ${app.variant} table has ${m.table.conflicts.length} conflict(s), so the grammar is not ${app.variant}. To still show a trace, conflicts are resolved like YACC: prefer <b>shift</b> over reduce, and the <b>earliest production</b> between reduces.</div>` : '';
    const tree = done && P.result.accepted ? `<h3 class="sec" style="margin-top:18px">Parse tree (built from the reductions)</h3><div class="tree-wrap">${GR.renderTree(P.result.tree)}</div>` : '';

    $('#phaseView').innerHTML = `${warn}${prodStrip()}
      <div class="token-bar${failPos >= 0 ? ' has-fail' : ''}"><span class="muted" style="font-size:12px;margin-right:4px">Input</span>${toks}</div>
      <div class="trace" data-keep-scroll="trace"><table class="trace-t"><thead><tr><th>#</th><th>Stack</th><th>Input</th><th>Action</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted" style="font-family:var(--sans)">Press <b>Next step</b> to perform the first action.</td></tr>'}</tbody></table></div>
      ${result}${tree}`;

    // Step note + inspector.
    if (!curRow) {
      note(`Initial configuration: the stack holds state <b>0</b>, and the input is <span class="mono">${P.tokens.map(esc).join(' ')}</span>. At every step the parser reads ACTION[top state, next input symbol] and shifts, reduces, accepts or reports an error.`);
      inspector('START', `<h3>Configuration</h3><h4>Stack (top at the bottom)</h4><div class="stack-viz"><div class="cell"><span>state 0</span><span class="s">bottom</span></div></div><dl class="kv"><dt>Next input</dt><dd>${esc(P.tokens[0])}</dd></dl>`);
    } else {
      const a = curRow.action, top = curRow.stack[curRow.stack.length - 1].state;
      const lookup = `ACTION[I${esc(top)}, ${esc(curRow.lookahead)}]`;
      let s = `<b>Step ${k}:</b> top state <b>${esc(top)}</b>, next input <b class="mono">${esc(curRow.lookahead)}</b> → ${lookup} = `;
      let tone = '';
      if (a.kind === 'shift') s += `<b>s${esc(a.to)}</b>: shift ${sym(a.symbol)} and go to state ${esc(a.to)}.`;
      else if (a.kind === 'reduce') {
        const p = g().prods[a.prod];
        s += `<b>r${a.prod}</b>: reduce by ${prodH(p)}. ${a.pop === 0 ? `This is an ε-production, so nothing is popped; the top state stays ${esc(a.gotoFrom)}.` : `Pop ${a.pop} symbol(s) with their states, exposing state ${esc(a.gotoFrom)}.`} Then GOTO[${esc(a.gotoFrom)}, ${sym(p.lhs)}] = ${esc(a.gotoTo)}, so push ${sym(p.lhs)} and ${esc(a.gotoTo)}. Stack is now ${stackH(a.after)}.`;
      } else if (a.kind === 'accept') { s += '<b>acc</b>: the whole input reduced to the start symbol. <b>ACCEPT</b>.'; tone = 'good'; }
      else { s += `<b>empty</b>: syntax error. <b>REJECT</b>.${a.expected.length ? ` Expected one of: ${a.expected.map(esc).join(', ')}.` : ''}`; tone = 'bad'; }
      note(s, tone);
      const after = a.kind === 'reduce' ? a.after : curRow.stack;
      const viz = (a.kind === 'shift' ? [...curRow.stack, { state: a.to, sym: a.symbol }] : after)
        .map((e, i) => `<div class="cell"><span>${e.sym !== null ? esc(e.sym) + ' · ' : ''}state ${esc(e.state)}</span><span class="s">${i === 0 ? 'bottom' : ''}</span></div>`).join('');
      inspector('STEP ' + k, `<h3>${a.kind === 'error' ? 'Error' : a.kind[0].toUpperCase() + a.kind.slice(1)}</h3>
        <dl class="kv"><dt>Lookup</dt><dd>${lookup}</dd><dt>Next input</dt><dd>${esc(curRow.lookahead)}</dd></dl>
        <h4>Stack after this step (top at the bottom)</h4>${a.kind === 'error' ? '<p class="muted">Unchanged: parsing stops.</p>' : `<div class="stack-viz">${viz}</div>`}
        ${a.kind === 'reduce' ? `<h4>Production used</h4><div class="formula">r${a.prod}: ${prodH(g().prods[a.prod])}</div>` : ''}`);
    }
    return changed => {
      const t = document.querySelector('.trace');
      if (changed && t) t.scrollTop = t.scrollHeight;
    };
  }

  /* ------------------------------------------------------------------ *
   *  Events
   * ------------------------------------------------------------------ */
  function loadExample(id) {
    const ex = ALL_EXAMPLES.find(e => e.id === id);
    if (!ex) return;
    $('#grammarInput').value = ex.grammar;
    $('#inputString').value = ex.input;
    $('#exampleNote').textContent = ex.note;
    $('#exampleSelect').value = id;
    setVariant(ex.variant, false);
  }

  function setTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#themeToggle').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    try { localStorage.setItem('lrviz-theme', dark ? 'dark' : 'light'); } catch (e) { /* storage unavailable */ }
  }

  function setZoom(z) {
    const wrap = document.querySelector('.graph-wrap');
    const cx = wrap ? (wrap.scrollLeft + wrap.clientWidth / 2) / app.zoom : 0;
    const cy = wrap ? (wrap.scrollTop + wrap.clientHeight / 2) / app.zoom : 0;
    app.zoom = Math.min(2, Math.max(0.3, Math.round(z * 100) / 100));
    renderAll(false);
    const w2 = document.querySelector('.graph-wrap');
    if (w2) { w2.scrollLeft = cx * app.zoom - w2.clientWidth / 2; w2.scrollTop = cy * app.zoom - w2.clientHeight / 2; }
  }

  function init() {
    $('#exampleSelect').innerHTML = EXAMPLES.map(gr => `<optgroup label="${esc(gr.group)}">${gr.items.map(e => `<option value="${e.id}">${esc(e.label)}</option>`).join('')}</optgroup>`).join('');
    $('#exampleSelect').addEventListener('change', e => loadExample(e.target.value));
    $('#buildBtn').addEventListener('click', () => build(false));
    $('#grammarInput').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) build(false); });
    $('#grammarInput').addEventListener('input', () => { $('#exampleNote').textContent = ''; });
    document.querySelectorAll('#variantSeg button').forEach(b => b.addEventListener('click', () => setVariant(b.dataset.variant)));

    let inputTimer = null;
    $('#inputString').addEventListener('input', () => {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => { if (!app.model) return; stopPlay(); runParse(); app.step.parse = 0; if (app.phase === 'parse') renderAll(); }, 250);
    });
    $('#inputString').addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !app.model) return;
      stopPlay(); runParse(); app.step.parse = 0; app.phase = 'parse'; app.sel = null; renderAll(true);
    });

    $('#btnNext').addEventListener('click', () => { stopPlay(); next(); });
    $('#btnPrev').addEventListener('click', () => { stopPlay(); prev(); });
    $('#btnEnd').addEventListener('click', toEnd);
    $('#btnReset').addEventListener('click', toStart);
    $('#btnPlay').addEventListener('click', togglePlay);
    $('#themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));

    document.querySelectorAll('.tech').forEach(b => b.addEventListener('click', () => switchTech(b.dataset.tech)));
    document.querySelector('[data-goto-tech]').addEventListener('click', () => switchTech('lr'));

    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if ($('#lrView').hidden) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stopPlay(); prev(); }
    });

    // Delegated clicks inside the workspace and inspector.
    document.addEventListener('click', e => {
      const t = e.target;
      const ph = t.closest('[data-phase]');
      if (ph) { goPhase(ph.dataset.phase); return; }
      const vp = t.closest('[data-variant-pick]');
      if (vp) { setVariant(vp.dataset.variantPick); return; }
      const z = t.closest('[data-zoom]');
      if (z) {
        if (z.dataset.zoom === 'fit') {
          const wrap = document.querySelector('.graph-wrap');
          const L = wrap && getLayout(wrap.dataset.graph);
          if (L) setZoom(Math.min(1, (wrap.clientWidth - 4) / L.width, Math.max(0.3, (wrap.clientHeight - 4) / L.height)));
        } else setZoom(app.zoom + 0.1 * +z.dataset.zoom);
        return;
      }
      if (dragMoved) return;
      const node = t.closest('.node[data-state]');
      if (node) {
        const key = node.closest('[data-graph]').dataset.graph;
        selectState(key, +node.dataset.state);
        return;
      }
      const ss = t.closest('[data-sel-state]');
      if (ss) { selectState(ss.dataset.auto, +ss.dataset.selState); return; }
      const sc = t.closest('[data-sel-cell]');
      if (sc && app.model) {
        if (app.phase !== 'table') { app.phase = 'table'; app.step.table = maxStep('table'); }
        app.sel = { type: 'cell', key: sc.dataset.selCell };
        renderAll(false);
      }
    });
    document.addEventListener('keydown', e => {
      const node = e.target.closest && e.target.closest('.node[data-state]');
      if (node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectState(node.closest('[data-graph]').dataset.graph, +node.dataset.state); }
    });
    document.addEventListener('change', e => {
      if (e.target.id === 'chkClosure') { app.showClosure = e.target.checked; renderAll(false); }
    });

    // Drag to pan, ctrl/⌘ + wheel to zoom the automaton.
    let drag = null, dragMoved = false;
    document.addEventListener('pointerdown', e => {
      const wrap = e.target.closest('.graph-wrap');
      dragMoved = false;
      if (!wrap || e.button !== 0) return;
      drag = { wrap, x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop };
    });
    document.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!dragMoved && Math.hypot(dx, dy) < 4) return;
      dragMoved = true;
      drag.wrap.classList.add('dragging');
      drag.wrap.scrollLeft = drag.sl - dx;
      drag.wrap.scrollTop = drag.st - dy;
    });
    document.addEventListener('pointerup', () => { if (drag) drag.wrap.classList.remove('dragging'); drag = null; setTimeout(() => { dragMoved = false; }, 0); });
    $('#phaseView').addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey) || !e.target.closest('.graph-wrap')) return;
      e.preventDefault();
      setZoom(app.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    }, { passive: false });

    setTheme(document.documentElement.dataset.theme === 'dark');
    loadExample('expr');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { app.layouts = {}; if (app.model) renderAll(false); });
  }

  function selectState(key, id) {
    if (!app.model) return;
    if (key === 'lalr' && !app.model.lalr) key = 'canonical';
    app.sel = { type: 'state', auto: key, id };
    renderAll(false);
  }

  function switchTech(tech) {
    document.querySelectorAll('.tech').forEach(b => { const on = b.dataset.tech === tech; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    $('#lrView').hidden = tech !== 'lr';
    $('#opView').hidden = tech !== 'op';
    $('#crumbLeaf').textContent = tech === 'lr' ? 'LR Parsing' : 'Operator Precedence Parsing';
    stopPlay();
  }

  init();
})();
