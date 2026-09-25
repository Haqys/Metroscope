import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { buildContext, type RequestContext } from '@/lib/auth/context';
import { hasAction, type Action } from '@/lib/auth/actions';
import { checkRateLimit } from '@/lib/ratelimit';
import { withIdempotency } from '@/lib/idempotency';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { ApiError, errorResponse } from '@/lib/http/errors';

/**
 * The single entry point for every Route Handler in this service.
 *
 * Next.js gives no guards, no interceptors and no DI (doc 04 §4.1), so the
 * security contract is declared here instead, which makes it reviewable and
 * lets CI assert that no route forgets it (`pnpm guard:routes`).
 *
 * Order is deliberate: rate limit → authenticate → authorise → validate →
 * execute → audit. Cheap rejections happen before expensive work.
 */
export interface HandlerConfig<TBody, TQuery> {
  /** 'required' authenticates; 'public' skips. Never omit. CI enforces it. */
  auth: 'required' | 'public';
  /** Action grant the caller must hold. Required for every non-public route. */
  action?: Action;
  /**
   * Page grant the caller must hold to call this route at all.
   *
   * Reads are normally gated by RLS alone, a caller without the grant gets an
   * empty list rather than a 403, which avoids confirming that rows they may
   * not see exist. That works when every row the query can reach is covered by
   * a policy keyed to staff grants.
   *
   * It stops working for a route that AGGREGATES sources, because a policy may
   * legitimately expose a row on a different ground. `/v1/inbox` reads invoices,
   * and a guardian's own invoices are visible to them by ownership, so without
   * this, a parent calling the staff work queue would receive their own unpaid
   * bills back, dressed as pending staff decisions.
   *
   * This asks a question about the PAGE, which no table policy can answer.
   * It is not a substitute for RLS; it runs in addition to it.
   */
  page?: string;
  /**
   * This write is a customer acting on their OWN row, authorised by ownership
   * rather than by a grant, a guardian attaching a transfer proof to their own
   * invoice, say.
   *
   * The 16 verbs describe staff authority (doc 12 §10.2); none of them means
   * "pay my own bill", and inventing one would put customer self-service into
   * the same vocabulary as `payment.verify`. So these routes carry no action,
   * and this flag is how they say so on purpose instead of by omission,
   * `guard:routes` accepts it and rejects a silent gap.
   *
   * It grants nothing. Ownership is enforced by RLS, and for invoices also by
   * `app.guard_invoice_columns()`, which decides which columns may move.
   *
   * Not only customers. §3.1 marks attendance this way: authority comes from
   * having TAUGHT the session, and no verb means "record what I observed in my
   * own lesson". One that did would hand the same authority over lessons the
   * holder was not in the room for.
   */
  ownerWrite?: true;
  /** Zod schema for the JSON body. `.strict()` is enforced, unknown keys reject. */
  body?: ZodSchema<TBody>;
  /** Zod schema for search params. */
  query?: ZodSchema<TQuery>;
  /** Sliding-window rate limit. Defaults applied per auth mode. */
  rateLimit?: { key: string; limit: number; window: `${number} ${'s' | 'm' | 'h'}` };
  /** Honour the Idempotency-Key header. Mandatory for money and messaging. */
  idempotent?: boolean;
  /** Audit action name. Mandatory for financial and destructive routes. */
  audit?: string;
}

interface HandlerArgs<TBody, TQuery> {
  req: NextRequest;
  ctx: RequestContext;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
}

/** Next.js always supplies this second argument, even for static segments. */
type RouteContext = { params: Promise<Record<string, string>> };

export function handler<TBody = undefined, TQuery = undefined>(
  config: HandlerConfig<TBody, TQuery>,
  fn: (args: HandlerArgs<TBody, TQuery>) => Promise<Response>,
) {
  return async (req: NextRequest, routeCtx: RouteContext): Promise<Response> => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    const started = Date.now();
    const route = new URL(req.url).pathname;

    try {
      // ── 1. Rate limit ────────────────────────────────────────────────
      const identifier = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      const rl = config.rateLimit ?? {
        key: config.auth === 'public' ? 'public' : 'authenticated',
        limit: config.auth === 'public' ? 20 : 100,
        window: '1 m' as const,
      };
      const allowed = await checkRateLimit(rl.key, identifier, rl.limit, rl.window);
      if (!allowed.success) {
        throw new ApiError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan.', {
          retryAfter: allowed.retryAfter,
        });
      }

      // ── 2. Authenticate ──────────────────────────────────────────────
      let ctx: RequestContext;
      if (config.auth === 'required') {
        const authz = req.headers.get('authorization');
        if (!authz?.startsWith('Bearer ')) {
          throw new ApiError(401, 'UNAUTHENTICATED', 'Sesi tidak ditemukan.');
        }
        const claims = await verifyAccessToken(authz.slice(7));
        ctx = await buildContext(claims, { requestId, req });
      } else {
        ctx = await buildContext(null, { requestId, req });
      }

      // ── 3. Authorise (page grant, then action grant) ─────────────────
      if (config.page) {
        if (!ctx.user) {
          throw new ApiError(401, 'UNAUTHENTICATED', 'Sesi tidak ditemukan.');
        }
        if (!ctx.pages.includes(config.page)) {
          await writeAuditLog({
            ctx,
            action: 'authz.denied',
            entity: 'route',
            entityId: route,
            meta: { requiredPage: config.page, held: ctx.pages },
          });
          throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak punya akses ke halaman ini.');
        }
      }

      // A page grant drives navigation; an ACTION grant drives the API.
      // Seeing the verification queue is not permission to approve Rp15,000,000.
      if (config.action) {
        if (!ctx.user) {
          throw new ApiError(401, 'UNAUTHENTICATED', 'Sesi tidak ditemukan.');
        }
        if (!hasAction(ctx, config.action)) {
          await writeAuditLog({
            ctx,
            action: 'authz.denied',
            entity: 'route',
            entityId: route,
            meta: { required: config.action, held: ctx.actions },
          });
          throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak berwenang melakukan tindakan ini.');
        }
      }

      // ── 4. Validate ──────────────────────────────────────────────────
      let body = undefined as TBody;
      if (config.body) {
        const raw = await req.json().catch(() => {
          throw new ApiError(400, 'INVALID_JSON', 'Body bukan JSON yang valid.');
        });
        body = config.body.parse(raw);
      }

      let query = undefined as TQuery;
      if (config.query) {
        query = config.query.parse(Object.fromEntries(new URL(req.url).searchParams.entries()));
      }

      const params = (await routeCtx?.params) ?? {};

      // ── 5. Execute (optionally idempotent) ───────────────────────────
      const run = () => fn({ req, ctx, body, query, params });
      const res = config.idempotent
        ? await withIdempotency(req.headers.get('idempotency-key'), route, ctx, run)
        : await run();

      // ── 6. Audit ─────────────────────────────────────────────────────
      if (config.audit) {
        await writeAuditLog({
          ctx,
          action: config.audit,
          entity: route,
          entityId: params.id ?? null,
          meta: { status: res.status },
        });
      }

      logger.info('request_completed', {
        route,
        method: req.method,
        status: res.status,
        durationMs: Date.now() - started,
        requestId,
        userId: ctx.user?.id,
      });

      res.headers.set('x-request-id', requestId);
      return res;
    } catch (err) {
      if (err instanceof ZodError) {
        return errorResponse(
          new ApiError(422, 'VALIDATION_FAILED', 'Data yang dikirim tidak valid.', {
            issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          }),
          requestId,
        );
      }
      if (err instanceof ApiError) {
        logger.warn('request_rejected', {
          route,
          code: err.code,
          status: err.status,
          requestId,
        });
        return errorResponse(err, requestId);
      }

      // Unknown failures never leak internals to the client.
      logger.error('request_failed', {
        route,
        requestId,
        message: err instanceof Error ? err.message : String(err),
      });
      return errorResponse(
        new ApiError(500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server.'),
        requestId,
      );
    }
  };
}

/** Convenience for the common `{ data }` envelope (doc 04 §4.3). */
export function ok<T>(data: T, init?: ResponseInit): Response {
  return NextResponse.json({ data }, init);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read a required UUID route segment.
 *
 * Two things this prevents. TypeScript types `params` as possibly-undefined and
 * every call site would otherwise reach for `!`, which is a lie waiting to be
 * wrong. And an id like `../../etc` or `1 OR 1=1` reaches Postgres as an invalid
 * uuid literal, which raises 22P02 and surfaces to the caller as a 500, an
 * internal error for what is plainly a bad request.
 */
export function uuidParam(params: Record<string, string>, name = 'id'): string {
  const value = params[name];
  if (!value || !UUID.test(value)) {
    throw new ApiError(400, 'INVALID_ID', 'Alamat yang diminta tidak valid.');
  }
  return value;
}
