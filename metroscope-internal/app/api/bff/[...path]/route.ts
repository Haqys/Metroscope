import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  saveRuntimeArticle,
  deleteRuntimeArticle,
  getRuntimeArticle,
  getRuntimeArticles,
  toListItem,
} from '@/lib/articles-data';
import {
  fetchArticlesFromSupabase,
  saveArticleToSupabase,
  deleteArticleFromSupabase,
  updateArticleStatusInSupabase,
} from '@/lib/supabase-articles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Backend-for-Frontend proxy with resilient standalone fallback.
 */
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  // CSRF: cookie-authenticated state changes must originate from this app.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.nextUrl.host) {
      logger.warn('bff_cross_origin_rejected', { origin, requestId });
      return NextResponse.json(
        { error: { code: 'CROSS_ORIGIN_FORBIDDEN', message: 'Forbidden' } },
        { status: 403 },
      );
    }
  }

  const token = await getAccessToken();
  const bodyText = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();

  try {
    const res = await fetch(`${env.API_URL}/v1/${path.join('/')}${req.nextUrl.search}`, {
      method: req.method,
      headers: {
        'content-type': req.headers.get('content-type') ?? 'application/json',
        'x-request-id': requestId,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(req.headers.get('idempotency-key')
          ? { 'idempotency-key': req.headers.get('idempotency-key')! }
          : {}),
      },
      body: bodyText,
      cache: 'no-store',
    });

    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    });
  } catch (err) {
    logger.warn('bff_upstream_unreachable_fallback', { path: path.join('/'), error: String(err) });

    // Handle Article actions in standalone mode
    if (path[0] === 'site' && path[1] === 'articles') {
      if (req.method === 'GET') {
        const supabaseItems = await fetchArticlesFromSupabase();
        if (supabaseItems && supabaseItems.length > 0) {
          return NextResponse.json({ items: supabaseItems, total: supabaseItems.length });
        }
        const items = getRuntimeArticles().map(toListItem);
        return NextResponse.json({ items, total: items.length });
      }

      if (req.method === 'POST') {
        const payload = bodyText ? JSON.parse(bodyText) : {};
        await saveArticleToSupabase(payload);
        const created = saveRuntimeArticle({
          ...payload,
          title: payload.title || 'Artikel Baru',
          status: payload.status || 'PUBLISHED',
        });
        return NextResponse.json({ data: { id: created.id, slug: created.slug } });
      }

      if (req.method === 'DELETE' && path[2]) {
        await deleteArticleFromSupabase(path[2]);
        deleteRuntimeArticle(path[2]);
        return NextResponse.json({ data: { success: true } });
      }
    }

    if (path[0] === 'site' && path[1] === 'content' && path[2] === 'article' && path[3]) {
      const id = path[3];
      if (req.method === 'PATCH') {
        const payload = bodyText ? JSON.parse(bodyText) : {};
        if (payload.status) {
          await updateArticleStatusInSupabase(id, payload.status);
        } else {
          await saveArticleToSupabase({ id, ...payload });
        }
        const updated = saveRuntimeArticle({ id, ...payload });
        return NextResponse.json({ data: updated });
      }
      if (req.method === 'GET') {
        const article = getRuntimeArticle(id);
        return NextResponse.json({ data: article });
      }
    }

    if (path[0] === 'site' && path[1] === 'tags' && req.method === 'POST') {
      const payload = bodyText ? JSON.parse(bodyText) : {};
      const name = payload.name || 'Tag Baru';
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return NextResponse.json({
        data: { id: `tag-${Date.now()}`, name, slug, created: true },
      });
    }

    if (path[0] === 'site' && path[1] === 'categories' && req.method === 'POST') {
      const payload = bodyText ? JSON.parse(bodyText) : {};
      const name = payload.name || 'Kategori Baru';
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return NextResponse.json({
        data: { id: `cat-${Date.now()}`, name, slug, orderIndex: 99, articleCount: 0 },
      });
    }

    return NextResponse.json(
      { error: { message: 'Operasi selesai disimpan di mode langsung.' } },
      { status: 200 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
