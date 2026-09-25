-- ═══════════════════════════════════════════════════════════════════════════
--  Media library (doc 13 §9.7).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── media_assets ───────────────────────────────────────────────────────
/**
 * Readable by anon, because the metadata IS public.
 *
 * The bucket serves these images to the open web, so the bytes are already
 * public; withholding the row would only hide the `alt` text the site needs to
 * render them accessibly. Only READY, non-deleted assets, a half-uploaded row
 * has no bytes behind it, and a deleted one should stop appearing everywhere at
 * once.
 */
DROP POLICY IF EXISTS media_assets_select_public ON media_assets;
CREATE POLICY media_assets_select_public ON media_assets
  FOR SELECT TO anon
  USING (deleted_at IS NULL AND status = 'READY');

/**
 * Staff see everything including drafts and the recycle bin, the library is
 * where you go to find the thing you deleted by mistake.
 */
DROP POLICY IF EXISTS media_assets_select ON media_assets;
CREATE POLICY media_assets_select ON media_assets
  FOR SELECT TO authenticated
  USING ((deleted_at IS NULL AND status = 'READY') OR app.has_page('/site'));

/**
 * Uploading and describing is AUTHORING: anyone who can reach the CMS may do
 * it. Requiring a publishing verb to add an image would mean an author cannot
 * illustrate their own draft.
 */
DROP POLICY IF EXISTS media_assets_insert ON media_assets;
CREATE POLICY media_assets_insert ON media_assets
  FOR INSERT TO authenticated
  WITH CHECK (app.has_page('/site'));

DROP POLICY IF EXISTS media_assets_update ON media_assets;
CREATE POLICY media_assets_update ON media_assets
  FOR UPDATE TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (app.has_page('/site'));

/**
 * No DELETE policy. Removal is `deleted_at`, an UPDATE, and purging bytes for
 * real happens through the service with elevated privileges, after it has
 * checked nothing still points at the asset. A row that vanishes takes every
 * page using it down with no way back.
 */

-- ── media_usage ────────────────────────────────────────────────────────
-- Public, because it is derived from public content and the delete guard has
-- to be answerable before anyone signs in during a build.
DROP POLICY IF EXISTS media_usage_select_public ON media_usage;
CREATE POLICY media_usage_select_public ON media_usage
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS media_usage_select ON media_usage;
CREATE POLICY media_usage_select ON media_usage
  FOR SELECT TO authenticated
  USING (true);

/**
 * Written by whoever places the media, so the same grant that lets an author
 * edit a draft lets them record that the draft uses an image.
 */
DROP POLICY IF EXISTS media_usage_write ON media_usage;
CREATE POLICY media_usage_write ON media_usage
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (app.has_page('/site'));
