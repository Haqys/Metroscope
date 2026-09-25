-- ═══════════════════════════════════════════════════════════════════════════
--  Billing: invoices, payments. The highest-stakes surface in the schema.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices
  FOR SELECT TO authenticated
  USING (
    /**
     * The family's own bills, but NOT drafts.
     *
     * A DRAFT invoice is a proposal the billing run made and Finance has not
     * reviewed. Showing it to a parent would mean they see, and could try to
     * pay, a bill the business has not decided to send.
     */
    (app.owns_student(student_id) AND status <> 'DRAFT')
    OR app.has_page('/finance/invoices')
    OR app.has_page('/finance/verifications')
  );

DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (app.has_action('invoice.issue'));

/**
 * UPDATE is open to two very different callers:
 *
 *   Finance, issues, voids and settles. Needs the whole row.
 *   A parent, attaches a transfer proof to their own unpaid invoice.
 *
 * Supabase gives every signed-in user the same `authenticated` database role,
 * so column-level GRANTs cannot separate them, a grant narrow enough for the
 * parent would also stop Finance from setting status. The row policy therefore
 * admits both, and the trigger below is what stops a parent from marking their
 * own invoice PAID. Row policy decides WHICH rows; trigger decides WHICH
 * COLUMNS. Both are needed; neither is sufficient alone.
 */
DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices
  FOR UPDATE TO authenticated
  USING (
    app.has_action('invoice.issue')
    OR app.has_action('invoice.void')
    OR app.has_action('payment.verify')
    OR (
      app.owns_student(student_id)
      AND status IN ('UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'INSTALLMENT')
    )
  )
  WITH CHECK (
    app.has_action('invoice.issue')
    OR app.has_action('invoice.void')
    OR app.has_action('payment.verify')
    OR app.owns_student(student_id)
  );

-- Invoices are never deleted; voiding is a status, so the number stays
-- accounted for. A missing invoice number is an audit finding.

/**
 * Column guard for non-Finance callers.
 *
 * Everything a parent must not be able to change is listed here. The check is
 * "does this caller hold a money verb?" rather than "is this caller staff",
 * because a Mentor is staff and has no business touching an amount either.
 */
/**
 * ⚠️ THIS FILE IS THE ONLY HOME FOR THIS FUNCTION.
 *
 * Migrations 0006, 0007 and 0008 each changed it, and every one of those
 * changes was silently reverted the next time `npm run db:policies` ran. This
 * directory re-applies on every deploy by design, so whatever it says always
 * wins. The result was worse than a lost fix: the live database went back to a
 * version where a guardian could not submit a proof at all, and it did so
 * without any migration failing.
 *
 * A migration that redefines something defined here is therefore a bug.
 * `apply-policies.mjs` now refuses to run when it finds one.
 *
 * SECURITY INVOKER (the default) is load-bearing, see the `current_user` check
 * below. Inside a SECURITY DEFINER function `current_user` is the function
 * OWNER, so adding DEFINER back makes the check read `postgres` for everyone
 * and the guard stops guarding entirely. Do not add it.
 */
CREATE OR REPLACE FUNCTION app.guard_invoice_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  submitting_proof boolean;
BEGIN
  /**
   * System and job writes arrive on the owner connection rather than as a
   * session role, and have no JWT claims for has_action() to read. This guard
   * constrains END-USER sessions; the system is constrained by the enumerated
   * withElevatedPrivileges list and by review.
   */
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Finance may change anything the row policy let them reach.
  IF app.has_action('invoice.issue')
     OR app.has_action('invoice.void')
     OR app.has_action('payment.verify') THEN
    RETURN NEW;
  END IF;

  /**
   * The one status change a guardian may make: "I have transferred, please
   * check" (FR-PAY-2). It requires an actual proof key, so it cannot be used to
   * jump the queue with an empty claim.
   */
  submitting_proof :=
    OLD.status IN ('UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'INSTALLMENT')
    AND NEW.status = 'AWAITING_VERIFICATION'
    AND NEW.proof_key IS NOT NULL;

  IF NEW.number          IS DISTINCT FROM OLD.number
     OR NEW.student_id      IS DISTINCT FROM OLD.student_id
     OR NEW.amount          IS DISTINCT FROM OLD.amount
     OR NEW.period          IS DISTINCT FROM OLD.period
     OR NEW.type            IS DISTINCT FROM OLD.type
     OR NEW.method          IS DISTINCT FROM OLD.method
     OR NEW.due_date        IS DISTINCT FROM OLD.due_date
     OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
     OR NEW.billing_run_id  IS DISTINCT FROM OLD.billing_run_id
     OR NEW.issued_by_id    IS DISTINCT FROM OLD.issued_by_id
     OR NEW.issued_at       IS DISTINCT FROM OLD.issued_at
     OR NEW.paid_at         IS DISTINCT FROM OLD.paid_at
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT submitting_proof) THEN
    RAISE EXCEPTION
      'Without a payment grant you may only attach a transfer proof'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_guard_columns ON invoices;
CREATE TRIGGER invoices_guard_columns
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION app.guard_invoice_columns();

-- ── billing_runs ───────────────────────────────────────────────────────
--
-- Staff machinery, never customer-facing. A guardian has no business knowing
-- that their bill arrived as part of a batch of forty, and the run's totals are
-- the business's revenue figures.
DROP POLICY IF EXISTS billing_runs_select ON billing_runs;
CREATE POLICY billing_runs_select ON billing_runs
  FOR SELECT TO authenticated
  USING (app.has_page('/finance/invoices'));

DROP POLICY IF EXISTS billing_runs_write ON billing_runs;
CREATE POLICY billing_runs_write ON billing_runs
  FOR ALL TO authenticated
  USING (app.has_action('invoice.issue'))
  WITH CHECK (app.has_action('invoice.issue'));

-- ── payments ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments
  FOR SELECT TO authenticated
  USING (
    app.has_page('/finance/invoices')
    OR app.has_page('/finance/verifications')
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id
        AND app.owns_student(i.student_id)
    )
  );

/**
 * Recording a settlement is Finance's alone, a payment row is what marks money
 * as received. `verified_by_id` must be the caller: an approval attributed to
 * someone else is worse than no approval, because it looks legitimate.
 */
DROP POLICY IF EXISTS payments_insert ON payments;
CREATE POLICY payments_insert ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    (app.has_action('payment.record') OR app.has_action('payment.verify'))
    AND (verified_by_id IS NULL OR verified_by_id = app.current_user_id())
  );

DROP POLICY IF EXISTS payments_update ON payments;
CREATE POLICY payments_update ON payments
  FOR UPDATE TO authenticated
  USING (app.has_action('payment.verify'))
  WITH CHECK (
    app.has_action('payment.verify')
    AND (verified_by_id IS NULL OR verified_by_id = app.current_user_id())
  );
