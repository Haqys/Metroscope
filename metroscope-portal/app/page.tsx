import { redirect } from 'next/navigation';

/**
 * The portal has one home: /portal.
 *
 * This file did not exist, and the origin was therefore a 404 with a perfectly
 * good session behind it. Three things reached it:
 *
 *   · login, which sent every guardian to the bare origin;
 *   · the logo in the portal sidebar, which links to `/`;
 *   · any bookmark of portal.metroscope.id.
 *
 * The other two surfaces have had this file since they were built
 * (`metroscope-internal/app/page.tsx`, `metroscope-mentor/app/page.tsx`); only
 * the portal was missing it, which is why only customers saw the dead end.
 *
 * A redirect rather than a page: /portal is the summary, and a second home
 * screen would be one more thing to keep in step with it.
 */
export default function RootPage() {
  redirect('/portal');
}
