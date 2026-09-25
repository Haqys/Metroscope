/**
 * A small, permanent mark that this deployment is not the real site.
 *
 * Rendered only when `NEXT_PUBLIC_STANDALONE=true`, and worth the pixels.
 * Everything a visitor can read here, the programme prices, the mentors, the
 * testimonials, the competition deadlines, is invented for layout review
 * (`lib/mock/content.ts`). `noindex` and a blanket `Disallow` keep it out of
 * search results, but neither stops the URL being shared with a colleague, a
 * parent, or a client, and a marketing site is convincing by design.
 *
 * So it says so on the page. Bottom-left, above the fold on every route, out
 * of the way of the fixed navbar and the hero: enough to catch the eye of
 * anyone who looks, not enough to interfere with reviewing the design, which
 * is what this deployment is for.
 *
 * Not dismissible on purpose. A badge that can be closed is a badge that is
 * closed in the screenshot somebody forwards.
 */
export function PreviewBadge() {
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] print:hidden">
      <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-neutral-900/90 px-3.5 py-2 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
        Pratinjau · konten contoh
      </span>
    </div>
  );
}
