/**
 * ⚠️ FIXTURE, the finance dashboard's two money numbers, and nothing else.
 *
 * Relocated here by §3.6 when `students-data.ts` was deleted. It carried these
 * beside a mock student list, which is why four finance screens imported a
 * student fixture to render a rupiah; nothing about them is about students.
 *
 * They stay invented because neither has a table:
 *
 *   income, computable from `payments`, but "pemasukan bulan ini" is a
 *                 reporting question and `/finance` has no reporting endpoint;
 *                 doc 14 puts the reports module in Phase 4.
 *   operational, mentor fees. There is no fee table at all (doc 14 Phase 4,
 *                 "mentor fees"), so this is not a query anybody could write.
 *
 * Every other number on `/finance` is now real: student counts come from
 * `GET /v1/students?view=directory`, the verification queue from
 * `GET /v1/invoices?status=AWAITING_VERIFICATION`.
 */
export const FINANCE_SUMMARY = {
  period: 'Juli 2026',
  income: 84_200_000,
  operational: 31_500_000,
};
