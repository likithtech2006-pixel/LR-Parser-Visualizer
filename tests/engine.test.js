// Run with:  node tests/engine.test.js
// Checks the engine against well-known textbook results (Aho, Lam, Sethi, Ullman).
const assert = require('assert');
const LR = require('../engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const conflicts = (text, variant) => LR.build(text, variant).table.conflicts;
const states = (text, variant) => LR.build(text, variant).automaton.states.length;
const accepts = (text, variant, input) => {
  const m = LR.build(text, variant);
  return LR.parseInput(m.grammar, m.automaton, m.table, input).result.accepted;
};

const EXPR = 'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id';
const CC = 'S -> C C\nC -> c C | d';
const LR_EQ = 'S -> L = R | R\nL -> * R | id\nR -> L';
const LALR_RR = 'S -> a A d | b B d | a B e | b A e\nA -> c\nB -> c';
const AMBIG = 'E -> E + E | E * E | ( E ) | id';
const PARENS = 'S -> ( S ) S | ε';

console.log('Grammar input');
test('augments and numbers productions', () => {
  const g = LR.parseGrammar(EXPR);
  assert.strictEqual(g.prods.length, 7);
  assert.strictEqual(g.prods[0].lhs, "E'");
  assert.deepStrictEqual(g.terminals, ['+', '*', '(', ')', 'id']);
});
test('splits glued symbols (CC, cC, (E))', () => {
  const g = LR.parseGrammar('S->CC\nC->cC|d');
  assert.deepStrictEqual(g.prods[1].rhs, ['C', 'C']);
  assert.deepStrictEqual(g.prods[2].rhs, ['c', 'C']);
  const h = LR.parseGrammar('E->E+T|T\nT->(E)|id');
  assert.deepStrictEqual(h.prods[1].rhs, ['E', '+', 'T']);
  assert.deepStrictEqual(h.prods[3].rhs, ['(', 'E', ')']);
});
test('reads ε productions', () => {
  const g = LR.parseGrammar(PARENS);
  assert.deepStrictEqual(g.prods[2].rhs, []);
});
test('ε written as ε, ∈, ϵ, ɛ or eps is the empty string, not a terminal', () => {
  for (const e of ['ε', '∈', 'ϵ', 'ɛ', 'eps', 'epsilon']) {
    const g = LR.parseGrammar('S -> ( S ) S | ' + e);
    assert.deepStrictEqual(g.prods[2].rhs, [], e);
    assert.deepStrictEqual(g.terminals, ['(', ')'], e);
  }
});
test('the ε-item is shown as S → ε · and reduces on FOLLOW(S) in SLR(1)', () => {
  const m = LR.build('S -> ( S ) S | ∈', 'SLR(1)');
  const it = m.automaton.states[0].items.find(x => x.p === 2);
  assert.strictEqual(LR.formatItem(m.grammar, it, false), 'S → ε ·');
  const reduces = m.table.entries.filter(e => e.state === 0 && e.kind === 'reduce').map(e => e.symbol).sort();
  assert.deepStrictEqual(reduces, ['$', ')']);   // FOLLOW(S) = { ), $ }
});
test('reports malformed lines', () => {
  assert.ok(LR.parseGrammar('E + T').errors.length);
});

console.log('FIRST / FOLLOW');
test('expression grammar FOLLOW sets', () => {
  const g = LR.parseGrammar(EXPR);
  const ff = LR.computeFirstFollow(g);
  assert.deepStrictEqual([...ff.follow.E].sort(), ['$', ')', '+'].sort());
  assert.deepStrictEqual([...ff.follow.T].sort(), ['$', ')', '*', '+'].sort());
  assert.deepStrictEqual([...ff.first.F].sort(), ['(', 'id'].sort());
});

console.log('State counts (canonical collections)');
test('expression grammar: 12 LR(0) / 22 CLR / 12 LALR', () => {
  assert.strictEqual(states(EXPR, 'LR(0)'), 12);
  assert.strictEqual(states(EXPR, 'CLR(1)'), 22);
  assert.strictEqual(states(EXPR, 'LALR(1)'), 12);
});
test('S -> CC: 7 LR(0) / 10 CLR / 7 LALR with I36, I47, I89', () => {
  assert.strictEqual(states(CC, 'LR(0)'), 7);
  assert.strictEqual(states(CC, 'CLR(1)'), 10);
  const m = LR.build(CC, 'LALR(1)');
  assert.deepStrictEqual(m.automaton.states.map(s => s.name).sort(), ['0', '1', '2', '36', '47', '5', '89'].sort());
});
test('L = R grammar: 10 LR(0) / 14 CLR / 10 LALR', () => {
  assert.strictEqual(states(LR_EQ, 'LR(0)'), 10);
  assert.strictEqual(states(LR_EQ, 'CLR(1)'), 14);
  assert.strictEqual(states(LR_EQ, 'LALR(1)'), 10);
});

console.log('Conflict detection / grammar classes');
test('expression grammar: not LR(0) (2 shift-reduce), but SLR, CLR, LALR', () => {
  const c = conflicts(EXPR, 'LR(0)');
  assert.strictEqual(c.length, 2);
  assert.ok(c.every(x => x.types.includes('shift-reduce')));
  assert.strictEqual(conflicts(EXPR, 'SLR(1)').length, 0);
  assert.strictEqual(conflicts(EXPR, 'CLR(1)').length, 0);
  assert.strictEqual(conflicts(EXPR, 'LALR(1)').length, 0);
});
test('L = R grammar: not SLR (shift-reduce on =), but LALR and CLR', () => {
  const c = conflicts(LR_EQ, 'SLR(1)');
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].symbol, '=');
  assert.deepStrictEqual(c[0].types, ['shift-reduce']);
  assert.strictEqual(conflicts(LR_EQ, 'LALR(1)').length, 0);
  assert.strictEqual(conflicts(LR_EQ, 'CLR(1)').length, 0);
});
test('a A d grammar: CLR but not LALR (reduce-reduce on d and e)', () => {
  assert.strictEqual(conflicts(LALR_RR, 'CLR(1)').length, 0);
  const c = conflicts(LALR_RR, 'LALR(1)');
  assert.strictEqual(c.length, 2);
  assert.ok(c.every(x => x.types.includes('reduce-reduce')));
  assert.deepStrictEqual(c.map(x => x.symbol).sort(), ['d', 'e']);
});
test('ambiguous grammar conflicts in every variant', () => {
  for (const v of ['LR(0)', 'SLR(1)', 'CLR(1)', 'LALR(1)']) assert.ok(conflicts(AMBIG, v).length > 0, v);
});
test('S -> CC is LR(0)', () => {
  assert.strictEqual(conflicts(CC, 'LR(0)').length, 0);
});
test('ε grammar S -> ( S ) S | ε: not LR(0), but SLR', () => {
  assert.ok(conflicts(PARENS, 'LR(0)').length > 0);
  assert.strictEqual(conflicts(PARENS, 'SLR(1)').length, 0);
});

console.log('String parsing');
test('id + id * id accepted by SLR / CLR / LALR', () => {
  for (const v of ['SLR(1)', 'CLR(1)', 'LALR(1)']) assert.ok(accepts(EXPR, v, 'id + id * id'), v);
});
test('glued input id+id*id is tokenized', () => {
  assert.ok(accepts(EXPR, 'SLR(1)', 'id+id*id'));
});
test('id + * id rejected at *', () => {
  const m = LR.build(EXPR, 'SLR(1)');
  const r = LR.parseInput(m.grammar, m.automaton, m.table, 'id + * id');
  assert.strictEqual(r.result.accepted, false);
  assert.strictEqual(r.result.token, '*');
  assert.strictEqual(r.result.pos, 2);
});
test('SLR trace for id * id + id has the textbook 14 steps', () => {
  const m = LR.build(EXPR, 'SLR(1)');
  assert.strictEqual(LR.parseInput(m.grammar, m.automaton, m.table, 'id * id + id').rows.length, 14);
});
test('ε grammar accepts ( ( ) ) ( ) and empty string', () => {
  assert.ok(accepts(PARENS, 'SLR(1)', '( ( ) ) ( )'));
  assert.ok(accepts(PARENS, 'SLR(1)', ''));
  assert.ok(!accepts(PARENS, 'SLR(1)', '( ( )'));
});
test('c d d accepted by all four (S -> CC)', () => {
  for (const v of ['LR(0)', 'SLR(1)', 'CLR(1)', 'LALR(1)']) assert.ok(accepts(CC, v, 'c d d'), v);
});
test('parse tree root is the start symbol', () => {
  const m = LR.build(EXPR, 'LALR(1)');
  const r = LR.parseInput(m.grammar, m.automaton, m.table, 'id + id');
  assert.strictEqual(r.result.tree.sym, 'E');
});

console.log(`\n${passed} test(s) passed` + (process.exitCode ? ', some FAILED' : ''));
