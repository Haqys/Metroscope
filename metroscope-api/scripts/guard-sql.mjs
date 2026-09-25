import fs from 'fs';
import path from 'path';

/**
 * CI guard: no stray backtick inside a `sql` template literal.
 *
 * A backtick in a comment inside sql`…`, writing `users` to mean the table,
 * ends the JavaScript string. What follows is parsed as code, and the error you
 * get is a syntax error somewhere else in the file, which reads like a typo
 * rather than like a comment.
 *
 * This has now cost five tasks: §3.1 hit it twice, §3.5 once, §3.6 once, and
 * the /me endpoints once. Use `--` SQL comments in there, without backticks.
 *
 * ── Why the previous version of this file reported a pass ──
 *
 * It matched /sql`([\s\S]*?)`/ and then asked whether the captured body
 * contained a backtick. It never can. The match is non-greedy, so it stops at
 * the FIRST backtick, which is precisely the stray one, and the body it
 * inspected was the text before it. The guard was asking a question whose
 * answer is always no, and it printed "SQL template guard passed" over a file
 * that would not parse. The fifth occurrence went straight past it.
 *
 * ── What it does instead ──
 *
 * A scanner cannot tell a stray backtick from a closing one by looking at the
 * backtick: both end the literal, which is the whole problem. It can tell by
 * looking at what FOLLOWS. A real closing backtick is followed by JavaScript,
 * `)`, `,`, `;`, `.as(`, a newline. A stray one inside prose is followed by
 * the rest of the word, `outbox_message.payload` continues with `o`.
 *
 * That test only works on top of a scanner that finds the REAL end of the
 * literal, which means walking `${…}` interpolations and the strings nested in
 * them: `lib/db/rls.ts` legitimately interpolates a template inside a template
 * (`${`privileged.${operation}`}`), and a regex reads its inner backtick as
 * the end.
 */
const ROOTS = ['modules', 'app', 'lib'];
const failures = [];

/**
 * Word characters after the terminator mean the literal ended in the middle of
 * an identifier, which is what an inline code span in a comment looks like.
 */
const CONTINUES_A_WORD = /^[A-Za-z0-9_]/;

/**
 * Walk a template literal from just after its opening backtick and return the
 * index of the backtick that ends it, or -1 if the file runs out.
 *
 * Handles escapes and `${…}`, including strings and further templates nested
 * inside an interpolation. It does NOT try to be a JavaScript parser: it only
 * needs to agree with one about where this literal stops.
 */
function endOfTemplate(src, start) {
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') return i;
    if (c === '$' && src[i + 1] === '{') {
      i = endOfInterpolation(src, i + 2);
      if (i < 0) return -1;
      continue;
    }
    i++;
  }
  return -1;
}

/** From just after `${`, return the index after the matching `}`. */
function endOfInterpolation(src, start) {
  let i = start;
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    } else if (c === '`') {
      const end = endOfTemplate(src, i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (c === "'" || c === '"') {
      i = endOfQuoted(src, i + 1, c);
      if (i < 0) return -1;
      continue;
    }
    i++;
  }
  return -1;
}

/** From just after an opening quote, return the index after the closing one. */
function endOfQuoted(src, start, quote) {
  let i = start;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return -1;
}

/**
 * `sql` must be its own identifier.
 *
 * Without this, every comment that names a policy file matches: the last four
 * characters of "`96_materials.sql`" are literally sql followed by a backtick,
 * and twenty-one such comments in this codebase were reported as broken code.
 */
function isTaggedTemplateStart(src, index) {
  const before = src[index - 1];
  return before === undefined || !/[A-Za-z0-9_$.]/.test(before);
}

function scan(src) {
  const hits = [];
  for (let i = src.indexOf('sql`'); i !== -1; i = src.indexOf('sql`', i + 1)) {
    if (!isTaggedTemplateStart(src, i)) continue;
    const end = endOfTemplate(src, i + 4);
    if (end < 0) {
      hits.push(i);
      continue;
    }
    if (CONTINUES_A_WORD.test(src.slice(end + 1))) hits.push(i);
  }
  return hits;
}

function check(file) {
  const src = fs.readFileSync(file, 'utf8');
  for (const index of scan(src)) {
    const line = src.slice(0, index).split('\n').length;
    failures.push(`${path.relative(process.cwd(), file).replace(/\\/g, '/')}:${line}`);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/node_modules|\.next/.test(full)) walk(full);
    } else if (entry.name.endsWith('.ts')) {
      check(full);
    }
  }
}

/**
 * The guard guards itself.
 *
 * A checker that silently stops checking is worse than no checker, which is the
 * whole story above. So the detector runs against known-bad and known-good
 * inputs, including the two shapes that made the previous version useless, an
 * inline code span in a SQL comment, and a template nested in an
 * interpolation, before it is trusted with the codebase.
 */
function selfTest() {
  const cases = [
    ['a stray backtick in a SQL comment', 'const q = sql`SELECT 1 -- `users` is it\n`;', 1],
    ['a plain template', 'const q = sql`SELECT 1`;', 0],
    ['a method call after it', 'const q = sql`SELECT 1`.as("x");', 0],
    ['an interpolation', 'const q = sql`SELECT ${id}::uuid`;', 0],
    ['a template nested in an interpolation', 'const q = sql`A ${`b.${c}`} d`;\n', 0],
    ['a policy filename in prose', '/* see `96_materials.sql` for the rule */\nconst x = 1;', 0],
    ['an escaped backtick', 'const q = sql`SELECT 1`;\nconst s = "x`y";', 0],
  ];
  let broken = false;
  for (const [name, src, expected] of cases) {
    const got = scan(src).length;
    if (got !== expected) {
      console.error(
        `SQL template guard self-test failed: ${name} (expected ${expected}, got ${got})`,
      );
      broken = true;
    }
  }
  if (broken) process.exit(1);
}

selfTest();

for (const root of ROOTS) walk(path.join(process.cwd(), root));

if (failures.length > 0) {
  console.error('Backtick inside a sql`…` template. It ends the JS string:\n');
  for (const f of failures) console.error(`  ${f}`);
  console.error('\nUse -- SQL comments there, without backticks.');
  process.exit(1);
}

console.log('SQL template guard passed.');
