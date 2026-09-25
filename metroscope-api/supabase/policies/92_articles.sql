-- ═══════════════════════════════════════════════════════════════════════════
--  Articles, categories and tags (doc 13 §10).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── articles ───────────────────────────────────────────────────────────
/**
 * Published articles are the public web. Everything else is CMS-only.
 *
 * Note what `anon` does NOT get: a draft, an in-review piece, or a scheduled
 * one. An article waiting for approval is often about a named child and their
 * result, exactly the thing that must not be readable by guessing an id.
 */
DROP POLICY IF EXISTS articles_select_public ON articles;
CREATE POLICY articles_select_public ON articles
  FOR SELECT TO anon
  USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS articles_select ON articles;
CREATE POLICY articles_select ON articles
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' OR app.has_page('/site'));

/**
 * The same editorial split the pipeline uses on programmes (30_master_data):
 * anyone with `/site` may write, but WITH CHECK controls where content is
 * allowed to LAND. An author moves it between DRAFT and IN_REVIEW; only a
 * content verb lands it in APPROVED, SCHEDULED, PUBLISHED or ARCHIVED.
 *
 * So an author cannot publish their own article even with the API bypassed.
 */
DROP POLICY IF EXISTS articles_write ON articles;
CREATE POLICY articles_write ON articles
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (
    app.has_action('content.review')
    OR app.has_action('content.publish')
    OR (app.has_page('/site') AND status IN ('DRAFT', 'IN_REVIEW'))
  );

-- ── taxonomy ───────────────────────────────────────────────────────────
-- Public: category and tag names appear in navigation and in JSON-LD, and the
-- website renders them before anyone signs in.
DROP POLICY IF EXISTS article_categories_select_public ON article_categories;
CREATE POLICY article_categories_select_public ON article_categories
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS article_categories_select ON article_categories;
CREATE POLICY article_categories_select ON article_categories
  FOR SELECT TO authenticated USING (true);

/**
 * Categories are navigation, so changing them reshapes the site. `content.review`,
 * the editorial verb, rather than every author, because a category invented
 * per article is how a taxonomy becomes a tag cloud.
 */
DROP POLICY IF EXISTS article_categories_write ON article_categories;
CREATE POLICY article_categories_write ON article_categories
  FOR ALL TO authenticated
  USING (app.has_action('content.review'))
  WITH CHECK (app.has_action('content.review'));

DROP POLICY IF EXISTS tags_select_public ON tags;
CREATE POLICY tags_select_public ON tags FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS tags_select ON tags;
CREATE POLICY tags_select ON tags FOR SELECT TO authenticated USING (true);

/**
 * Tags are free-form and cross-cutting, so any author may create one while
 * writing. That is the difference from categories: a tag that turns out to be
 * a duplicate is tidied later, a category that does is a broken menu now.
 */
DROP POLICY IF EXISTS tags_write ON tags;
CREATE POLICY tags_write ON tags
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (app.has_page('/site'));

DROP POLICY IF EXISTS article_tags_select_public ON article_tags;
CREATE POLICY article_tags_select_public ON article_tags
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS article_tags_select ON article_tags;
CREATE POLICY article_tags_select ON article_tags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS article_tags_write ON article_tags;
CREATE POLICY article_tags_write ON article_tags
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (app.has_page('/site'));
