import type { Role, TaskPriority, TaskStatus } from '@/lib/types';

/**
 * Dummy task board data mirroring the wireframe (Ringkasan 1/7) until the
 * tasks module is wired (`GET /tasks`). Delegation flows from Balqis (HEAD).
 */
export interface TaskChecklistItem {
  label: string;
  done: boolean;
}

export interface BoardTask {
  id: string;
  title: string;
  /** Role that owns the task, rendered as the PIC chip. */
  pic: Role;
  assignee: string;
  priority: TaskPriority;
  due: string; // "5 Agu"
  overdue?: boolean;
  status: TaskStatus;

  //,,, Detail (shown in the task dialog),,,
  description?: string;
  /** Who delegated it, always the Head in v1. */
  createdBy?: string;
  createdAt?: string;
  attachment?: { name: string; size: string };
  checklist?: TaskChecklistItem[];
}

export const COLUMNS: { id: TaskStatus; label: string; tone: string; dot: string }[] = [
  {
    id: 'TODO',
    label: 'Belum Dikerjakan',
    tone: 'bg-neutral-200/80 text-neutral-600',
    dot: 'bg-neutral-400',
  },
  { id: 'IN_PROGRESS', label: 'Proses', tone: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  { id: 'DONE', label: 'Selesai', tone: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
];

/**
 * PIC chip colours per role.
 *
 * Tasks are assigned to staff, so only the seeded roles appear. Partial, not
 * Record<Role, …>: a custom role invented by the Head has no entry here and
 * falls back at the call site (doc 12 §1).
 */
export const PIC_STYLE: Partial<Record<Role, string>> & Record<string, string> = {
  HEAD: 'bg-violet-50 text-violet-700 ring-violet-200/70',
  SECRETARY: 'bg-sky-50 text-sky-700 ring-sky-200/70',
  FINANCE: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  MENTOR: 'bg-navy-light text-navy ring-navy/15',
  EDITOR: 'bg-amber-50 text-amber-700 ring-amber-200/70',
};

/** Neutral chip for any role without a dedicated colour. */
export const PIC_STYLE_FALLBACK = 'bg-neutral-100 text-neutral-600 ring-neutral-200';

export const PRIORITY_STYLE: Record<TaskPriority, { label: string; cls: string }> = {
  URGENT: { label: 'Urgent', cls: 'bg-maroon text-white' },
  HIGH: { label: 'Tinggi', cls: 'bg-maroon-light text-maroon' },
  MEDIUM: { label: 'Sedang', cls: 'bg-amber-50 text-amber-700' },
  LOW: { label: 'Rendah', cls: 'bg-neutral-100 text-neutral-500' },
};

export const INITIAL_TASKS: BoardTask[] = [
  // Belum Dikerjakan
  {
    id: 't1',
    title: 'Update artikel promo lomba Agustus',
    pic: 'EDITOR',
    assignee: 'Kak Rafi',
    priority: 'HIGH',
    due: '5 Agu',
    status: 'TODO',
    description:
      'Tulis ulang artikel promo untuk lomba Agustus. Sertakan 3 lomba terdekat (IID, ISIF, WASISC) beserta deadline pendaftarannya.',
    createdBy: 'Balqis',
    createdAt: '28 Jul 2026',
    attachment: { name: 'brief-promo-agustus.pdf', size: '240 KB' },
    checklist: [
      { label: 'Riset 3 lomba terdekat', done: true },
      { label: 'Draft artikel', done: false },
      { label: 'Siapkan gambar pendukung', done: false },
    ],
  },
  {
    id: 't2',
    title: 'Rekap absensi les Juli',
    pic: 'SECRETARY',
    assignee: 'Kak Sarah',
    priority: 'MEDIUM',
    due: '2 Agu',
    overdue: true,
    status: 'TODO',
    description:
      'Rekap kehadiran seluruh siswa bulan Juli, pisahkan Hadir / Izin / Alpa, lalu unggah ke database siswa.',
    createdBy: 'Balqis',
    createdAt: '25 Jul 2026',
    checklist: [
      { label: 'Tarik data absensi Juli', done: true },
      { label: 'Verifikasi siswa izin', done: false },
    ],
  },
  {
    id: 't3',
    title: 'Follow up invoice tertunggak',
    pic: 'FINANCE',
    assignee: 'Kak Bima',
    priority: 'URGENT',
    due: '1 Agu',
    overdue: true,
    status: 'TODO',
    description:
      'Hubungi orang tua siswa yang menunggak lebih dari 30 hari. Tawarkan opsi cicilan bila diperlukan.',
    createdBy: 'Balqis',
    createdAt: '24 Jul 2026',
    checklist: [
      { label: 'Susun daftar tunggakan', done: true },
      { label: 'Kirim WA pengingat', done: false },
      { label: 'Catat hasil percakapan', done: false },
    ],
  },
  // Proses
  {
    id: 't4',
    title: 'Siapkan materi konsultasi OSN batch 3',
    pic: 'MENTOR',
    assignee: 'Kak Dinda',
    priority: 'HIGH',
    due: '6 Agu',
    status: 'IN_PROGRESS',
    description:
      'Susun materi untuk sesi konsultasi OSN batch 3, fokus ke soal kombinatorika dan pola bilangan.',
    createdBy: 'Balqis',
    createdAt: '26 Jul 2026',
    attachment: { name: 'kisi-kisi-osn.pdf', size: '1,1 MB' },
    checklist: [
      { label: 'Kumpulkan soal latihan', done: true },
      { label: 'Buat slide pembahasan', done: true },
      { label: 'Review bersama Balqis', done: false },
    ],
  },
  {
    id: 't5',
    title: 'Approval testimoni ortu baru',
    pic: 'HEAD',
    assignee: 'Balqis',
    priority: 'MEDIUM',
    due: '4 Agu',
    status: 'IN_PROGRESS',
    description: 'Tinjau testimoni orang tua yang baru masuk sebelum ditayangkan di website.',
    createdBy: 'Balqis',
    createdAt: '27 Jul 2026',
  },
  // Selesai
  {
    id: 't6',
    title: 'Input data siswa baru (5 orang)',
    pic: 'SECRETARY',
    assignee: 'Kak Sarah',
    priority: 'MEDIUM',
    due: '28 Jul',
    status: 'DONE',
    description: 'Input 5 siswa baru hasil approve pendaftaran minggu ini ke database.',
    createdBy: 'Balqis',
    createdAt: '20 Jul 2026',
    checklist: [
      { label: 'Input data diri', done: true },
      { label: 'Buat akun portal', done: true },
    ],
  },
  {
    id: 't7',
    title: 'Update porto juara OSK',
    pic: 'MENTOR',
    assignee: 'Kak Dinda',
    priority: 'LOW',
    due: '27 Jul',
    status: 'DONE',
    description: 'Perbarui porto siswa yang menang OSK, lengkap dengan sertifikat dan foto.',
    createdBy: 'Balqis',
    createdAt: '19 Jul 2026',
  },
  {
    id: 't8',
    title: 'Publikasi story IG minggu ini',
    pic: 'EDITOR',
    assignee: 'Kak Rafi',
    priority: 'LOW',
    due: '26 Jul',
    status: 'DONE',
    description: 'Publikasikan story Instagram rekap kegiatan minggu ini.',
    createdBy: 'Balqis',
    createdAt: '18 Jul 2026',
  },
];
