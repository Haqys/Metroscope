-- ═══════════════════════════════════════════════════════════════════════════
--  Invoice numbers.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `invoices.number` is UNIQUE and human-facing: it is what a parent quotes in a
-- transfer note and what Finance searches by. Deriving it in application code
-- from `count(*) + 1` is the obvious approach and it is wrong, two conversions
-- in the same second read the same count, and the loser gets a unique-violation
-- at best or a duplicate number at worst.
--
-- A sequence is the correct tool: it is transactional, monotonic, and gap-
-- tolerant. Gaps are fine here, a skipped number means a rolled-back
-- conversion, which is exactly the case FR-ENR-1 requires to leave no trace.

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

/**
 * INV/2026/07/000123
 *
 * Year and month come from the issue date so the number sorts and reads
 * chronologically; the counter is global rather than per-month because a
 * per-month reset needs a lock to be correct, and buys nothing but prettier
 * numbers.
 */
CREATE OR REPLACE FUNCTION app.next_invoice_number()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'INV/' || to_char(now() AT TIME ZONE 'Asia/Makassar', 'YYYY/MM') || '/' ||
         lpad(nextval('invoice_number_seq')::text, 6, '0')
$$;

COMMENT ON FUNCTION app.next_invoice_number() IS
  'Collision-free invoice number. WITA month, because that is the business day '
  'the office works in even though timestamps are stored UTC.';
