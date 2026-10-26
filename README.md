# LR Parser Visualizer — Project 7

**Interactive GUI for Bottom-Up Parsing (LR Family)**, Compiler Design Lab.

**Live demo:** https://likithtech2006-pixel.github.io/LR-Parser-Visualizer/  
**Review 1 mode (LR(0) and SLR(1) only):** https://likithtech2006-pixel.github.io/LR-Parser-Visualizer/?review1  
**Source code:** https://github.com/likithtech2006-pixel/LR-Parser-Visualizer

You enter a grammar, pick **LR(0), SLR(1), CLR(1) or LALR(1)**, and watch the parser being built one step at a time:

1. **Grammar**: the augmented grammar, numbered productions, FIRST/FOLLOW sets, and which LR classes the grammar belongs to.
2. **Item sets**: the canonical collection drawn as a state diagram. Each *Next step* expands one state, so its GOTO transitions and any new states appear. Click a state to see how it was derived (kernel from GOTO, closure items with their reason and lookaheads).
3. **LALR merge** (LALR(1) only): CLR(1) states with identical cores are merged one group at a time, with a per-item lookahead union table.
4. **Parsing table**: the ACTION/GOTO table is filled one entry at a time. Each entry links back to the state and item that produced it. Conflicting cells get a dashed border, stripes and ⚠, with the conflict type (shift-reduce or reduce-reduce) and the verdict *"the grammar is not X"*.
5. **Parse string**: a Stack | Input | Action trace, one shift/reduce/accept at a time. Every reduce shows the production and the resulting stack. The trace ends in **ACCEPT** (with a parse tree) or **REJECT** (with the failing token and the expected tokens).

Light theme by default, with a dark-mode toggle in the top-right corner.

## Running the GUI

No installation and no server. Open `index.html` in Chrome, Edge, Firefox or Safari.

**Review 1 mode:** open `index.html?review1` to show only the LR(0) and SLR(1) variants (CLR(1) and LALR(1) are hidden).

- Keyboard: `→` next step, `←` previous step.
- In the toolbar: ⏮ first step · ◀ previous · **Next step** · ▶ play the phase · ⏭ complete the phase.
- In the state diagram: click a state to inspect it, drag to pan, Ctrl/⌘ + scroll to zoom, **Fit** to see everything.

### Grammar format

```
E -> E + T | T
T -> T * F | F
F -> ( E ) | id
```

- One rule per line. `->`, `→` and `::=` all work as the arrow. Use `|` for alternatives.
- Separate symbols with spaces. (The GUI also splits glued forms such as `S->CC`, `aAb` and `(E)`.)
- Write `ε`, `eps` or `epsilon` for an empty body.
- Every symbol that appears on a left-hand side is a non-terminal. All other symbols are terminals. The first left-hand side is the start symbol.

## Built-in examples

| Example | LR(0) | SLR(1) | LALR(1) | CLR(1) | Shows |
|---|---|---|---|---|---|
| `S → C C`, `C → c C \| d` | ✓ | ✓ | ✓ | ✓ | LALR merge I36, I47, I89 |
| `S → ( L ) \| x`, `L → S \| L , S` | ✓ | ✓ | ✓ | ✓ | a pure LR(0) grammar |
| `S → ( S ) S \| ε` | ✗ | ✓ | ✓ | ✓ | ε-productions |
| Expression grammar `E → E + T \| T …` | ✗ S/R | ✓ | ✓ | ✓ | **LR(0) conflict demo** |
| `S → A a \| B b`, `A → x`, `B → x` | ✗ R/R | ✓ | ✓ | ✓ | LR(0) reduce-reduce |
| `S → L = R \| R`, `L → * R \| id`, `R → L` | ✗ | ✗ S/R | ✓ | ✓ | **SLR(1) conflict demo** |
| `S → a A d \| b B d \| a B e \| b A e`, `A → c`, `B → c` | ✗ | ✗ | ✗ R/R | ✓ | **LALR(1) conflict demo** |
| `E → E + E \| E * E \| ( E ) \| id` | ✗ | ✗ | ✗ | ✗ S/R | **CLR(1) conflict demo** (ambiguous) |
| `S → i S e S \| i S \| a` | ✗ | ✗ | ✗ | ✗ S/R | dangling else |
| `S → A \| B`, `A → x`, `B → x` | ✗ | ✗ | ✗ | ✗ R/R | reduce-reduce everywhere |

The same grammars are in `samples/` as text files.

## Project files

| File | Purpose |
|---|---|
| `index.html` | page structure: Bottom-Up Parsing → LR Parsing / Operator Precedence |
| `style.css` | light and dark themes, layout, table and diagram styling |
| `engine.js` | the parser-construction engine (pure logic, no UI): grammar reading, FIRST/FOLLOW, closure/GOTO, LR(0) and LR(1) collections, LALR merging, ACTION/GOTO table with provenance and conflicts, shift-reduce driver |
| `graph.js` | layered layout and SVG drawing of the state diagram and the parse tree |
| `app.js` | UI controller: phases, step counters, inspector, examples, theme |
| `lr_parser.c` | console version of the same engine in C (all four variants) |
| `samples/*.txt` | test grammars |
| `tests/engine.test.js` | automated tests against textbook results |

## Tests

```
node tests/engine.test.js
node tests/examples.test.js
```

`examples.test.js` runs 67 more grammar/variant cases with hand-written expected answers, cross-checks every string with an independent Earley parser, and exhaustively compares all strings up to length 6 (about 139,000). Results are in `docs/TEST_RESULTS.md`.

21 checks against Aho, Lam, Sethi & Ullman (the Dragon Book): state counts (12 LR(0) / 22 CLR / 12 LALR for the expression grammar, I36/I47/I89 for `S → CC`), FOLLOW sets, conflict type and location for each demo, and the 14-step SLR trace for `id * id + id`.

## C console version

```
gcc -O2 -Wall -o lr_parser lr_parser.c
./lr_parser samples/expr.txt SLR1 "id * id + id"
./lr_parser samples/lalr_rr.txt LALR1 "a c d"
./lr_parser samples/lr_eq.txt SLR1 "id = * id"
```

Variants: `LR0`, `SLR1`, `CLR1`, `LALR1`. The program prints the augmented grammar, FIRST/FOLLOW, the canonical collection (with GOTO origins and closure items), the LALR merges, the ACTION/GOTO table with conflicts and the verdict, and the parse trace. For every sample grammar and variant, its state and conflict counts match the JavaScript engine.

> On macOS, if `gcc` asks you to accept the Xcode licence, run `sudo xcodebuild -license accept` once.
