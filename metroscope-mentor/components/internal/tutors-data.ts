/**
 * Dummy tutor data mirroring the wireframe (Ringkasan 5/7) until the tutors
 * module is wired (`GET /tutors`).
 */

export type TutorStatus = 'Aktif' | 'Cuti' | 'Nonaktif';

export interface TutorRow {
  id: string;
  name: string;
  specialty: string;
  students: number;
  rating: number;
  feePerSession: number;
  status: TutorStatus;
  /** Weekly availability, Monday-first; empty array = Libur. */
  availability: string[][];
}

export const TUTOR_STATUS_BADGE: Record<TutorStatus, string> = {
  Aktif: 'bg-emerald-100 text-emerald-700',
  Cuti: 'bg-amber-100 text-amber-700',
  Nonaktif: 'bg-neutral-200 text-neutral-500',
};

export const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const;

export const TUTORS: TutorRow[] = [
  {
    id: 'dinda',
    name: 'Kak Dinda',
    specialty: 'Olimpiade Sains',
    students: 14,
    rating: 4.9,
    feePerSession: 150_000,
    status: 'Aktif',
    availability: [['16.00'], [], ['10.00', '16.00'], [], ['16.00'], ['10.00', '13.00'], []],
  },
  {
    id: 'farrel',
    name: 'Kak Farrel',
    specialty: 'Debat & Public Speaking',
    students: 9,
    rating: 4.7,
    feePerSession: 140_000,
    status: 'Aktif',
    availability: [[], ['15.00'], [], ['15.00', '17.00'], [], ['09.00'], []],
  },
  {
    id: 'wulan',
    name: 'Kak Wulan',
    specialty: 'Karya Tulis & Riset',
    students: 6,
    rating: 4.8,
    feePerSession: 130_000,
    status: 'Cuti',
    availability: [[], [], [], [], [], [], []],
  },
];

export const TUTOR_STATS = {
  active: TUTORS.filter((t) => t.status === 'Aktif').length + 6, // org-wide count
  sessionsThisWeek: 42,
  avgRating: 4.8,
  feeThisMonth: 31_500_000,
};

export function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}
