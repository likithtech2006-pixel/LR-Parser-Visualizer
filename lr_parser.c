/*
 * lr_parser.c — console version of the LR parser construction engine
 * Project 7: Interactive GUI for Bottom-Up Parsing (LR Family)
 *
 * Builds LR(0), SLR(1), CLR(1) or LALR(1) parsers for a grammar read from a
 * file, prints every construction stage and parses a test string. It follows
 * the same algorithms as engine.js (which drives the web GUI), so its output
 * can be used to cross-check the GUI.
 *
 * Build:   gcc -O2 -Wall -o lr_parser lr_parser.c
 * Run:     ./lr_parser samples/expr.txt SLR1 "id + id * id"
 *          ./lr_parser samples/lalr_rr.txt LALR1 "a c d"
 *          ./lr_parser                       (built-in demo)
 *
 * Grammar file: one rule per line, e.g.  E -> E + T | T
 * Symbols are separated by spaces; "eps" or "ε" denotes an empty body.
 * Lines starting with # or // are comments.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define MAX_SYM    128   /* symbols (terminals + non-terminals)           */
#define MAX_TERM    64   /* terminals incl. $  (lookaheads are a bitset)   */
#define MAX_PROD   128
#define MAX_RHS     24
#define MAX_ITEMS  256   /* items per state                                */
#define MAX_STATES 1024
#define MAX_TRANS  (MAX_STATES * 16)
#define MAX_ACT      4   /* actions kept per table cell                    */

typedef unsigned long long Set;            /* bitset over terminal indices */
#define BIT(t) (1ULL << (t))

typedef struct { int lhs, n, rhs[MAX_RHS]; } Prod;
typedef struct { int p, dot; Set la; } Item;
typedef struct { Item it[MAX_ITEMS]; int n, nk; int from, via; char name[24]; } State;
typedef struct { int from, sym, to; } Trans;
typedef struct { int n; char kind[MAX_ACT]; int val[MAX_ACT]; } Cell; /* kind: s r a */

static char names[MAX_SYM][32];
static int  nsym, isNT[MAX_SYM], termIdx[MAX_SYM], termSym[MAX_TERM], nterm;
static Prod prods[MAX_PROD];
static int  nprod;
static Set  first[MAX_SYM], follow[MAX_SYM];
static int  nullable[MAX_SYM];

static State states[MAX_STATES];      /* canonical collection (LR(0) or LR(1)) */
static int   nstates;
static Trans trans[MAX_TRANS];
static int   ntrans;

static State merged[MAX_STATES];      /* LALR(1) states */
static int   nmerged, toMerged[MAX_STATES], mcount[MAX_STATES];
static Trans mtrans[MAX_TRANS];
static int   nmtrans;

static Cell action[MAX_STATES][MAX_TERM];
static int  gotoTab[MAX_STATES][MAX_SYM];

/* ------------------------------------------------------------------ */
/*  Grammar input                                                      */
/* ------------------------------------------------------------------ */

static void die(const char *msg) { fprintf(stderr, "error: %s\n", msg); exit(1); }

static int intern(const char *s) {
    for (int i = 0; i < nsym; i++) if (strcmp(names[i], s) == 0) return i;
    if (nsym >= MAX_SYM) die("too many symbols");
    strncpy(names[nsym], s, 31);
    termIdx[nsym] = -1;
    return nsym++;
}

static int isEps(const char *s) {
    /* ε is also commonly typed as ϵ, ɛ or ∈ (element-of) */
    return !strcmp(s, "eps") || !strcmp(s, "epsilon") || !strcmp(s, "ε") || !strcmp(s, "ϵ") ||
           !strcmp(s, "ɛ") || !strcmp(s, "∈") || !strcmp(s, "λ");
}

static char *trim(char *s) {
    while (isspace((unsigned char)*s)) s++;
    char *e = s + strlen(s);
    while (e > s && isspace((unsigned char)e[-1])) *--e = 0;
    return s;
}

/* Splits "A -> body" into lhs and body; accepts -> and → . */
static int splitRule(char *line, char **lhs, char **body) {
    char *a = strstr(line, "->");
    int alen = 2;
    char *b = strstr(line, "\xe2\x86\x92");   /* UTF-8 for → */
    if (!a || (b && b < a)) { a = b; alen = 3; }
    if (!a) return 0;
    *a = 0;
    *lhs = trim(line);
    *body = trim(a + alen);
    return **lhs != 0 && strchr(*lhs, ' ') == NULL;
}

static void loadGrammar(const char *text) {
    char *copy = strdup(text), *save = NULL;
    char lhsNames[MAX_PROD][32];
    int nl = 0;

    /* Pass 1: collect left-hand sides (these are the non-terminals). */
    char *buf = strdup(text);
    for (char *ln = strtok_r(buf, "\n", &save); ln; ln = strtok_r(NULL, "\n", &save)) {
        char *t = trim(ln), *l, *b;
        if (!*t || *t == '#' || !strncmp(t, "//", 2)) continue;
        if (!splitRule(t, &l, &b)) continue;
        int seen = 0;
        for (int i = 0; i < nl; i++) if (!strcmp(lhsNames[i], l)) seen = 1;
        if (!seen) { strncpy(lhsNames[nl], l, 31); lhsNames[nl][31] = 0; nl++; }
    }
    free(buf);
    if (!nl) die("no productions found (expected lines like  E -> E + T | T)");

    /* Augmented start symbol S' (more primes if needed). */
    char aug[40];
    snprintf(aug, sizeof aug, "%s'", lhsNames[0]);
    for (int i = 0; i < nl; i++) if (!strcmp(lhsNames[i], aug)) { strcat(aug, "'"); i = -1; }

    int end = intern("$");
    termIdx[end] = nterm; termSym[nterm++] = end;
    int augId = intern(aug);
    isNT[augId] = 1;
    for (int i = 0; i < nl; i++) isNT[intern(lhsNames[i])] = 1;

    prods[0].lhs = augId; prods[0].n = 1; prods[0].rhs[0] = intern(lhsNames[0]);
    nprod = 1;

    /* Pass 2: productions. */
    save = NULL;
    for (char *ln = strtok_r(copy, "\n", &save); ln; ln = strtok_r(NULL, "\n", &save)) {
        char *t = trim(ln), *l, *body;
        if (!*t || *t == '#' || !strncmp(t, "//", 2)) continue;
        if (!splitRule(t, &l, &body)) { fprintf(stderr, "skipping unreadable line: %s\n", t); continue; }
        int lhs = intern(l);
        char *altSave = NULL;
        /* strtok_r would merge empty alternatives, so split on '|' by hand. */
        for (char *alt = body; alt; alt = altSave) {
            char *bar = strchr(alt, '|');
            if (bar) { *bar = 0; altSave = bar + 1; } else altSave = NULL;
            if (nprod >= MAX_PROD) die("too many productions");
            Prod *p = &prods[nprod];
            p->lhs = lhs; p->n = 0;
            char *tokSave = NULL;
            for (char *tok = strtok_r(alt, " \t", &tokSave); tok; tok = strtok_r(NULL, " \t", &tokSave)) {
                if (isEps(tok)) continue;
                if (!strcmp(tok, "$")) die("'$' is reserved for end of input");
                if (p->n >= MAX_RHS) die("production too long");
                int s = intern(tok);
                if (!isNT[s] && termIdx[s] < 0) {
                    if (nterm >= MAX_TERM) die("too many terminals (max 63)");
                    termIdx[s] = nterm; termSym[nterm++] = s;
                }
                p->rhs[p->n++] = s;
            }
            int dup = 0;
            for (int q = 1; q < nprod; q++)
                if (prods[q].lhs == p->lhs && prods[q].n == p->n && !memcmp(prods[q].rhs, p->rhs, sizeof(int) * p->n)) dup = 1;
            if (!dup) nprod++;
        }
    }
    free(copy);
}

/* ------------------------------------------------------------------ */
/*  FIRST / FOLLOW                                                     */
/* ------------------------------------------------------------------ */

/* FIRST(rhs[k..]) of production p, followed by `tail` if that is nullable. */
static Set firstSeq(int p, int k, Set tail, int *isNullable) {
    Set s = 0;
    for (; k < prods[p].n; k++) {
        int X = prods[p].rhs[k];
        if (!isNT[X]) { s |= BIT(termIdx[X]); if (isNullable) *isNullable = 0; return s; }
        s |= first[X];
        if (!nullable[X]) { if (isNullable) *isNullable = 0; return s; }
    }
    if (isNullable) *isNullable = 1;
    return s | tail;
}

static void computeFirstFollow(void) {
    int changed = 1;
    while (changed) {
        changed = 0;
        for (int p = 0; p < nprod; p++) {
            int A = prods[p].lhs, nl;
            Set f = firstSeq(p, 0, 0, &nl);
            if ((first[A] | f) != first[A]) { first[A] |= f; changed = 1; }
            if (nl && !nullable[A]) { nullable[A] = 1; changed = 1; }
        }
    }
    follow[prods[0].lhs] = BIT(0);
    changed = 1;
    while (changed) {
        changed = 0;
        for (int p = 0; p < nprod; p++)
            for (int k = 0; k < prods[p].n; k++) {
                int B = prods[p].rhs[k], nl;
                if (!isNT[B]) continue;
                Set f = firstSeq(p, k + 1, 0, &nl);
                if (nl) f |= follow[prods[p].lhs];
                if ((follow[B] | f) != follow[B]) { follow[B] |= f; changed = 1; }
            }
    }
}

/* ------------------------------------------------------------------ */
/*  Items, closure, GOTO, canonical collection                         */
/* ------------------------------------------------------------------ */

static int nextSym(const Item *it) { return it->dot < prods[it->p].n ? prods[it->p].rhs[it->dot] : -1; }

static int findItem(const State *s, int p, int dot) {
    for (int i = 0; i < s->n; i++) if (s->it[i].p == p && s->it[i].dot == dot) return i;
    return -1;
}

static void closure(State *s, int lr1) {
    int changed = 1;
    while (changed) {
        changed = 0;
        for (int i = 0; i < s->n; i++) {
            int B = nextSym(&s->it[i]);
            if (B < 0 || !isNT[B]) continue;
            Set la = lr1 ? firstSeq(s->it[i].p, s->it[i].dot + 1, s->it[i].la, NULL) : 0;
            for (int q = 0; q < nprod; q++) {
                if (prods[q].lhs != B) continue;
                int j = findItem(s, q, 0);
                if (j < 0) {
                    if (s->n >= MAX_ITEMS) die("too many items in a state");
                    s->it[s->n++] = (Item){ q, 0, la };
                    changed = 1;
                } else if ((s->it[j].la | la) != s->it[j].la) {
                    s->it[j].la |= la;
                    changed = 1;
                }
            }
        }
    }
}

/* Same kernel?  withLa = compare lookaheads too (CLR), else cores only. */
static int sameKernel(const State *a, const State *b, int withLa) {
    if (a->nk != b->nk) return 0;
    for (int i = 0; i < a->nk; i++) {
        int j = findItem(b, a->it[i].p, a->it[i].dot);
        if (j < 0 || j >= b->nk || (withLa && b->it[j].la != a->it[i].la)) return 0;
    }
    return 1;
}

static void buildCollection(int lr1) {
    State *s0 = &states[0];
    s0->n = s0->nk = 1;
    s0->it[0] = (Item){ 0, 0, BIT(0) };
    s0->from = s0->via = -1;
    closure(s0, lr1);
    nstates = 1;

    for (int i = 0; i < nstates; i++) {
        int done[MAX_SYM] = {0};
        for (int k = 0; k < states[i].n; k++) {
            int X = nextSym(&states[i].it[k]);
            if (X < 0 || done[X]) continue;
            done[X] = 1;
            if (nstates >= MAX_STATES) die("too many states");
            State *ns = &states[nstates];
            ns->n = 0;
            for (int m = 0; m < states[i].n; m++)
                if (nextSym(&states[i].it[m]) == X)
                    ns->it[ns->n++] = (Item){ states[i].it[m].p, states[i].it[m].dot + 1, states[i].it[m].la };
            ns->nk = ns->n;
            int target = -1;
            for (int j = 0; j < nstates; j++) if (sameKernel(&states[j], ns, lr1)) { target = j; break; }
            if (target < 0) {
                closure(ns, lr1);
                ns->from = i; ns->via = X;
                target = nstates++;
            }
            trans[ntrans++] = (Trans){ i, X, target };
        }
    }
    for (int i = 0; i < nstates; i++) snprintf(states[i].name, sizeof states[i].name, "%d", i);
}

static void mergeLALR(void) {
    nmerged = 0;
    for (int i = 0; i < nstates; i++) {
        int m = -1;
        for (int j = 0; j < nmerged; j++) if (sameKernel(&merged[j], &states[i], 0)) { m = j; break; }
        if (m < 0) {
            m = nmerged++;
            merged[m] = states[i];
            mcount[m] = 1;
            snprintf(merged[m].name, sizeof merged[m].name, "%d", i);
        } else {
            for (int k = 0; k < states[i].n; k++) {
                int j = findItem(&merged[m], states[i].it[k].p, states[i].it[k].dot);
                merged[m].it[j].la |= states[i].it[k].la;
            }
            mcount[m]++;
            size_t len = strlen(merged[m].name);
            snprintf(merged[m].name + len, sizeof merged[m].name - len, "%s%d", i < 10 ? "" : ",", i);
        }
        toMerged[i] = m;
    }
    for (int t = 0; t < ntrans; t++) {
        int f = toMerged[trans[t].from], to = toMerged[trans[t].to], dup = 0;
        for (int u = 0; u < nmtrans; u++) if (mtrans[u].from == f && mtrans[u].sym == trans[t].sym) dup = 1;
        if (!dup) mtrans[nmtrans++] = (Trans){ f, trans[t].sym, to };
    }
}

/* ------------------------------------------------------------------ */
/*  ACTION / GOTO table                                                */
/* ------------------------------------------------------------------ */

static void addAction(int s, int t, char kind, int val) {
    Cell *c = &action[s][t];
    for (int i = 0; i < c->n; i++) if (c->kind[i] == kind && c->val[i] == val) return;
    if (c->n < MAX_ACT) { c->kind[c->n] = kind; c->val[c->n] = val; c->n++; }
}

/* mode: 0 = LR(0), 1 = SLR(1), 2 = CLR(1)/LALR(1) */
static void buildTable(State *S, int ns, Trans *T, int nt, int mode) {
    memset(action, 0, sizeof action);
    for (int i = 0; i < ns; i++) for (int x = 0; x < nsym; x++) gotoTab[i][x] = -1;
    for (int t = 0; t < nt; t++) {
        if (isNT[T[t].sym]) gotoTab[T[t].from][T[t].sym] = T[t].to;
        else addAction(T[t].from, termIdx[T[t].sym], 's', T[t].to);
    }
    for (int i = 0; i < ns; i++)
        for (int k = 0; k < S[i].n; k++) {
            Item *it = &S[i].it[k];
            if (it->dot != prods[it->p].n) continue;
            if (it->p == 0) { addAction(i, 0, 'a', 0); continue; }
            Set la = mode == 0 ? ~0ULL : mode == 1 ? follow[prods[it->p].lhs] : it->la;
            for (int a = 0; a < nterm; a++) if (la & BIT(a)) addAction(i, a, 'r', it->p);
        }
}

/* ------------------------------------------------------------------ */
/*  Printing                                                           */
/* ------------------------------------------------------------------ */

static void printSet(Set s) {
    printf("{");
    int first_ = 1;
    for (int t = 1; t < nterm; t++) if (s & BIT(t)) { printf(first_ ? " %s" : ", %s", names[termSym[t]]); first_ = 0; }
    if (s & BIT(0)) printf(first_ ? " $" : ", $");
    printf(" }");
}

static void printProd(int p) {
    printf("%s ->", names[prods[p].lhs]);
    if (!prods[p].n) printf(" eps");
    for (int k = 0; k < prods[p].n; k++) printf(" %s", names[prods[p].rhs[k]]);
}

static void printItem(const Item *it, int withLa) {
    printf("    %s ->", names[prods[it->p].lhs]);
    if (prods[it->p].n == 0) printf(" eps .");          /* ε-item A -> eps . (reduce) */
    else for (int k = 0; k <= prods[it->p].n; k++) {
        if (k == it->dot) printf(" .");
        if (k < prods[it->p].n) printf(" %s", names[prods[it->p].rhs[k]]);
    }
    if (withLa) {
        printf("   ,");
        int first_ = 1;
        for (int t = 1; t < nterm; t++) if (it->la & BIT(t)) { printf(first_ ? " %s" : "/%s", names[termSym[t]]); first_ = 0; }
        if (it->la & BIT(0)) printf(first_ ? " $" : "/$");
    }
    printf("   (r%d)\n", it->p);
}

static void printStates(State *S, int ns, Trans *T, int nt, int withLa) {
    for (int i = 0; i < ns; i++) {
        printf("\nI%s", S[i].name);
        if (S[i].from >= 0) printf("  = GOTO(I%s, %s)", S[S[i].from].name, names[S[i].via]);
        printf("\n");
        for (int k = 0; k < S[i].n; k++) {
            if (k == S[i].nk && S[i].nk < S[i].n) printf("    ---- closure ----\n");
            printItem(&S[i].it[k], withLa);
        }
        for (int t = 0; t < nt; t++)
            if (T[t].from == i) printf("      on %-6s -> I%s\n", names[T[t].sym], S[T[t].to].name);
    }
}

static void cellText(const Cell *c, char *out) {
    out[0] = 0;
    for (int i = 0; i < c->n; i++) {
        char b[16];
        if (c->kind[i] == 'a') strcpy(b, "acc");
        else snprintf(b, sizeof b, "%c%d", c->kind[i], c->val[i]);
        if (i) strcat(out, "/");
        strcat(out, b);
    }
}

static int printTable(State *S, int ns, const char *variant) {
    printf("\n=== %s ACTION / GOTO TABLE ===\n\n%-7s|", variant, "State");
    for (int t = 1; t < nterm; t++) printf(" %-7s", names[termSym[t]]);
    printf(" %-7s|", "$");
    for (int x = 0; x < nsym; x++) if (isNT[x] && x != prods[0].lhs) printf(" %-5s", names[x]);
    printf("\n");
    int conflicts = 0, sr = 0, rr = 0;
    for (int i = 0; i < ns; i++) {
        char lbl[32];
        snprintf(lbl, sizeof lbl, "I%s", S[i].name);
        printf("%-7s|", lbl);
        for (int k = 1; k <= nterm; k++) {
            int t = k % nterm;               /* print $ last */
            char txt[64];
            cellText(&action[i][t], txt);
            printf(" %-7s", action[i][t].n > 1 ? strcat(txt, "!") : txt);
            if (k == nterm) printf("|");
        }
        for (int x = 0; x < nsym; x++) {
            if (!isNT[x] || x == prods[0].lhs) continue;
            if (gotoTab[i][x] >= 0) printf(" %-5s", S[gotoTab[i][x]].name); else printf(" %-5s", "");
        }
        printf("\n");
    }
    printf("\n");
    for (int i = 0; i < ns; i++)
        for (int t = 0; t < nterm; t++) {
            Cell *c = &action[i][t];
            if (c->n < 2) continue;
            int shifts = 0, reduces = 0;
            for (int k = 0; k < c->n; k++) { if (c->kind[k] == 's') shifts++; if (c->kind[k] == 'r') reduces++; }
            char txt[64];
            cellText(c, txt);
            const char *type = shifts && reduces > 1 ? "shift-reduce + reduce-reduce" : shifts && reduces ? "shift-reduce" : "reduce-reduce";
            printf("CONFLICT (%s) in ACTION[I%s, %s] = %s\n", type, S[i].name, names[termSym[t]], txt);
            conflicts++;
            if (shifts && reduces) sr++;
            if (reduces > 1) rr++;
        }
    if (conflicts) printf("\n=> %d conflict(s) (%d shift-reduce, %d reduce-reduce): the grammar is NOT %s.\n", conflicts, sr, rr, variant);
    else printf("=> No conflicts: the grammar is %s.\n", variant);
    return conflicts;
}

/* ------------------------------------------------------------------ */
/*  Parsing                                                            */
/* ------------------------------------------------------------------ */

/* Bounded string append (never overflows dst). */
static void append(char *dst, size_t cap, const char *src) {
    size_t len = strlen(dst);
    if (len + 1 < cap) strncat(dst, src, cap - len - 1);
}

static void parse(State *S, const char *input) {
    int tok[256], ntok = 0;
    char *copy = strdup(input), *save = NULL;
    for (char *w = strtok_r(copy, " \t", &save); w; w = strtok_r(NULL, " \t", &save)) {
        int s = -1;
        for (int x = 0; x < nsym; x++) if (!strcmp(names[x], w) && !isNT[x]) s = x;
        if (s < 0) { printf("\nUnknown token '%s' (input symbols must be separated by spaces).\nREJECT.\n", w); free(copy); return; }
        if (ntok < 255) tok[ntok++] = termIdx[s];
    }
    free(copy);
    tok[ntok++] = 0;

    int stS[512], stX[512], top = 0, pos = 0;
    stS[0] = 0; stX[0] = -1;
    printf("\n=== PARSING \"%s\" ===\n\n%-4s %-38s %-22s %s\n", input, "#", "Stack", "Input", "Action");
    for (int step = 1; step < 2000 && top < 510; step++) {
        char stack[1024] = "", in[1024] = "", act[256] = "", b[64];
        for (int i = 0; i <= top; i++) {
            if (stX[i] >= 0) { snprintf(b, sizeof b, "%s ", names[stX[i]]); append(stack, sizeof stack, b); }
            snprintf(b, sizeof b, "%s ", S[stS[i]].name);
            append(stack, sizeof stack, b);
        }
        for (int i = pos; i < ntok; i++) { append(in, sizeof in, names[termSym[tok[i]]]); append(in, sizeof in, " "); }

        Cell *c = &action[stS[top]][tok[pos]];
        if (c->n == 0) {
            printf("%-4d %-38s %-22s ERROR: ACTION[I%s, %s] is empty\n", step, stack, in, S[stS[top]].name, names[termSym[tok[pos]]]);
            printf("\nREJECT: syntax error at token %d ('%s'). Expected one of:", pos + 1, names[termSym[tok[pos]]]);
            for (int t = 1; t <= nterm; t++) if (action[stS[top]][t % nterm].n) printf(" %s", names[termSym[t % nterm]]);
            printf("\n");
            return;
        }
        int pick = 0;   /* resolve conflicts like YACC: shift, else earliest production */
        for (int k = 0; k < c->n; k++) {
            if (c->kind[k] == 's') { pick = k; break; }
            if (c->kind[k] == 'r' && c->kind[pick] == 'r' && c->val[k] < c->val[pick]) pick = k;
        }
        char kind = c->kind[pick];
        int val = c->val[pick];
        if (kind == 'a') {
            printf("%-4d %-38s %-22s ACCEPT\n\nACCEPT: the string is in the language.\n", step, stack, in);
            return;
        }
        if (kind == 's') {
            snprintf(act, sizeof act, "shift %s, go to %s", names[termSym[tok[pos]]], S[val].name);
            top++;
            stS[top] = val; stX[top] = termSym[tok[pos]]; pos++;
        } else {
            snprintf(act, sizeof act, "reduce r%d (%s ->", val, names[prods[val].lhs]);
            for (int k = 0; k < prods[val].n; k++) { append(act, sizeof act, " "); append(act, sizeof act, names[prods[val].rhs[k]]); }
            append(act, sizeof act, prods[val].n ? ")" : " eps)");
            top -= prods[val].n;
            int g = gotoTab[stS[top]][prods[val].lhs];
            if (g < 0) { printf("%-4d %-38s %-22s %s: missing GOTO\n", step, stack, in, act); return; }
            top++;
            stS[top] = g; stX[top] = prods[val].lhs;
        }
        printf("%-4d %-38s %-22s %s%s\n", step, stack, in, act, c->n > 1 ? "   [conflict resolved]" : "");
    }
    printf("REJECT: step limit reached.\n");
}

/* ------------------------------------------------------------------ */

static const char *DEMO =
    "E -> E + T | T\n"
    "T -> T * F | F\n"
    "F -> ( E ) | id\n";

static char *readFile(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); exit(1); }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    rewind(f);
    char *buf = malloc(n + 1);
    if (fread(buf, 1, n, f) != (size_t)n) die("could not read grammar file");
    buf[n] = 0;
    fclose(f);
    return buf;
}

int main(int argc, char **argv) {
    const char *variant = argc > 2 ? argv[2] : "SLR1";
    const char *input = argc > 3 ? argv[3] : (argc > 1 ? NULL : "id + id * id");
    char *text = argc > 1 ? readFile(argv[1]) : strdup(DEMO);

    int mode, lr1, lalr = 0;
    const char *vname;
    if (!strcmp(variant, "LR0")) { mode = 0; lr1 = 0; vname = "LR(0)"; }
    else if (!strcmp(variant, "SLR1")) { mode = 1; lr1 = 0; vname = "SLR(1)"; }
    else if (!strcmp(variant, "CLR1")) { mode = 2; lr1 = 1; vname = "CLR(1)"; }
    else if (!strcmp(variant, "LALR1")) { mode = 2; lr1 = 1; lalr = 1; vname = "LALR(1)"; }
    else { fprintf(stderr, "usage: %s [grammar.txt] [LR0|SLR1|CLR1|LALR1] [\"input string\"]\n", argv[0]); return 1; }

    loadGrammar(text);
    free(text);
    computeFirstFollow();

    printf("=== AUGMENTED GRAMMAR ===\n");
    for (int p = 0; p < nprod; p++) { printf("  r%-3d", p); printProd(p); printf("\n"); }

    printf("\n=== FIRST / FOLLOW ===\n");
    for (int x = 0; x < nsym; x++) {
        if (!isNT[x] || x == prods[0].lhs) continue;
        printf("  %-6s FIRST = ", names[x]);
        printSet(first[x]);
        if (nullable[x]) printf(" + eps");
        printf("   FOLLOW = ");
        printSet(follow[x]);
        printf("\n");
    }

    buildCollection(lr1);
    printf("\n=== CANONICAL COLLECTION OF %s ITEMS (%d states) ===\n", lr1 ? "LR(1)" : "LR(0)", nstates);
    printStates(states, nstates, trans, ntrans, lr1);

    State *S = states;
    int ns = nstates;
    if (lalr) {
        mergeLALR();
        printf("\n=== LALR(1) MERGE: %d CLR(1) states -> %d LALR(1) states ===\n", nstates, nmerged);
        for (int m = 0; m < nmerged; m++)
            if (mcount[m] > 1) printf("  %d CLR states with the same core -> I%s\n", mcount[m], merged[m].name);
        for (int m = 0; m < nmerged; m++) if (merged[m].from >= 0) merged[m].from = toMerged[merged[m].from];
        printStates(merged, nmerged, mtrans, nmtrans, 1);
        buildTable(merged, nmerged, mtrans, nmtrans, mode);
        S = merged; ns = nmerged;
    } else {
        buildTable(states, nstates, trans, ntrans, mode);
    }
    printTable(S, ns, vname);
    if (input) parse(S, input);
    return 0;
}
