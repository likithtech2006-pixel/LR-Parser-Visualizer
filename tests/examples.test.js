// Run with:  node tests/examples.test.js
//
// 67 grammar/variant cases with expected answers worked out by hand from the
// standard LR(0) / SLR(1) / LALR(1) / CLR(1) constructions (Aho, Lam, Sethi &
// Ullman). Each case states, in advance:
//   - the number of states (where it is a known textbook value),
//   - the number and type of conflicting cells (0 = the grammar is in the class),
//   - strings that must be ACCEPTED and strings that must be REJECTED.
// Membership of every listed string is also checked by an independent Earley
// recogniser below (it shares no code with engine.js), so a wrong hand-written
// expectation is caught as well as a wrong engine result.
// Finally, every conflict-free case is checked exhaustively: all strings over its
// terminals up to length 6 must get the same ACCEPT/REJECT from the LR parser
// and from the Earley recogniser.

const LR = require('../engine.js');

const G = {
  EXPR: 'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id',
  CC: 'S -> C C\nC -> c C | d',
  LIST: 'S -> ( L ) | x\nL -> S | L , S',
  ANBN: 'S -> a S b | a b',
  ANBN0: 'S -> a S b | ε',
  PARENS: 'S -> ( S ) S | ε',
  RR: 'S -> A a | B b\nA -> x\nB -> x',
  LEQR: 'S -> L = R | R\nL -> * R | id\nR -> L',
  AMB: 'E -> E + E | E * E | ( E ) | id',
  ELSE: 'S -> i S e S | i S | a',
  RLIST: 'L -> id , L | id',
  LLIST: 'L -> L , id | id',
  AB: 'S -> A B\nA -> a | ε\nB -> b | ε',
  PAL: 'S -> a S a | b S b | a | b',
  POSTFIX: 'S -> S S + | S S * | a',
  NEST: 'A -> ( A ) | a',
  XY: 'S -> x S | y',
  YX: 'S -> S x | y',
  SUML: 'E -> E + n | n',
  SUMR: 'E -> n + E | n',
  ABC: 'S -> A | B\nA -> a A | b\nB -> a B | c',
  AMB2: 'S -> A | a\nA -> a',
  EPS2: 'S -> A b | B c\nA -> ε\nB -> ε',
  LALR_NOT_SLR: 'S -> A a | b A c | d c | b d a\nA -> d',
  LALR_RR: 'S -> a A d | b B d | a B e | b A e\nA -> c\nB -> c',
  CYCLE: 'S -> S | a',
  ASTAR_L: 'S -> S a | ε',
  ASTAR_R: 'S -> a S | ε',
  DECL: 'D -> T L\nT -> int | float\nL -> L , id | id',
  ASSIGN: 'S -> id = E\nE -> E + id | id',
  CALL: 'F -> id ( A )\nA -> A , id | id | ε',
  EQAB: 'S -> b A | a B\nA -> a | a S | b A A\nB -> b | b S | a B B',
  LL1: 'E -> T X\nX -> + T X | ε\nT -> F Y\nY -> * F Y | ε\nF -> ( E ) | id',
  ODDX: 'S -> x x S | x',
  UNREACH: 'S -> a\nB -> b',
  NONPROD: 'S -> a S',
  GLUED: 'S->aSb|ab',
  SINGLE: 'S -> a',
  IF: 'S -> if E then S | other\nE -> cond',
};

const SR = n => ({ n, type: 'shift-reduce' });
const RRc = n => ({ n, type: 'reduce-reduce' });

// c: expected conflicts (number, or {n, type}, or 'some' for "at least one")
const CASES = [
  { g: 'EXPR', v: 'LR(0)', states: 12, c: SR(2) },
  { g: 'EXPR', v: 'SLR(1)', states: 12, c: 0, acc: ['id + id * id', '( id )', '( ( id ) ) * id', 'id * ( id + id )'], rej: ['id +', ') id (', '', 'id id'] },
  { g: 'EXPR', v: 'CLR(1)', states: 22, c: 0, acc: ['id * id + id'], rej: ['+ id'] },
  { g: 'EXPR', v: 'LALR(1)', states: 12, c: 0, acc: ['( id + id ) * id'], rej: ['( id'] },
  { g: 'CC', v: 'LR(0)', states: 7, c: 0, acc: ['d d', 'c d c d', 'c c c d d'], rej: ['d', 'c d', 'd d d'] },
  { g: 'CC', v: 'SLR(1)', states: 7, c: 0, acc: ['c d d'], rej: ['c c'] },
  { g: 'CC', v: 'CLR(1)', states: 10, c: 0, acc: ['d c d'], rej: ['d c'] },
  { g: 'CC', v: 'LALR(1)', states: 7, c: 0, names: ['36', '47', '89'], acc: ['c c d c d'], rej: [''] },
  { g: 'LIST', v: 'LR(0)', states: 9, c: 0, acc: ['( x , ( x ) , x )', 'x', '( ( x ) )'], rej: ['( )', '( x , )'] },
  { g: 'LIST', v: 'SLR(1)', states: 9, c: 0 },
  { g: 'ANBN', v: 'LR(0)', states: 6, c: 0, acc: ['a b', 'a a a b b b'], rej: ['a a b', 'a b a b', ''] },
  { g: 'ANBN0', v: 'LR(0)', c: SR(2) },
  { g: 'ANBN0', v: 'SLR(1)', c: 0, acc: ['', 'a b', 'a a b b'], rej: ['a a b', 'b a'] },
  { g: 'PARENS', v: 'LR(0)', states: 6, c: SR(3) },
  { g: 'PARENS', v: 'SLR(1)', states: 6, c: 0, acc: ['', '( )', '( ( ) ) ( )'], rej: ['( ( )', ') ('] },
  { g: 'RR', v: 'LR(0)', states: 7, c: RRc(4) },
  { g: 'RR', v: 'SLR(1)', states: 7, c: 0, acc: ['x a', 'x b'], rej: ['x', 'x a b'] },
  { g: 'LEQR', v: 'LR(0)', states: 10, c: SR(1) },
  { g: 'LEQR', v: 'SLR(1)', states: 10, c: SR(1), conflictCell: ['I2', '='], acc: ['id = id', '* id = id', 'id'], rej: ['= id'] },
  { g: 'LEQR', v: 'LALR(1)', states: 10, c: 0, acc: ['* * id = * id'], rej: ['id = = id'] },
  { g: 'AMB', v: 'LR(0)', c: SR(4) },
  { g: 'AMB', v: 'SLR(1)', c: SR(4), acc: ['id + id * id'], rej: ['id +'] },
  { g: 'ELSE', v: 'LR(0)', c: SR(1) },
  { g: 'ELSE', v: 'SLR(1)', c: SR(1), acc: ['i a e a', 'i i a e a'], rej: ['e a'] },
  { g: 'RLIST', v: 'LR(0)', c: SR(1) },
  { g: 'RLIST', v: 'SLR(1)', c: 0, acc: ['id', 'id , id , id'], rej: ['id ,', ', id'] },
  { g: 'LLIST', v: 'LR(0)', c: 0, acc: ['id', 'id , id , id'], rej: ['id ,', ', id'] },
  { g: 'AB', v: 'LR(0)', c: SR(2) },
  { g: 'AB', v: 'SLR(1)', c: 0, acc: ['', 'a', 'b', 'a b'], rej: ['b a', 'a a', 'a b b'] },
  { g: 'PAL', v: 'LR(0)', c: SR(4) },
  { g: 'PAL', v: 'SLR(1)', c: SR(4) },
  { g: 'POSTFIX', v: 'LR(0)', c: 0, acc: ['a', 'a a +', 'a a * a +', 'a a a + *'], rej: ['a +', 'a a'] },
  { g: 'NEST', v: 'LR(0)', c: 0, acc: ['( ( a ) )', 'a'], rej: ['( a'] },
  { g: 'XY', v: 'LR(0)', c: 0, acc: ['y', 'x x y'], rej: ['x', 'y x'] },
  { g: 'YX', v: 'LR(0)', c: 0, acc: ['y', 'y x x'], rej: ['x y'] },
  { g: 'SUML', v: 'LR(0)', c: 0, acc: ['n + n + n'], rej: ['n +'] },
  { g: 'SUMR', v: 'LR(0)', c: SR(1) },
  { g: 'SUMR', v: 'SLR(1)', c: 0, acc: ['n + n + n'], rej: ['+ n'] },
  { g: 'ABC', v: 'LR(0)', c: 0, acc: ['a a b', 'c', 'a a a c'], rej: ['a', 'a b c'] },
  { g: 'AMB2', v: 'LR(0)', c: RRc(2) },
  { g: 'AMB2', v: 'SLR(1)', c: RRc(1) },
  { g: 'EPS2', v: 'LR(0)', c: RRc(3) },
  { g: 'EPS2', v: 'SLR(1)', c: 0, acc: ['b', 'c'], rej: ['', 'b c'] },
  { g: 'LALR_NOT_SLR', v: 'SLR(1)', c: SR(2) },
  { g: 'LALR_NOT_SLR', v: 'LALR(1)', c: 0, acc: ['d a', 'd c', 'b d c', 'b d a'], rej: ['b a', 'b d'] },
  { g: 'LALR_RR', v: 'SLR(1)', c: RRc(2) },
  { g: 'LALR_RR', v: 'LALR(1)', c: RRc(2) },
  { g: 'LALR_RR', v: 'CLR(1)', states: 14, c: 0, acc: ['a c d', 'b c d', 'a c e', 'b c e'], rej: ['a c c'] },
  { g: 'CYCLE', v: 'SLR(1)', c: 1 },
  { g: 'ASTAR_L', v: 'LR(0)', c: 0, acc: ['', 'a a a'], rej: ['b'] },
  { g: 'ASTAR_R', v: 'LR(0)', c: SR(2) },
  { g: 'ASTAR_R', v: 'SLR(1)', c: 0, acc: ['', 'a a a'], rej: ['a a b'] },
  { g: 'DECL', v: 'LR(0)', c: SR(1) },
  { g: 'DECL', v: 'SLR(1)', c: 0, acc: ['int id , id', 'float id'], rej: ['int', 'id'] },
  { g: 'ASSIGN', v: 'SLR(1)', c: 0, acc: ['id = id + id'], rej: ['id ='] },
  { g: 'CALL', v: 'LR(0)', c: SR(1) },
  { g: 'CALL', v: 'SLR(1)', c: 0, acc: ['id ( )', 'id ( id , id )', 'id ( , id )'], rej: ['id ( id'] },
  { g: 'EQAB', v: 'SLR(1)', c: 'some' },
  { g: 'LL1', v: 'LR(0)', c: SR(4) },
  { g: 'LL1', v: 'SLR(1)', c: 0, acc: ['id + id * id', '( id )'], rej: ['id *', ''] },
  { g: 'ODDX', v: 'LR(0)', c: SR(1) },
  { g: 'ODDX', v: 'SLR(1)', c: 0, acc: ['x', 'x x x', 'x x x x x'], rej: ['x x'] },
  { g: 'UNREACH', v: 'LR(0)', c: 0, warn: /unreachable/, acc: ['a'], rej: ['b'] },
  { g: 'NONPROD', v: 'LR(0)', c: 0, warn: /never derive/, rej: ['a a a', ''] },
  { g: 'GLUED', v: 'LR(0)', states: 6, c: 0, acc: ['a a b b', 'a b'], rej: ['a a b'] },
  { g: 'SINGLE', v: 'LR(0)', states: 3, c: 0, acc: ['a'], rej: ['a a', ''] },
  { g: 'IF', v: 'LR(0)', c: 0, acc: ['if cond then other', 'if cond then if cond then other'], rej: ['if cond then'] },
];

/* ------------------------------------------------------------------ *
 *  Independent Earley recogniser (no code shared with engine.js)
 * ------------------------------------------------------------------ */
function earleyFactory(text) {
  const prods = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^(\S+?)\s*->\s*(.*)$/);
    for (const alt of m[2].split('|')) {
      const rhs = alt.trim().split(/\s+/).filter(s => s && s !== 'ε');
      prods.push([m[1], rhs]);
    }
  }
  // Glued grammar: split letters (only used for 'S->aSb|ab').
  if (text.includes('->a')) for (const p of prods) if (p[1].length === 1 && p[1][0].length > 1) p[1] = p[1][0].split('');
  const nts = new Set(prods.map(p => p[0]));
  const start = prods[0][0];
  const nullable = new Set();
  for (let ch = true; ch;) { ch = false; for (const [A, r] of prods) if (!nullable.has(A) && r.every(s => nullable.has(s))) { nullable.add(A); ch = true; } }
  return function accepts(tokens) {
    const S = Array.from({ length: tokens.length + 1 }, () => new Map());
    const add = (i, it) => { const k = it.join(','); if (!S[i].has(k)) { S[i].set(k, it); return true; } return false; };
    prods.forEach((p, pi) => { if (p[0] === start) add(0, [pi, 0, 0]); });
    for (let i = 0; i <= tokens.length; i++) {
      const items = S[i];
      for (let changed = true; changed;) {
        changed = false;
        for (const [pi, dot, origin] of [...items.values()]) {
          const [A, rhs] = prods[pi];
          if (dot < rhs.length) {
            const X = rhs[dot];
            if (nts.has(X)) {
              prods.forEach((q, qi) => { if (q[0] === X && add(i, [qi, 0, i])) changed = true; });
              if (nullable.has(X) && add(i, [pi, dot + 1, origin])) changed = true;
            } else if (i < tokens.length && tokens[i] === X) add(i + 1, [pi, dot + 1, origin]);
          } else {
            for (const [pj, d2, o2] of [...S[origin].values()]) {
              const r2 = prods[pj][1];
              if (r2[d2] === A && add(i, [pj, d2 + 1, o2])) changed = true;
            }
          }
        }
      }
    }
    for (const [pi, dot, origin] of S[tokens.length].values()) if (prods[pi][0] === start && dot === prods[pi][1].length && origin === 0) return true;
    return false;
  };
}

/* ------------------------------------------------------------------ */
let pass = 0, fail = 0;
const failures = [];
function check(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }
const toks = w => w.trim().split(/\s+/).filter(Boolean);

let exhaustive = 0;
CASES.forEach((cs, idx) => {
  const label = `#${idx + 1} ${cs.g} ${cs.v}`;
  const m = LR.build(G[cs.g], cs.v);
  check(!m.errors.length, `${label}: grammar error ${m.errors}`);
  if (m.errors.length) return;
  const nStates = m.automaton.states.length;
  const conf = m.table.conflicts;
  if (cs.states !== undefined) check(nStates === cs.states, `${label}: expected ${cs.states} states, got ${nStates}`);
  if (cs.c === 'some') check(conf.length > 0, `${label}: expected conflicts, got none`);
  else if (typeof cs.c === 'number') check(conf.length === cs.c, `${label}: expected ${cs.c} conflicts, got ${conf.length}`);
  else {
    check(conf.length === cs.c.n, `${label}: expected ${cs.c.n} ${cs.c.type} conflicts, got ${conf.length}`);
    check(conf.every(c => c.types.includes(cs.c.type)), `${label}: expected all ${cs.c.type}, got ${conf.map(c => c.types).join(';')}`);
  }
  if (cs.names) check(cs.names.every(n => m.automaton.states.some(s => s.name === n)), `${label}: expected merged states ${cs.names}`);
  if (cs.conflictCell) {
    const [st, sym] = cs.conflictCell;
    check(conf.some(c => 'I' + m.automaton.states[c.state].name === st && c.symbol === sym), `${label}: expected conflict at ${st}, ${sym}`);
  }
  if (cs.warn) check(m.grammar.warnings.some(w => cs.warn.test(w)), `${label}: expected warning ${cs.warn}`);

  const earley = earleyFactory(G[cs.g]);
  const run = w => LR.parseInput(m.grammar, m.automaton, m.table, w).result.accepted;
  for (const w of cs.acc || []) {
    check(earley(toks(w)) === true, `${label}: MY EXPECTATION WRONG? Earley rejects "${w}"`);
    check(run(w) === true, `${label}: engine should ACCEPT "${w}"`);
  }
  for (const w of cs.rej || []) {
    check(earley(toks(w)) === false, `${label}: MY EXPECTATION WRONG? Earley accepts "${w}"`);
    check(run(w) === false, `${label}: engine should REJECT "${w}"`);
  }

  // Exhaustive agreement with Earley for conflict-free tables.
  if (conf.length === 0 && !cs.warn) {
    const T = m.grammar.terminals;
    let frontier = [[]];
    for (let len = 0; len <= 6; len++) {
      for (const t of frontier) {
        const w = t.join(' ');
        const a = run(w), b = earley(t);
        exhaustive++;
        if (a !== b) check(false, `${label}: engine ${a ? 'ACCEPTS' : 'REJECTS'} "${w}" but Earley ${b ? 'accepts' : 'rejects'}`);
      }
      if (frontier.length * T.length > 20000) break;
      frontier = frontier.flatMap(t => T.map(x => [...t, x]));
    }
  }
});

// Glued input string (tokenised by longest match).
{
  const m = LR.build(G.EXPR, 'SLR(1)');
  check(LR.parseInput(m.grammar, m.automaton, m.table, 'id+id*id').result.accepted, 'glued input id+id*id should be accepted');
  const r = LR.parseInput(m.grammar, m.automaton, m.table, 'id+*id').result;
  check(!r.accepted && r.pos === 2 && r.token === '*', 'id+*id should fail at token 3 (*)');
}

console.log(`${CASES.length} grammar/variant cases, ${pass} checks passed, ${fail} failed.`);
console.log(`Exhaustive agreement with Earley: ${exhaustive} strings compared.`);
if (failures.length) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
