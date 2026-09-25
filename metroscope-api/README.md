# Metroscope. API Service

Production: <https://api.metroscope.id>

**The single source of truth for every business rule, workflow, validation and
integration.** The four frontends render and collect input; nothing else.

This is a _headless_ Next.js app: Route Handlers only, no pages, no React
components, no CSS.

## Why Route Handlers and not Server Actions

A Server Action is not an HTTP endpoint. It compiles to an RPC bound to the
deployment that renders the React tree referencing it, so `portal.metroscope.id`
**cannot** invoke a Server Action living here. There is no URL to call and
Next.js rejects cross-origin invocations (doc 04 section 0.1).

Server Actions belong in the frontends, as a BFF hop that attaches the session
and calls this API. They are transport, never a place to make decisions.

## Layering, enforced, not aspirational

```
app/api/v1/<resource>/route.ts   HTTP only: parse, delegate, serialize (~10 lines)
  └─ lib/http/handler.ts         auth · action · validation · rate limit · idempotency · audit
       └─ modules/<domain>/*.service.ts   ALL business rules. Framework-free.
            └─ modules/<domain>/*.repo.ts data access (Drizzle)
                 └─ db/schema.ts          schema source of truth
```

Next.js gives no DI, no guards and no module graph, so the discipline is imposed:

1. `app/api/**` may not import from `db/`.
2. `modules/**` may not import `next/server`.
3. Every route declares `auth`, `action` and a Zod schema, `npm run guard:routes` fails CI otherwise.
4. Every service takes an explicit `ctx`; no ambient request state.

## RLS is live, not decorative

Normal request work runs inside a transaction that assumes the **caller** identity:

```ts
await asUser(ctx, async (tx) => tx.select()...);  // RLS policies evaluate
```

If this service connected with the service role, Postgres would treat it as a
superuser and every policy would be silently bypassed, the team would write,
review and test policies that never execute. That is worse than having none,
because it manufactures confidence without protection (doc 04 section 0.3).

The service role is reserved for the enumerated operations in `lib/db/rls.ts`
(user provisioning, cron jobs, webhooks, admin repair). Each one is audited, and
anything not on the list cannot elevate, the call throws.

## Security contract on every route

| Gate                       | Enforced by                                                    |
| -------------------------- | -------------------------------------------------------------- |
| Rate limit                 | `handler({ rateLimit })`: Upstash sliding window               |
| Authentication             | JWT signature + expiry + issuer, via JWKS                      |
| Authorization              | `handler({ action })`, one of 16 action grants                 |
| Ownership + business rules | the service layer                                              |
| Last line of defence       | Postgres RLS                                                   |
| Idempotency                | `handler({ idempotent: true })` on money and messaging         |
| Audit                      | `handler({ audit })` writes actor, before/after, IP, requestId |

Assume every endpoint is called from cURL by someone holding a valid token for
the **wrong** role, and make that return 403.

## Getting started

```bash
cp .env.example .env.local
npm ci
supabase start        # local Postgres + Auth + Storage (Docker: dev tool only)
npm run db:generate && npm run db:migrate
npm run dev
```

Runs on <http://localhost:3000>. Health check: `/api/health` (includes DB reachability).

## Scripts

| Script                | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `npm run dev`         | Development server                         |
| `npm run db:generate` | Generate SQL migration from `db/schema.ts` |
| `npm run db:migrate`  | Apply migrations (uses `DIRECT_URL`)       |
| `npm run db:studio`   | Drizzle Studio                             |
| `npm run guard`       | Secret-leak scan + route security scan     |
| `npm run verify`      | guard + typecheck + lint + format:check    |

## Connection pooling

Runtime uses the **Supavisor transaction pooler on `:6543`**. Connecting to
`:5432` from serverless exhausts `max_connections` and takes down all five apps
at once, `lib/env.ts` refuses a non-pooler URL. Migrations use `DIRECT_URL`
(`:5432`) from CI only.

## Adding an endpoint

1. Schema in `modules/<domain>/<domain>.schema.ts` (strict Zod).
2. Rules in `<domain>.service.ts`, no framework imports.
3. Queries in `<domain>.repo.ts`, `asUser()` unless genuinely privileged.
4. Route in `app/api/v1/...` declaring `auth`, `action`, schema.
5. RLS policy in `supabase/policies/` with an allow **and** deny test.
6. `npm run verify`.

## Documentation

- `docs/04-architecture.md`, system design (read section 0 first)
- `docs/15-repositories-and-migration.md`, repos, CI/CD, migration plan
- `docs/06-erd.md`, data model
- `docs/03-prd.md`, functional requirements and API surface
