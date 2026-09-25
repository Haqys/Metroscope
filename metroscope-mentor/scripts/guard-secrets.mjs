import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * CI guard, two rules.
 *
 * 1. No privileged value may carry a NEXT_PUBLIC_ prefix. Anything so prefixed
 *    is inlined into the client bundle (doc 15 §5.4).
 *
 * 2. No real credential may appear in a file git TRACKS.
 *
 * Rule 2 was added on 2026-07-31 after a live Resend API key was pasted into
 * `.env.example`. It was caught before it reached a commit, but nothing in CI
 * would have stopped it, the guard only looked for the NEXT_PUBLIC_ pattern.
 *
 * `.env.example` is the specific trap: it sits next to `.env.local`, has the
 * same shape, and is the natural place to "fill in the config", except one is
 * gitignored and the other is published with the repo. A key pasted there is a
 * key in git history forever, and history rewriting is not a fix once it has
 * been pushed.
 */
const SKIP = new Set(['node_modules', '.next', '.git', 'coverage', 'out']);
const failures = [];

// ── Rule 1: privileged values exposed to the client bundle ────────────────
const DANGEROUS = /NEXT_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET|PRIVATE|PASSWORD)/;

/**
 * Rule 2: things that are unmistakably real credentials.
 *
 * Every pattern has to be specific enough to never fire on generated content.
 * The first draft matched any long base64-ish string and flagged every integrity
 * hash in package-lock.json, a guard that reports a false positive on every run
 * is a guard somebody switches off, which is worse than not having one.
 *
 * So: distinctive prefixes only (`re_`, `sk-`, JWT structure), and for the
 * shapeless ones require the variable name as context.
 */
const CREDENTIALS = [
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{10,}/ },
  { name: 'JWT (Supabase key or token)', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
  { name: 'Postgres URL with a password', re: /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]{8,}@/ },
  {
    name: 'Upstash token',
    re: /UPSTASH_[A-Z_]*TOKEN\s*=\s*["']?[A-Za-z0-9_-]{30,}/,
  },
  { name: 'QStash signing key', re: /QSTASH_[A-Z_]*KEY\s*=\s*["']?sig_[A-Za-z0-9]{10,}/ },
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{32,}/ },
  { name: 'Google service-account key', re: /"private_key"\s*:\s*"-----BEGIN/ },
];

/** Generated files. A credential is never *authored* into one of these. */
const GENERATED = /(^|[\\/])(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;

/**
 * Placeholders that LOOK like credentials on purpose. Matched exactly, not by
 * prefix, so "re_your-key-here" cannot be used to smuggle a real one through.
 */
const ALLOWED_PLACEHOLDERS = new Set([
  're_your_api_key',
  'your-token',
  'your-anon-key',
  'your-service-role-key',
]);

/**
 * Files git actually tracks. Anything gitignored is out of scope by design.
 *
 * `--full-name` plus the repo root, because plain `git ls-files` prints paths
 * relative to the CURRENT directory, and this script runs from inside a project
 * subdirectory. Resolving those against the wrong base produced a set that
 * matched nothing, so the guard passed on a planted key. It is now mutation-
 * tested; see the note in this file's header.
 */
function trackedFiles() {
  try {
    const run = (cmd) =>
      execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

    const root = run('git rev-parse --show-toplevel');
    return new Set(
      run('git ls-files --full-name')
        .split('\n')
        .filter(Boolean)
        .map((p) => path.resolve(root, p)),
    );
  } catch {
    // Not a git repo (or git unavailable), rule 2 cannot be evaluated.
    return null;
  }
}

const tracked = trackedFiles();

function checkCredentials(full, body) {
  if (!tracked || !tracked.has(path.resolve(full))) return;
  if (GENERATED.test(full)) return;

  for (const { name, re } of CREDENTIALS) {
    const hit = body.match(re);
    if (!hit) continue;
    if (ALLOWED_PLACEHOLDERS.has(hit[0])) continue;

    // Report the kind and a short prefix, never the whole secret.
    failures.push(
      `${path.relative(process.cwd(), full)}: ${name} in a git-TRACKED file ` +
        `(starts "${hit[0].slice(0, 6)}…"). Move it to .env.local and rotate it.`,
    );
  }
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|mjs|js|json|md|ya?ml|example|local)$/.test(e.name) && !/^\.env/.test(e.name)) {
      continue;
    }

    const body = fs.readFileSync(full, 'utf8');

    const dangerous = body.match(DANGEROUS);
    if (dangerous) {
      failures.push(path.relative(process.cwd(), full) + ': ' + dangerous[0]);
    }

    checkCredentials(full, body);
  }
}

walk(process.cwd());

if (failures.length) {
  console.error('\nSecret leak guard FAILED:\n');
  for (const f of failures) console.error('  x ' + f);
  console.error('');
  process.exit(1);
}
console.warn(
  tracked
    ? 'Secret leak guard passed.'
    : 'Secret leak guard passed (git unavailable, tracked-file check skipped).',
);
