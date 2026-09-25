import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ConsentBody } from '@/modules/content/content.schema';
import { saveConsent } from '@/modules/content/content.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Record parental consent before a child's name goes public (doc 14 §3.7).
 *
 * `content.publish`, not the `/site` page grant: this answers the reviewer's
 * question rather than the author's. Whoever is about to put a minor's name on
 * the open web is the person who should assert that the family agreed, and an
 * author being able to record their own consent note would make the gate a
 * checkbox on the form they are already filling in.
 *
 * Deliberately usable at any status, unlike draft content. `assertArticleReady`
 * fires at PUBLISH, by which point the article is APPROVED and no longer a
 * draft; without this the only way to add the note would be to reject it back
 * down and take it through review again.
 */
export const PUT = handler(
  {
    auth: 'required',
    action: 'content.publish',
    body: ConsentBody,
    audit: 'content.consent',
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await saveConsent(ctx, params.type ?? '', uuidParam(params), body)),
);
