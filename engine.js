/*
 * engine.js — LR family parser construction engine
 * Project 7: Interactive GUI for Bottom-Up Parsing (LR Family)
 *
 * Pure logic, no DOM. Works in the browser (window.LREngine) and in Node
 * (module.exports) so it can be unit-tested from the command line.
 *
 *   parseGrammar(text)            -> grammar object (augmented)
 *   computeFirstFollow(g)         -> FIRST / FOLLOW / nullable
 *   buildLR0Automaton(g)          -> canonical collection of LR(0) item sets
 *   buildLR1Automaton(g, ff)      -> canonical collection of LR(1) item sets
 *   mergeLALR(g, lr1)             -> LALR(1) automaton (cores merged)
 *   buildTable(g, auto, mode, ff) -> ACTION/GOTO table + per-cell provenance
 *   parseInput(g, auto, table, s) -> shift/reduce trace with ACCEPT/REJECT
 *   build(text, variant)          -> everything above for one variant
 */
(function (root) {
  'use strict';

  const EPS = 'ε';
  const END = '$';
  // ε is often typed as ϵ (lunate epsilon), ɛ (open e) or ∈ (element-of); all mean the empty string.
  const EPS_WORDS = new Set(['ε', 'ϵ', 'ɛ', '∈', 'Є', 'eps', 'epsilon', 'λ', 'lambda']);
  const MAX_STATES = 400;

  /* ------------------------------------------------------------------ *
   *  Grammar input
   * ------------------------------------------------------------------ */

  // `glued` collects the single-character terminals found inside glued chunks
  // (e.g. "a" and "b" in "aSb"); `runs` collects the multi-character runs that
  // could be glued terminals, such as "ab" in "S->aSb|ab".
  function tokenizeBody(body, ntSet, ntByLength, glued, runs) {
    const out = [];
    for (const chunk of body.trim().split(/\s+/).filter(Boolean)) {
      // A chunk that is a whole symbol, or contains no non-terminal, is kept
      // as one token (e.g. "id", "num", "+").
      if (ntSet.has(chunk) || EPS_WORDS.has(chunk) || !ntByLength.some(n => chunk.includes(n))) {
        out.push(chunk);
        if (chunk.length > 1 && !EPS_WORDS.has(chunk) && !ntSet.has(chunk)) runs.add(chunk);
        continue;
      }
      // Otherwise split glued text such as "aAb", "(E)", "E+T", "CC".
      let i = 0, buf = '';
      const flush = () => {
        if (!buf) return;
        out.push(buf);
        if (buf.length === 1) glued.add(buf); else runs.add(buf);
        buf = '';
      };
      while (i < chunk.length) {
        const nt = ntByLength.find(n => chunk.startsWith(n, i));
        if (nt) { flush(); out.push(nt); i += nt.length; continue; }
        const c = chunk[i];
        if (/[A-Za-z0-9_]/.test(c)) { buf += c; i++; continue; }
        flush(); out.push(c); glued.add(c); i++;
      }
      flush();
    }
    return out;
  }

  function parseGrammar(text) {
    const errors = [], warnings = [];
    const raw = [];
    text.split(/\r?\n/).forEach((line, idx) => {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('#')) return;
      const m = t.match(/^(\S+?)\s*(?:->|→|::=)\s*(.*)$/);
      if (m) raw.push({ lhs: m[1], body: m[2], line: idx + 1 });
      else if (t.startsWith('|') && raw.length) raw.push({ lhs: raw[raw.length - 1].lhs, body: t.slice(1), line: idx + 1 });
      else errors.push(`Line ${idx + 1}: cannot read "${t}". Use the form  A -> α  (one production per line).`);
    });

    const nonterminals = [];
    for (const r of raw) {
      if (r.lhs === END || EPS_WORDS.has(r.lhs)) errors.push(`Line ${r.line}: "${r.lhs}" cannot be used as a non-terminal.`);
      else if (!nonterminals.includes(r.lhs)) nonterminals.push(r.lhs);
    }
    if (!raw.length && !errors.length) errors.push('Enter at least one production, e.g.  S -> a S b | ε');
    if (errors.length) return { errors, warnings };

    const ntSet = new Set(nonterminals);
    const ntByLength = [...nonterminals].sort((a, b) => b.length - a.length);
    const start = nonterminals[0];
    let aug = start + "'";
    while (ntSet.has(aug)) aug += "'";

    const glued = new Set(), runs = new Set();
    const bodies = [];
    for (const r of raw) for (const alt of r.body.split('|')) bodies.push({ r, rhs: tokenizeBody(alt, ntSet, ntByLength, glued, runs) });
    // In a glued grammar ("S->aSb|ab"), a run made only of single-character
    // terminals seen elsewhere is split as well ("ab" -> a b). Runs such as "id"
    // stay whole because i and d are not terminals of the grammar.
    const splitRun = t => (runs.has(t) && glued.size && [...t].every(ch => glued.has(ch)) ? [...t] : [t]);

    const prods = [{ id: 0, lhs: aug, rhs: [start] }];
    const seen = new Set();
    const terminals = [];
    for (const { r, rhs: tokens } of bodies) {
      {
        let rhs = tokens.flatMap(splitRun);
        if (rhs.some(s => EPS_WORDS.has(s))) {
          if (rhs.length > 1) warnings.push(`Line ${r.line}: ε mixed with other symbols — ε ignored.`);
          rhs = rhs.filter(s => !EPS_WORDS.has(s));
        }
        if (rhs.includes(END)) { errors.push(`Line ${r.line}: "$" is reserved for end of input.`); continue; }
        const key = r.lhs + ' -> ' + rhs.join(' ');
        if (seen.has(key)) { warnings.push(`Duplicate production ${r.lhs} → ${rhs.join(' ') || EPS} ignored.`); continue; }
        seen.add(key);
        prods.push({ id: prods.length, lhs: r.lhs, rhs });
        for (const s of rhs) if (!ntSet.has(s) && !terminals.includes(s)) terminals.push(s);
      }
    }
    if (errors.length) return { errors, warnings };

    for (const t of terminals) {
      if (/^[A-Z][A-Za-z0-9_']*$/.test(t)) warnings.push(`"${t}" has no productions, so it is treated as a terminal.`);
      if (t.length > 1 && [...t].every(ch => terminals.includes(ch))) warnings.push(`"${t}" is read as one terminal. Write ${[...t].join(' ')} with spaces if you meant ${t.length} separate symbols.`);
    }

    // Reachability from the start symbol.
    const reach = new Set([aug]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of prods) if (reach.has(p.lhs)) for (const s of p.rhs) if (ntSet.has(s) && !reach.has(s)) { reach.add(s); changed = true; }
    }
    for (const n of nonterminals) if (!reach.has(n)) warnings.push(`Non-terminal ${n} is unreachable from ${start}.`);

    // Productivity (can derive a terminal string).
    const productive = new Set();
    changed = true;
    while (changed) {
      changed = false;
      for (const p of prods) if (!productive.has(p.lhs) && p.rhs.every(s => !ntSet.has(s) || productive.has(s))) { productive.add(p.lhs); changed = true; }
    }
    for (const n of nonterminals) if (!productive.has(n)) warnings.push(`Non-terminal ${n} can never derive a terminal string.`);

    const byLhs = {};
    for (const p of prods) (byLhs[p.lhs] = byLhs[p.lhs] || []).push(p.id);

    return {
      errors, warnings, prods, terminals, nonterminals, start, aug, byLhs,
      allNonterminals: [aug, ...nonterminals],
      isNT: s => s === aug || ntSet.has(s),
    };
  }

  /* ------------------------------------------------------------------ *
   *  FIRST / FOLLOW
   * ------------------------------------------------------------------ */

  function computeFirstFollow(g) {
    const first = {}, follow = {};
    const nullable = new Set();
    for (const n of g.allNonterminals) { first[n] = new Set(); follow[n] = new Set(); }

    let changed = true;
    while (changed) {
      changed = false;
      for (const p of g.prods) {
        const before = first[p.lhs].size;
        let allNull = true;
        for (const s of p.rhs) {
          if (!g.isNT(s)) { first[p.lhs].add(s); allNull = false; break; }
          for (const a of first[s]) first[p.lhs].add(a);
          if (!nullable.has(s)) { allNull = false; break; }
        }
        if (allNull && !nullable.has(p.lhs)) { nullable.add(p.lhs); changed = true; }
        if (first[p.lhs].size !== before) changed = true;
      }
    }

    // FIRST of a sequence; `tail` is a set appended when the sequence is nullable.
    function firstOfSeq(seq, tail) {
      const set = new Set();
      for (const s of seq) {
        if (!g.isNT(s)) { set.add(s); return { set, nullable: false }; }
        for (const a of first[s]) set.add(a);
        if (!nullable.has(s)) return { set, nullable: false };
      }
      if (tail) for (const a of tail) set.add(a);
      return { set, nullable: true };
    }

    follow[g.aug].add(END);
    changed = true;
    while (changed) {
      changed = false;
      for (const p of g.prods) {
        p.rhs.forEach((B, i) => {
          if (!g.isNT(B)) return;
          const before = follow[B].size;
          const f = firstOfSeq(p.rhs.slice(i + 1));
          for (const a of f.set) follow[B].add(a);
          if (f.nullable) for (const a of follow[p.lhs]) follow[B].add(a);
          if (follow[B].size !== before) changed = true;
        });
      }
    }
    return { first, follow, nullable, firstOfSeq };
  }

  /* ------------------------------------------------------------------ *
   *  Items, closure and GOTO
   * ------------------------------------------------------------------ */

  const coreKey = it => it.p + '.' + it.dot;
  const nextSym = (g, it) => g.prods[it.p].rhs[it.dot];

  function termOrder(g) {
    const order = {};
    [...g.terminals, END].forEach((t, i) => { order[t] = i; });
    return order;
  }
  function sortLa(g, set) {
    const order = termOrder(g);
    return [...set].sort((a, b) => order[a] - order[b]);
  }

  // LR(0) closure. Each added item remembers the item that caused it.
  function closure0(g, kernel) {
    const items = [], index = new Map();
    const add = (it) => {
      const k = coreKey(it);
      if (index.has(k)) return;
      index.set(k, items.length);
      items.push(it);
    };
    kernel.forEach(it => add({ p: it.p, dot: it.dot, kernel: true, src: it.src }));
    for (let i = 0; i < items.length; i++) {
      const B = nextSym(g, items[i]);
      if (B !== undefined && g.isNT(B)) for (const q of g.byLhs[B]) add({ p: q, dot: 0, kernel: false, parent: i });
    }
    return items;
  }

  // LR(1) closure. Items with the same core share one lookahead set.
  function closure1(g, ff, kernel) {
    const items = [], index = new Map();
    const add = (p, dot, la, extra) => {
      const k = p + '.' + dot;
      if (index.has(k)) {
        const it = items[index.get(k)];
        let grew = false;
        for (const a of la) if (!it.la.has(a)) { it.la.add(a); grew = true; }
        return grew;
      }
      index.set(k, items.length);
      items.push(Object.assign({ p, dot, la: new Set(la) }, extra));
      return true;
    };
    kernel.forEach(it => add(it.p, it.dot, it.la, { kernel: true, src: it.src }));
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const B = nextSym(g, it);
        if (B === undefined || !g.isNT(B)) continue;
        const beta = g.prods[it.p].rhs.slice(it.dot + 1);
        const la = ff.firstOfSeq(beta, it.la).set;
        for (const q of g.byLhs[B]) if (add(q, 0, la, { kernel: false, parent: i })) changed = true;
      }
    }
    return items;
  }

  function kernelKey(kernel, withLa) {
    return kernel
      .map(it => coreKey(it) + (withLa ? ':' + [...it.la].sort().join(',') : ''))
      .sort()
      .join('|');
  }

  function symbolsAfterDot(g, items) {
    const out = [];
    for (const it of items) {
      const s = nextSym(g, it);
      if (s !== undefined && !out.includes(s)) out.push(s);
    }
    return out;
  }

  /*
   * Generic worklist construction of the canonical collection. Records, for
   * every state, the GOTO computations performed when it was expanded, so the
   * GUI can replay the construction one state at a time.
   */
  function buildAutomaton(g, kind, ff) {
    const lr1 = kind === 'lr1';
    const states = [], transitions = [], expansions = [];
    const byKey = new Map();
    let truncated = false;

    const make = (kernel, from) => {
      const key = kernelKey(kernel, lr1);
      if (byKey.has(key)) return { id: byKey.get(key), isNew: false };
      const id = states.length;
      const items = lr1 ? closure1(g, ff, kernel) : closure0(g, kernel);
      states.push({ id, name: String(id), items, from, core: kernelKey(kernel, false) });
      byKey.set(key, id);
      return { id, isNew: true };
    };

    make([{ p: 0, dot: 0, la: new Set([END]) }], null);
    for (let i = 0; i < states.length; i++) {
      if (states.length > MAX_STATES) { truncated = true; break; }
      const st = states[i];
      const gotos = [];
      for (const X of symbolsAfterDot(g, st.items)) {
        const kernel = [];
        st.items.forEach((it, idx) => {
          if (nextSym(g, it) === X) kernel.push({ p: it.p, dot: it.dot + 1, la: it.la ? new Set(it.la) : undefined, src: idx });
        });
        const r = make(kernel, { state: i, symbol: X });
        transitions.push({ from: i, symbol: X, to: r.id });
        gotos.push({ symbol: X, to: r.id, isNew: r.isNew });
      }
      expansions.push({ state: i, gotos });
    }
    return { kind, states, transitions, expansions, truncated };
  }

  const buildLR0Automaton = g => buildAutomaton(g, 'lr0');
  const buildLR1Automaton = (g, ff) => buildAutomaton(g, 'lr1', ff);

  /* ------------------------------------------------------------------ *
   *  LALR(1): merge LR(1) states that have identical cores
   * ------------------------------------------------------------------ */

  function mergeLALR(g, lr1) {
    const groups = new Map();
    for (const st of lr1.states) {
      if (!groups.has(st.core)) groups.set(st.core, []);
      groups.get(st.core).push(st.id);
    }
    const toMerged = new Array(lr1.states.length);
    const states = [];
    for (const members of groups.values()) {
      const id = states.length;
      const name = members.length === 1 ? String(members[0])
        : members.every(m => m < 10) ? members.join('') : members.join(',');
      const base = lr1.states[members[0]];
      const items = base.items.map(it => Object.assign({}, it, { la: new Set(it.la) }));
      for (const m of members.slice(1)) {
        lr1.states[m].items.forEach(it => {
          const target = items.find(x => x.p === it.p && x.dot === it.dot);
          for (const a of it.la) target.la.add(a);
        });
      }
      members.forEach(m => { toMerged[m] = id; });
      states.push({ id, name, items, members, core: base.core });
    }
    const transitions = [], seen = new Set();
    for (const t of lr1.transitions) {
      const from = toMerged[t.from], to = toMerged[t.to];
      const k = from + '|' + t.symbol;
      if (seen.has(k)) continue;
      seen.add(k);
      transitions.push({ from, symbol: t.symbol, to });
    }
    for (const st of states) {
      const first = lr1.states[st.members[0]].from;
      st.from = first ? { state: toMerged[first.state], symbol: first.symbol } : null;
    }
    const merges = states.filter(s => s.members.length > 1).map(s => ({ merged: s.id, members: s.members }));
    return { kind: 'lalr', states, transitions, merges, toMerged, truncated: lr1.truncated };
  }

  /* ------------------------------------------------------------------ *
   *  ACTION / GOTO table with provenance and conflict detection
   * ------------------------------------------------------------------ */

  // mode: 'lr0' | 'slr' | 'clr' | 'lalr'
  function buildTable(g, auto, mode, ff) {
    const terms = [...g.terminals, END];
    const nts = g.nonterminals;
    const name = id => auto.states[id].name;
    const entries = [];

    for (const st of auto.states) {
      const outs = auto.transitions.filter(t => t.from === st.id);
      for (const t of outs) {
        if (g.isNT(t.symbol)) continue;
        const items = [];
        st.items.forEach((it, idx) => { if (nextSym(g, it) === t.symbol) items.push(idx); });
        entries.push({ state: st.id, symbol: t.symbol, kind: 'shift', to: t.to, text: 's' + name(t.to), items });
      }
      st.items.forEach((it, idx) => {
        const prod = g.prods[it.p];
        if (it.dot !== prod.rhs.length) return;
        if (it.p === 0) {
          entries.push({ state: st.id, symbol: END, kind: 'accept', text: 'acc', items: [idx] });
          return;
        }
        let la, basis;
        if (mode === 'lr0') { la = terms; basis = 'all'; }
        else if (mode === 'slr') { la = sortLa(g, ff.follow[prod.lhs]); basis = 'follow'; }
        else { la = sortLa(g, it.la); basis = 'lookahead'; }
        for (const a of la) entries.push({ state: st.id, symbol: a, kind: 'reduce', prod: it.p, text: 'r' + it.p, items: [idx], basis });
      });
      for (const t of outs) {
        if (!g.isNT(t.symbol)) continue;
        entries.push({ state: st.id, symbol: t.symbol, kind: 'goto', to: t.to, text: name(t.to), items: [] });
      }
    }

    const cells = new Map();
    entries.forEach((e, i) => {
      e.index = i;
      const k = e.state + '|' + e.symbol;
      if (!cells.has(k)) cells.set(k, []);
      const list = cells.get(k);
      e.clashesWith = list.filter(x => x.text !== e.text).map(x => x.index);
      list.push(e);
    });

    const conflicts = [];
    for (const [k, list] of cells) {
      const distinct = [...new Set(list.map(e => e.text))];
      if (distinct.length < 2) continue;
      const shifts = list.filter(e => e.kind === 'shift').length;
      const reduces = new Set(list.filter(e => e.kind === 'reduce').map(e => e.prod)).size;
      const types = [];
      if (shifts && reduces) types.push('shift-reduce');
      if (reduces > 1) types.push('reduce-reduce');
      if (!types.length) types.push('accept-reduce');
      const [s, sym] = k.split('|');
      conflicts.push({ state: +s, symbol: sym, entries: list, types, firstIndex: list[1].index });
    }
    conflicts.sort((a, b) => a.firstIndex - b.firstIndex);

    const counts = { 'shift-reduce': 0, 'reduce-reduce': 0 };
    conflicts.forEach(c => c.types.forEach(t => { if (t in counts) counts[t]++; }));
    return { mode, terms, nts, entries, cells, conflicts, counts };
  }

  /* ------------------------------------------------------------------ *
   *  String parsing (shift/reduce driver)
   * ------------------------------------------------------------------ */

  function tokenizeInput(str, terminals) {
    const byLength = [...terminals].sort((a, b) => b.length - a.length);
    const out = [];
    for (const chunk of str.trim().split(/\s+/).filter(Boolean)) {
      if (EPS_WORDS.has(chunk)) continue;
      if (terminals.includes(chunk)) { out.push(chunk); continue; }
      let i = 0;
      while (i < chunk.length) {
        const t = byLength.find(x => chunk.startsWith(x, i));
        if (t) { out.push(t); i += t.length; continue; }
        let j = i + 1;
        while (j < chunk.length && !byLength.some(x => chunk.startsWith(x, j))) j++;
        out.push(chunk.slice(i, j));
        i = j;
      }
    }
    if (out[out.length - 1] === END) out.pop();
    return out;
  }

  function parseInput(g, auto, table, input) {
    const tokens = tokenizeInput(input, g.terminals).concat(END);
    const name = id => auto.states[id].name;
    const stack = [{ state: 0, sym: null, node: null }];
    const snap = () => stack.map(e => ({ state: name(e.state), sym: e.sym }));
    const rows = [];
    let pos = 0, result = null;

    for (let guard = 0; guard < 50000 && !result; guard++) {
      const s = stack[stack.length - 1].state;
      const a = tokens[pos];
      const row = { stack: snap(), pos, input: tokens.slice(pos), state: s, lookahead: a };
      const acts = (table.cells.get(s + '|' + a) || []).filter(e => e.kind !== 'goto');
      if (!acts.length) {
        const expected = table.terms.filter(t => (table.cells.get(s + '|' + t) || []).length);
        const unknown = a !== END && !g.terminals.includes(a);
        row.action = { kind: 'error', expected, unknown };
        rows.push(row);
        result = { accepted: false, pos, token: a, state: s, expected, unknown };
        break;
      }
      let act = acts[0];
      if (new Set(acts.map(e => e.text)).size > 1) {
        act = acts.find(e => e.kind === 'shift') || acts.filter(e => e.kind === 'reduce').sort((x, y) => x.prod - y.prod)[0] || acts[0];
        row.conflict = [...new Set(acts.map(e => e.text))];
      }
      if (act.kind === 'accept') {
        row.action = { kind: 'accept' };
        rows.push(row);
        result = { accepted: true, tree: stack[stack.length - 1].node };
      } else if (act.kind === 'shift') {
        row.action = { kind: 'shift', symbol: a, to: name(act.to) };
        rows.push(row);
        stack.push({ state: act.to, sym: a, node: { sym: a, children: [] } });
        pos++;
      } else {
        const prod = g.prods[act.prod];
        const popped = stack.splice(stack.length - prod.rhs.length, prod.rhs.length);
        const t = stack[stack.length - 1].state;
        const gotoEntry = (table.cells.get(t + '|' + prod.lhs) || []).find(e => e.kind === 'goto');
        const node = { sym: prod.lhs, children: popped.length ? popped.map(e => e.node) : [{ sym: EPS, children: [] }] };
        if (!gotoEntry) {
          row.action = { kind: 'error', expected: [], missingGoto: { state: name(t), symbol: prod.lhs } };
          rows.push(row);
          result = { accepted: false, pos, token: a, state: s, expected: [] };
          break;
        }
        stack.push({ state: gotoEntry.to, sym: prod.lhs, node });
        row.action = { kind: 'reduce', prod: act.prod, pop: prod.rhs.length, gotoFrom: name(t), gotoTo: name(gotoEntry.to), after: snap() };
        rows.push(row);
      }
    }
    if (!result) result = { accepted: false, pos, token: tokens[pos], expected: [], limit: true };
    return { tokens, rows, result };
  }

  /* ------------------------------------------------------------------ *
   *  Convenience: build everything for one variant
   * ------------------------------------------------------------------ */

  const VARIANTS = {
    'LR(0)': { mode: 'lr0', items: 'lr0' },
    'SLR(1)': { mode: 'slr', items: 'lr0' },
    'CLR(1)': { mode: 'clr', items: 'lr1' },
    'LALR(1)': { mode: 'lalr', items: 'lr1' },
  };

  function build(text, variant) {
    const g = parseGrammar(text);
    if (g.errors.length) return { grammar: g, errors: g.errors };
    const ff = computeFirstFollow(g);
    const v = VARIANTS[variant];
    const canonical = v.items === 'lr1' ? buildLR1Automaton(g, ff) : buildLR0Automaton(g);
    const lalr = variant === 'LALR(1)' ? mergeLALR(g, canonical) : null;
    const automaton = lalr || canonical;
    const table = buildTable(g, automaton, v.mode, ff);
    return { grammar: g, ff, variant, canonical, lalr, automaton, table, errors: [] };
  }

  // Conflict summary for all four variants (the grammar-class verdicts).
  function classify(text) {
    const g = parseGrammar(text);
    if (g.errors.length) return null;
    const ff = computeFirstFollow(g);
    const lr0 = buildLR0Automaton(g);
    const lr1 = buildLR1Automaton(g, ff);
    const lalr = mergeLALR(g, lr1);
    const row = (auto, mode) => {
      const t = buildTable(g, auto, mode, ff);
      return { states: auto.states.length, conflicts: t.conflicts.length, counts: t.counts };
    };
    return {
      'LR(0)': row(lr0, 'lr0'),
      'SLR(1)': row(lr0, 'slr'),
      'CLR(1)': row(lr1, 'clr'),
      'LALR(1)': row(lalr, 'lalr'),
    };
  }

  function formatItem(g, it, withLa) {
    const p = g.prods[it.p];
    const rhs = p.rhs.slice();
    rhs.splice(it.dot, 0, '·');
    // An ε-production A → ε has the single, complete item A → ε · (a reduce item).
    let s = p.lhs + ' → ' + (p.rhs.length ? rhs.join(' ') : EPS + ' ·');
    if (withLa && it.la) s += ' , ' + sortLa(g, it.la).join('/');
    return s;
  }

  const api = {
    EPS, END, VARIANTS,
    parseGrammar, computeFirstFollow, buildLR0Automaton, buildLR1Automaton, mergeLALR,
    buildTable, tokenizeInput, parseInput, build, classify, formatItem, sortLa,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LREngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
