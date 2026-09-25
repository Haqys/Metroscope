-- ═══════════════════════════════════════════════════════════════════════════
--  FAQ, testimonials, mentor profiles, contact submissions (doc 14 §2.7).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The three content types repeat the shape articles and pages already use:
-- `anon` sees PUBLISHED only, `/site` may write, and WITH CHECK decides where
-- content may LAND so an author cannot publish their own work.

-- ── FAQ ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS faq_entries_select_public ON faq_entries;
CREATE POLICY faq_entries_select_public ON faq_entries
  FOR SELECT TO anon USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS faq_entries_select ON faq_entries;
CREATE POLICY faq_entries_select ON faq_entries
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' OR app.has_page('/site'));

DROP POLICY IF EXISTS faq_entries_write ON faq_entries;
CREATE POLICY faq_entries_write ON faq_entries
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (
    app.has_action('content.review')
    OR app.has_action('content.publish')
    OR (app.has_page('/site') AND status IN ('DRAFT', 'IN_REVIEW'))
  );

-- ── testimonials ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS testimonials_select_public ON testimonials;
CREATE POLICY testimonials_select_public ON testimonials
  FOR SELECT TO anon USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS testimonials_select ON testimonials;
CREATE POLICY testimonials_select ON testimonials
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' OR app.has_page('/site'));

DROP POLICY IF EXISTS testimonials_write ON testimonials;
CREATE POLICY testimonials_write ON testimonials
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (
    app.has_action('content.review')
    OR app.has_action('content.publish')
    OR (app.has_page('/site') AND status IN ('DRAFT', 'IN_REVIEW'))
  );

-- ── mentor profiles ────────────────────────────────────────────────────
/**
 * `anon` reads this table and never `users`.
 *
 * That is the whole reason the profile is a separate table: the public query
 * touches marketing copy a mentor agreed to publish, and cannot reach the row
 * holding their email, or any guardian's.
 */
DROP POLICY IF EXISTS mentor_profiles_select_public ON mentor_profiles;
CREATE POLICY mentor_profiles_select_public ON mentor_profiles
  FOR SELECT TO anon USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS mentor_profiles_select ON mentor_profiles;
CREATE POLICY mentor_profiles_select ON mentor_profiles
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' OR app.has_page('/site'));

DROP POLICY IF EXISTS mentor_profiles_write ON mentor_profiles;
CREATE POLICY mentor_profiles_write ON mentor_profiles
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (
    app.has_action('content.review')
    OR app.has_action('content.publish')
    OR (app.has_page('/site') AND status IN ('DRAFT', 'IN_REVIEW'))
  );

-- ── contact submissions ────────────────────────────────────────────────
/**
 * Written by the public, read only by staff who work the inbox.
 *
 * There is NO `anon` SELECT policy and there must never be one: this table
 * holds names, emails and phone numbers typed by members of the public, and a
 * readable submissions table is a harvestable contact list. The public endpoint
 * inserts through the table owner and returns nothing but an acknowledgement,
 * so `anon` needs no grant here at all, not even to write.
 *
 * Reading is gated on `/leads`, the page whose job is already "somebody wants
 * something from us". A contact message and a registration are the same kind of
 * work, and giving them separate grants would mean a Secretary could see one
 * queue and not the other for no reason anyone could explain.
 */
DROP POLICY IF EXISTS form_submissions_select ON form_submissions;
CREATE POLICY form_submissions_select ON form_submissions
  FOR SELECT TO authenticated
  USING (app.has_page('/leads'));

DROP POLICY IF EXISTS form_submissions_update ON form_submissions;
CREATE POLICY form_submissions_update ON form_submissions
  FOR UPDATE TO authenticated
  USING (app.has_action('lead.approve'))
  WITH CHECK (app.has_action('lead.approve'));
