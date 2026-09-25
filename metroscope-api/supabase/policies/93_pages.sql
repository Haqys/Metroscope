-- ═══════════════════════════════════════════════════════════════════════════
--  Pages, blocks and preview grants (doc 13 §9.3, §9.5).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── pages ──────────────────────────────────────────────────────────────
/**
 * Published pages are the public web; a draft is CMS-only.
 *
 * The same split articles use, and the same reason: an unpublished marketing
 * page holds prices, campaign copy and claims that have not been signed off.
 */
DROP POLICY IF EXISTS pages_select_public ON pages;
CREATE POLICY pages_select_public ON pages
  FOR SELECT TO anon
  USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS pages_select ON pages;
CREATE POLICY pages_select ON pages
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' OR app.has_page('/site'));

/**
 * Anyone with `/site` may write, but WITH CHECK controls where a page can
 * LAND: an author moves it between DRAFT and IN_REVIEW, and only a content
 * verb lands it in APPROVED, SCHEDULED, PUBLISHED or ARCHIVED.
 *
 * So an author cannot publish a page even with the API bypassed.
 */
DROP POLICY IF EXISTS pages_write ON pages;
CREATE POLICY pages_write ON pages
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (
    app.has_action('content.review')
    OR app.has_action('content.publish')
    OR (app.has_page('/site') AND status IN ('DRAFT', 'IN_REVIEW'))
  );

-- ── blocks ─────────────────────────────────────────────────────────────
/**
 * A block is readable exactly when its page is.
 *
 * Expressed as a subquery over `pages`, which is itself RLS-protected, and
 * that is the point: the policy body runs as the caller, so `pages_select`
 * filters this EXISTS too. A block on a draft page is invisible to `anon`
 * without this policy having to restate what "published" means. One definition,
 * in one place, and blocks cannot drift from it.
 */
DROP POLICY IF EXISTS page_blocks_select_public ON page_blocks;
CREATE POLICY page_blocks_select_public ON page_blocks
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM pages p WHERE p.id = page_blocks.page_id));

DROP POLICY IF EXISTS page_blocks_select ON page_blocks;
CREATE POLICY page_blocks_select ON page_blocks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pages p WHERE p.id = page_blocks.page_id));

/**
 * Editing blocks is authoring, so the `/site` page grant is enough, the same
 * standing as editing a draft's text. What stops an author changing a LIVE
 * page is the service (only DRAFT is editable) plus `pages_write` above, which
 * refuses to let them move the page into a published state.
 */
DROP POLICY IF EXISTS page_blocks_write ON page_blocks;
CREATE POLICY page_blocks_write ON page_blocks
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (app.has_page('/site'));

-- ── preview grants ─────────────────────────────────────────────────────
/**
 * Never readable by `anon`, and not listable even by staff.
 *
 * A preview grant is a bearer credential. The API looks one up by the HASH of
 * a presented token using owner rights; nothing needs to SELECT the table as a
 * user, so nothing may. Granting staff a read would turn "can see the CMS" into
 * "can mint a link to any draft", which is precisely the escalation the expiry
 * and the per-entity scope exist to bound.
 */
DROP POLICY IF EXISTS preview_grants_write ON preview_grants;
CREATE POLICY preview_grants_write ON preview_grants
  FOR INSERT TO authenticated
  WITH CHECK (app.has_page('/site'));
