/**
 * Formatting helpers with no domain of their own.
 *
 * `formatIdr` lived in `students-data.ts`, a student fixture, which is why
 * four unrelated finance screens imported a mock student list to render a
 * rupiah. It is a pure function about money; it belongs where money is.
 */

/** Whole rupiah, Indonesian formatting. Money is integer IDR (CLAUDE.md). */
export function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}
