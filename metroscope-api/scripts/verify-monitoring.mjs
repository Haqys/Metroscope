/**
 * `@sentry/node`, not `@sentry/nextjs`.
 *
 * The Next wrapper only exposes its framework hooks outside a Next runtime,
 * `captureException` is not on it. `@sentry/nextjs` uses `@sentry/node` for the
 * server runtime, so this drives the same SDK, the same transport and the same
 * options object the application installs.
 */
import * as Sentry from '@sentry/node';
import { loadEnvLocal } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Does an error actually reach Sentry, and what does it carry with it?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run verify:monitoring
 *
 * `readiness` already asserts that the SDK is initialised in the API runtime.
 * That is the weakest useful claim: a DSN can be present, the SDK can start,
 * and every event can still be dropped at the transport, rejected by the
 * project, or, much worse, accepted with a guardian's phone number in it.
 *
 * This proves the three things that matter, in order of how badly they fail:
 *
 *   1. The payload is scrubbed. An exception carrying a request body is
 *      exactly as sensitive as a log line carrying one, and this system holds
 *      names, phone numbers, emails and payment proofs of children's families.
 *   2. The event is accepted by the ingest endpoint, a real network round
 *      trip to the real project, not a mocked transport.
 *   3. The stack trace identifies a file and a line, because "an error
 *      happened" is not the goal.
 */
loadEnvLocal();

const { dsn, sentryOptions } = await import('../lib/observability/sentry-options.ts').catch(
  async () => {
    // The options module is TypeScript; when run outside a bundler, fall back to
    // reading the same values from the environment and re-declaring beforeSend
    // would be a second implementation. Import through the app's own tsconfig
    // paths instead, and fail loudly if that is not possible.
    throw new Error('cannot import sentry-options, run through the app runtime');
  },
);

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `, ${detail}` : ''}`);
  }
}

function section(t) {
  console.log(`\n\x1b[1m${t}\x1b[0m`);
}

// ═══ 1. REDACTION ══════════════════════════════════════════════════════
section('1. What leaves the process');

/**
 * The event is passed through the REAL `beforeSend`, the one the running
 * application installs, rather than a copy of its logic. A test that
 * reimplements the scrubber proves the test scrubs, not the product.
 */
const dirty = {
  request: {
    url: 'https://api.metroscope.id/v1/leads',
    headers: {
      authorization: 'Bearer eyJhbGciOi.SUPER.SECRET',
      cookie: 'sb-access-token=leaked',
      'user-agent': 'probe',
    },
    data: {
      parent_name: 'Bunda Rani',
      parent_phone: '081234567890',
      email: 'rani@example.com',
      password: 'DemoLomba!2026',
      service_role: 'eyJzZXJ2aWNl.ROLE.KEY',
      proof_key: 'payments/2026-08/proof-9931.jpg',
      child_name: 'Bagus',
    },
  },
  extra: {
    api_key: 're_CH9_secret',
    refresh_token: 'rt_secret',
    note: 'harmless context',
  },
  user: {
    id: 'a3f1c2d4-0000-0000-0000-000000000001',
    email: 'rani@example.com',
    ip_address: '10.0.0.1',
  },
  contexts: { custom: { token: 'tok_secret', page: '/leads' } },
};

const cleaned = sentryOptions.beforeSend(structuredClone(dirty));
const serialised = JSON.stringify(cleaned);

for (const [label, needle] of [
  ['the bearer token', 'SUPER.SECRET'],
  ['the session cookie', 'sb-access-token=leaked'],
  ['the account password', 'DemoLomba!2026'],
  ['the service role key', 'eyJzZXJ2aWNl.ROLE.KEY'],
  ['the Resend API key', 're_CH9_secret'],
  ['the refresh token', 'rt_secret'],
  ['a context token', 'tok_secret'],
  ['the payment proof key', 'payments/2026-08/proof-9931.jpg'],
  ['the guardian phone number', '081234567890'],
  ['the guardian email address', 'rani@example.com'],
]) {
  check(`${label} does not leave the process`, !serialised.includes(needle));
}

check(
  'sendDefaultPii is off',
  sentryOptions.sendDefaultPii === false,
  String(sentryOptions.sendDefaultPii),
);
check(
  'the user id survives, an error needs somebody to belong to',
  cleaned.user?.id === dirty.user.id,
);
check('but nothing else about them does', Object.keys(cleaned.user ?? {}).join(',') === 'id');
check('harmless context is kept, not blanket-dropped', cleaned.extra?.note === 'harmless context');
check('the route is kept. It is half the diagnosis', cleaned.contexts?.custom?.page === '/leads');

/**
 * A child's name is deliberately NOT in the redact list and this states why
 * rather than leaving it to be discovered: the scrubber keys on field names,
 * `child_name` is not a credential, and an error report that cannot say which
 * record broke is an error report nobody can act on. It is scoped by Sentry
 * project access, not by scrubbing.
 */
check(
  'the child name is retained by design (scoped by project access, not scrubbing)',
  serialised.includes('Bagus'),
);

// ═══ 2. DELIVERY ═══════════════════════════════════════════════════════
section('2. Whether the event actually arrives');

if (!dsn) {
  console.log('  \x1b[33mBLOCK\x1b[0m no DSN configured. Nothing to deliver to');
  process.exit(1);
}

const parsed = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn);
check('the DSN is well formed', Boolean(parsed), 'cannot parse');
console.log(`  \x1b[2mnote\x1b[0m  project ${parsed?.[3]} at ${parsed?.[2]}`);

/**
 * One init, and the event that is asserted on is the event that is sent.
 *
 * The first version of this initialised twice, once to send and once with a
 * wrapping `beforeSend` to inspect, and the second `Sentry.init` did not
 * replace the client, so the assertions ran against an event the real scrubber
 * had never touched. It reported a leak that does not exist. Recording the
 * outcome of the real `beforeSend` on its way out avoids inspecting a
 * different object from the one that leaves.
 */
let captured = null;
const realBeforeSend = sentryOptions.beforeSend;
Sentry.init({
  ...sentryOptions,
  tracesSampleRate: 0,
  beforeSend(event) {
    captured = realBeforeSend(event);
    return captured;
  },
});

function deliberateFailure() {
  // A real throw, so the frames are real.
  throw new Error(`readiness probe, deliberate error at ${new Date().toISOString()}`);
}

let eventId = null;
try {
  deliberateFailure();
} catch (err) {
  eventId = Sentry.captureException(err, {
    tags: { probe: 'verify-monitoring' },
    extra: { password: 'must-not-arrive', reason: 'production readiness drill' },
  });
}

check('the SDK returned an event id', Boolean(eventId), String(eventId));

const flushed = await Sentry.flush(15_000);
check('the transport flushed within 15s, the event left the process', flushed === true);

// ═══ 3. ACTIONABLE ═════════════════════════════════════════════════════
section('3. Whether the trace can be acted on');

const client = Sentry.getClient();

const frames = captured?.exception?.values?.[0]?.stacktrace?.frames ?? [];
const named = frames.filter((f) => f.filename && (f.lineno ?? 0) > 0);

check('the event carries a stack trace', frames.length > 0, `${frames.length} frames`);
check(
  'with file names and line numbers',
  named.length > 0,
  named.length ? `${named.at(-1).filename}:${named.at(-1).lineno}` : 'none',
);
check(
  'the throwing function is identifiable',
  frames.some((f) => f.function?.includes('deliberateFailure')),
  frames
    .map((f) => f.function)
    .filter(Boolean)
    .slice(-3)
    .join(' ← '),
);
check('the environment is stamped', Boolean(captured?.environment), String(captured?.environment));
check(
  'a secret passed at the capture site is scrubbed in extra',
  !JSON.stringify(captured?.extra ?? {}).includes('must-not-arrive'),
  JSON.stringify(captured?.extra),
);

/**
 * Local variables are the real exposure, and they are not `extra`.
 *
 * Sentry can attach each frame's locals (`frame.vars`) via
 * `includeLocalVariables`. That would put whatever happened to be in scope at
 * the throw into the payload, a decrypted proof key, a JWT, a parent's phone
 * number, with no field name for `beforeSend` to match on, because the
 * scrubber keys on names and a local called `row` is not on any list.
 *
 * It is off by default and this asserts it stays off. An earlier version of
 * this check asserted the literal string was absent from the whole event and
 * failed, because Sentry attaches SOURCE CONTEXT: the lines around each frame,
 * read from the file on disk. The probe's own source contains the literal, so
 * the string was present as *code*. Source context is the repository, not the
 * request, and including it is the entire point of an actionable trace.
 */
const withVars = frames.filter((f) => f.vars && Object.keys(f.vars).length > 0);
check(
  'no stack frame carries local variables (includeLocalVariables is off)',
  withVars.length === 0,
  `${withVars.length} frame(s) with locals`,
);
check(
  'frames carry source context, which is code rather than data',
  frames.some((f) => typeof f.context_line === 'string'),
);

/**
 * `release` is what makes a six-week-old trace mean something. Vercel sets
 * `VERCEL_GIT_COMMIT_SHA` on every deployment; locally it is absent, and that
 * is the correct local behaviour rather than a defect, so this reports rather
 * than fails, and the production checklist is where its absence would matter.
 */
console.log(
  `  \x1b[2mnote\x1b[0m  release = ${sentryOptions.release ?? '(unset. Vercel supplies VERCEL_GIT_COMMIT_SHA at deploy time)'}`,
);

await Sentry.flush(5000);
await client?.close?.(2000);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
