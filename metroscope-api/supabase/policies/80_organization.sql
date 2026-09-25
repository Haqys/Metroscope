-- ═══════════════════════════════════════════════════════════════════════════
--  Organisation settings: bank accounts.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Every signed-in user reads the ACTIVE accounts.
 *
 * A guardian has to see where to transfer, and they are not staff, so this
 * cannot be gated on a page grant like the rest of the internal data. The rows
 * are the business's own published details, the same numbers that appear on an
 * invoice, so the exposure is intended.
 *
 * Deactivated accounts stay hidden: an old closed account visible on a pay page
 * means money sent somewhere nobody is watching.
 */
DROP POLICY IF EXISTS bank_accounts_select ON bank_accounts;
CREATE POLICY bank_accounts_select ON bank_accounts
  FOR SELECT TO authenticated
  USING (is_active OR app.has_action('settings.edit'));

-- NOT readable by `anon`. The marketing site has no reason to list account
-- numbers, and a public bucket of bank details is a phishing kit.

DROP POLICY IF EXISTS bank_accounts_write ON bank_accounts;
CREATE POLICY bank_accounts_write ON bank_accounts
  FOR ALL TO authenticated
  USING (app.has_action('settings.edit'))
  WITH CHECK (app.has_action('settings.edit'));
