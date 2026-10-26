# Example Test Results (67 cases)

Run: `node tests/examples.test.js`

The expected answers were written by hand from the textbook LR constructions **before** the engine was run. String membership was confirmed by an independent Earley parser. Every conflict-free case was also checked on all strings of up to 6 tokens (139,039 strings), and the engine agreed with the Earley parser on every one.

**Result: 489 / 489 checks passed.**

| # | Grammar | Variant | Expected states | Expected conflicts | Engine got | Should ACCEPT | Should REJECT | ✓ |
|---|---|---|---|---|---|---|---|---|
| 1 | `E -> E + T \| T; T -> T * F \| F; F -> ( E ) \| id` | LR(0) | 12 | 2 shift-reduce | 12 states, 2 shift-reduce | – | – | ✓ |
| 2 | `E -> E + T \| T; T -> T * F \| F; F -> ( E ) \| id` | SLR(1) | 12 | none | 12 states, no conflicts | `id + id * id`, `( id )`, `( ( id ) ) * id`, `id * ( id + id )` | `id +`, `) id (`, `ε`, `id id` | ✓ |
| 3 | `E -> E + T \| T; T -> T * F \| F; F -> ( E ) \| id` | CLR(1) | 22 | none | 22 states, no conflicts | `id * id + id` | `+ id` | ✓ |
| 4 | `E -> E + T \| T; T -> T * F \| F; F -> ( E ) \| id` | LALR(1) | 12 | none | 12 states, no conflicts | `( id + id ) * id` | `( id` | ✓ |
| 5 | `S -> C C; C -> c C \| d` | LR(0) | 7 | none | 7 states, no conflicts | `d d`, `c d c d`, `c c c d d` | `d`, `c d`, `d d d` | ✓ |
| 6 | `S -> C C; C -> c C \| d` | SLR(1) | 7 | none | 7 states, no conflicts | `c d d` | `c c` | ✓ |
| 7 | `S -> C C; C -> c C \| d` | CLR(1) | 10 | none | 10 states, no conflicts | `d c d` | `d c` | ✓ |
| 8 | `S -> C C; C -> c C \| d` | LALR(1) | 7 | none | 7 states, no conflicts | `c c d c d` | `ε` | ✓ |
| 9 | `S -> ( L ) \| x; L -> S \| L , S` | LR(0) | 9 | none | 9 states, no conflicts | `( x , ( x ) , x )`, `x`, `( ( x ) )` | `( )`, `( x , )` | ✓ |
| 10 | `S -> ( L ) \| x; L -> S \| L , S` | SLR(1) | 9 | none | 9 states, no conflicts | – | – | ✓ |
| 11 | `S -> a S b \| a b` | LR(0) | 6 | none | 6 states, no conflicts | `a b`, `a a a b b b` | `a a b`, `a b a b`, `ε` | ✓ |
| 12 | `S -> a S b \| ε` | LR(0) | – | 2 shift-reduce | 5 states, 2 shift-reduce | – | – | ✓ |
| 13 | `S -> a S b \| ε` | SLR(1) | – | none | 5 states, no conflicts | `ε`, `a b`, `a a b b` | `a a b`, `b a` | ✓ |
| 14 | `S -> ( S ) S \| ε` | LR(0) | 6 | 3 shift-reduce | 6 states, 3 shift-reduce | – | – | ✓ |
| 15 | `S -> ( S ) S \| ε` | SLR(1) | 6 | none | 6 states, no conflicts | `ε`, `( )`, `( ( ) ) ( )` | `( ( )`, `) (` | ✓ |
| 16 | `S -> A a \| B b; A -> x; B -> x` | LR(0) | 7 | 4 reduce-reduce | 7 states, 4 reduce-reduce | – | – | ✓ |
| 17 | `S -> A a \| B b; A -> x; B -> x` | SLR(1) | 7 | none | 7 states, no conflicts | `x a`, `x b` | `x`, `x a b` | ✓ |
| 18 | `S -> L = R \| R; L -> * R \| id; R -> L` | LR(0) | 10 | 1 shift-reduce | 10 states, 1 shift-reduce | – | – | ✓ |
| 19 | `S -> L = R \| R; L -> * R \| id; R -> L` | SLR(1) | 10 | 1 shift-reduce | 10 states, 1 shift-reduce | `id = id`, `* id = id`, `id` | `= id` | ✓ |
| 20 | `S -> L = R \| R; L -> * R \| id; R -> L` | LALR(1) | 10 | none | 10 states, no conflicts | `* * id = * id` | `id = = id` | ✓ |
| 21 | `E -> E + E \| E * E \| ( E ) \| id` | LR(0) | – | 4 shift-reduce | 10 states, 4 shift-reduce | – | – | ✓ |
| 22 | `E -> E + E \| E * E \| ( E ) \| id` | SLR(1) | – | 4 shift-reduce | 10 states, 4 shift-reduce | `id + id * id` | `id +` | ✓ |
| 23 | `S -> i S e S \| i S \| a` | LR(0) | – | 1 shift-reduce | 7 states, 1 shift-reduce | – | – | ✓ |
| 24 | `S -> i S e S \| i S \| a` | SLR(1) | – | 1 shift-reduce | 7 states, 1 shift-reduce | `i a e a`, `i i a e a` | `e a` | ✓ |
| 25 | `L -> id , L \| id` | LR(0) | – | 1 shift-reduce | 5 states, 1 shift-reduce | – | – | ✓ |
| 26 | `L -> id , L \| id` | SLR(1) | – | none | 5 states, no conflicts | `id`, `id , id , id` | `id ,`, `, id` | ✓ |
| 27 | `L -> L , id \| id` | LR(0) | – | none | 5 states, no conflicts | `id`, `id , id , id` | `id ,`, `, id` | ✓ |
| 28 | `S -> A B; A -> a \| ε; B -> b \| ε` | LR(0) | – | 2 shift-reduce | 6 states, 2 shift-reduce | – | – | ✓ |
| 29 | `S -> A B; A -> a \| ε; B -> b \| ε` | SLR(1) | – | none | 6 states, no conflicts | `ε`, `a`, `b`, `a b` | `b a`, `a a`, `a b b` | ✓ |
| 30 | `S -> a S a \| b S b \| a \| b` | LR(0) | – | 4 shift-reduce | 8 states, 4 shift-reduce | – | – | ✓ |
| 31 | `S -> a S a \| b S b \| a \| b` | SLR(1) | – | 4 shift-reduce | 8 states, 4 shift-reduce | – | – | ✓ |
| 32 | `S -> S S + \| S S * \| a` | LR(0) | – | none | 6 states, no conflicts | `a`, `a a +`, `a a * a +`, `a a a + *` | `a +`, `a a` | ✓ |
| 33 | `A -> ( A ) \| a` | LR(0) | – | none | 6 states, no conflicts | `( ( a ) )`, `a` | `( a` | ✓ |
| 34 | `S -> x S \| y` | LR(0) | – | none | 5 states, no conflicts | `y`, `x x y` | `x`, `y x` | ✓ |
| 35 | `S -> S x \| y` | LR(0) | – | none | 4 states, no conflicts | `y`, `y x x` | `x y` | ✓ |
| 36 | `E -> E + n \| n` | LR(0) | – | none | 5 states, no conflicts | `n + n + n` | `n +` | ✓ |
| 37 | `E -> n + E \| n` | LR(0) | – | 1 shift-reduce | 5 states, 1 shift-reduce | – | – | ✓ |
| 38 | `E -> n + E \| n` | SLR(1) | – | none | 5 states, no conflicts | `n + n + n` | `+ n` | ✓ |
| 39 | `S -> A \| B; A -> a A \| b; B -> a B \| c` | LR(0) | – | none | 9 states, no conflicts | `a a b`, `c`, `a a a c` | `a`, `a b c` | ✓ |
| 40 | `S -> A \| a; A -> a` | LR(0) | – | 2 reduce-reduce | 4 states, 2 reduce-reduce | – | – | ✓ |
| 41 | `S -> A \| a; A -> a` | SLR(1) | – | 1 reduce-reduce | 4 states, 1 reduce-reduce | – | – | ✓ |
| 42 | `S -> A b \| B c; A -> ε; B -> ε` | LR(0) | – | 3 reduce-reduce | 6 states, 3 reduce-reduce | – | – | ✓ |
| 43 | `S -> A b \| B c; A -> ε; B -> ε` | SLR(1) | – | none | 6 states, no conflicts | `b`, `c` | `ε`, `b c` | ✓ |
| 44 | `S -> A a \| b A c \| d c \| b d a; A -> d` | SLR(1) | – | 2 shift-reduce | 11 states, 2 shift-reduce | – | – | ✓ |
| 45 | `S -> A a \| b A c \| d c \| b d a; A -> d` | LALR(1) | – | none | 11 states, no conflicts | `d a`, `d c`, `b d c`, `b d a` | `b a`, `b d` | ✓ |
| 46 | `S -> a A d \| b B d \| a B e \| b A e; A -> c; B -> c` | SLR(1) | – | 2 reduce-reduce | 13 states, 2 reduce-reduce | – | – | ✓ |
| 47 | `S -> a A d \| b B d \| a B e \| b A e; A -> c; B -> c` | LALR(1) | – | 2 reduce-reduce | 13 states, 2 reduce-reduce | – | – | ✓ |
| 48 | `S -> a A d \| b B d \| a B e \| b A e; A -> c; B -> c` | CLR(1) | 14 | none | 14 states, no conflicts | `a c d`, `b c d`, `a c e`, `b c e` | `a c c` | ✓ |
| 49 | `S -> S \| a` | SLR(1) | – | 1 | 3 states, 1 accept-reduce | – | – | ✓ |
| 50 | `S -> S a \| ε` | LR(0) | – | none | 3 states, no conflicts | `ε`, `a a a` | `b` | ✓ |
| 51 | `S -> a S \| ε` | LR(0) | – | 2 shift-reduce | 4 states, 2 shift-reduce | – | – | ✓ |
| 52 | `S -> a S \| ε` | SLR(1) | – | none | 4 states, no conflicts | `ε`, `a a a` | `a a b` | ✓ |
| 53 | `D -> T L; T -> int \| float; L -> L , id \| id` | LR(0) | – | 1 shift-reduce | 9 states, 1 shift-reduce | – | – | ✓ |
| 54 | `D -> T L; T -> int \| float; L -> L , id \| id` | SLR(1) | – | none | 9 states, no conflicts | `int id , id`, `float id` | `int`, `id` | ✓ |
| 55 | `S -> id = E; E -> E + id \| id` | SLR(1) | – | none | 8 states, no conflicts | `id = id + id` | `id =` | ✓ |
| 56 | `F -> id ( A ); A -> A , id \| id \| ε` | LR(0) | – | 1 shift-reduce | 9 states, 1 shift-reduce | – | – | ✓ |
| 57 | `F -> id ( A ); A -> A , id \| id \| ε` | SLR(1) | – | none | 9 states, no conflicts | `id ( )`, `id ( id , id )`, `id ( , id )` | `id ( id` | ✓ |
| 58 | `S -> b A \| a B; A -> a \| a S \| b A A; B -> b \| b S \| a B B` | SLR(1) | – | some (ambiguous) | 16 states, 4 shift-reduce | – | – | ✓ |
| 59 | `E -> T X; X -> + T X \| ε; T -> F Y; Y -> * F Y \| ε; F -> ( E ) \| id` | LR(0) | – | 4 shift-reduce | 16 states, 4 shift-reduce | – | – | ✓ |
| 60 | `E -> T X; X -> + T X \| ε; T -> F Y; Y -> * F Y \| ε; F -> ( E ) \| id` | SLR(1) | – | none | 16 states, no conflicts | `id + id * id`, `( id )` | `id *`, `ε` | ✓ |
| 61 | `S -> x x S \| x` | LR(0) | – | 1 shift-reduce | 5 states, 1 shift-reduce | – | – | ✓ |
| 62 | `S -> x x S \| x` | SLR(1) | – | none | 5 states, no conflicts | `x`, `x x x`, `x x x x x` | `x x` | ✓ |
| 63 | `S -> a; B -> b` | LR(0) | – | none | 3 states, no conflicts | `a` | `b` | ✓ |
| 64 | `S -> a S` | LR(0) | – | none | 4 states, no conflicts | – | `a a a`, `ε` | ✓ |
| 65 | `S->aSb\|ab` | LR(0) | 6 | none | 6 states, no conflicts | `a a b b`, `a b` | `a a b` | ✓ |
| 66 | `S -> a` | LR(0) | 3 | none | 3 states, no conflicts | `a` | `a a`, `ε` | ✓ |
| 67 | `S -> if E then S \| other; E -> cond` | LR(0) | – | none | 8 states, no conflicts | `if cond then other`, `if cond then if cond then other` | `if cond then` | ✓ |

**Bug found and fixed by these tests:** a glued grammar such as `S->aSb|ab` used to read `ab` as one terminal. It is now split into `a b` when both letters are terminals elsewhere in the grammar. Multi-letter terminals such as `id` stay whole. A spaced `ab` is still one terminal, but the tool now warns about it.
