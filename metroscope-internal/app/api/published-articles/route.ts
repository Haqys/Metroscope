import { NextResponse } from 'next/server';
import { getRuntimeArticles, toListItem } from '@/lib/articles-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  const all = getRuntimeArticles();

  if (slug) {
    const article = all.find((a) => a.slug === slug || a.id === slug);
    if (!article) {
      return NextResponse.json(
        { error: 'Article not found' },
        {
          status: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        },
      );
    }
    return NextResponse.json(
      { data: article },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const published = all.filter((a) => a.status === 'PUBLISHED');
  return NextResponse.json(
    {
      data: {
        items: published.map(toListItem),
        fullArticles: published,
        total: published.length,
      },
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
