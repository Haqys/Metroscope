-- ═══════════════════════════════════════════════════════════════════════════
--  Content foundation: versions, SEO overrides, redirects (doc 13 §9).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These three tables are shared by every content type. Their policies are
-- written once here for the same reason the pipeline is written once: five
-- content types each restating "who may publish" is how the sixth one gets it
-- wrong.

-- ── content_versions ───────────────────────────────────────────────────
/**
 * Readable by staff. INSERT-only, and only for `content.publish`.
 *
 * An earlier draft of this file gave versions no INSERT policy at all, on the
 * reasoning that a forged history is a forged rollback target. That was wrong
 * in a way worth recording: writing the snapshot then had to happen under
 * elevated privileges, which meant the publish transaction could not also be
 * the RLS-checked one, so the whole operation would have run with policies
 * bypassed to protect one table. Trading both gates for one is a bad trade.
 *
 * The residual risk is small: only a `content.publish` holder can insert, and
 * they can already publish anything. There is no UPDATE and no DELETE, so the
 * log stays append-only and a snapshot cannot be altered after the fact.
 */
DROP POLICY IF EXISTS content_versions_select ON content_versions;
CREATE POLICY content_versions_select ON content_versions
  FOR SELECT TO authenticated
  USING (app.is_staff());

DROP POLICY IF EXISTS content_versions_insert ON content_versions;
CREATE POLICY content_versions_insert ON content_versions
  FOR INSERT TO authenticated
  WITH CHECK (app.has_action('content.publish'));

-- No UPDATE and no DELETE policy anywhere. Deliberate: append-only.

-- ── seo_meta ───────────────────────────────────────────────────────────
-- Readable by anon: it IS the public metadata. Writable only by publishers.
DROP POLICY IF EXISTS seo_meta_select_public ON seo_meta;
CREATE POLICY seo_meta_select_public ON seo_meta
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS seo_meta_select ON seo_meta;
CREATE POLICY seo_meta_select ON seo_meta
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS seo_meta_write ON seo_meta;
CREATE POLICY seo_meta_write ON seo_meta
  FOR ALL TO authenticated
  USING (app.has_action('content.publish'))
  WITH CHECK (app.has_action('content.publish'));

-- ── redirects ──────────────────────────────────────────────────────────
/**
 * Readable by anon because the landing middleware resolves them on a 404, and
 * that lookup happens before anyone is signed in.
 *
 * Writable by `content.publish` only. A redirect is a public routing rule: the
 * ability to write one is the ability to point any URL on the site at any
 * other, which is a phishing primitive if it is handed out with editing rights.
 */
DROP POLICY IF EXISTS redirects_select_public ON redirects;
CREATE POLICY redirects_select_public ON redirects
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS redirects_select ON redirects;
CREATE POLICY redirects_select ON redirects
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS redirects_write ON redirects;
CREATE POLICY redirects_write ON redirects
  FOR ALL TO authenticated
  USING (app.has_action('content.publish'))
  WITH CHECK (app.has_action('content.publish'));
