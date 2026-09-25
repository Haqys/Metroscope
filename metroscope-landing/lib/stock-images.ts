/**
 * Placeholder photography for pages that have no CMS behind them yet.
 *
 * Lifted out of `lib/programs-data.ts` when that fixture was deleted in §2.5.
 * These are not programme data and never were, `/about` and `/testimonials`
 * borrowed them because the constant happened to live next door. Keeping the
 * name honest makes it obvious what still needs a real source: §2.7 gives
 * testimonials and the remaining public pages their own content type, and this
 * file goes with them.
 */
export const STOCK_IMAGES = {
  classroom:
    'https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8c3R1ZGVudHxlbnwwfHwwfHx8MA%3D%3D',
  studentPortrait:
    'https://images.unsplash.com/photo-1773332611514-238856b76198?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDF8MHxzZWFyY2h8MjJ8fHN0dWRlbnR8ZW58MHx8MHx8fDA%3D',
  studyGroup:
    'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHN0dWRlbnR8ZW58MHx8MHx8fDA%3D',
  winners:
    'https://images.unsplash.com/photo-1778218736185-8c0260add718?w=1600&auto=format&fit=crop&q=65&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8d2lubmVycyUyMHNhaW5zfGVufDB8fDB8fHww',
} as const;
