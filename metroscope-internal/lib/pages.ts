import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  BookOpen,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardList,
  Flag,
  Globe,
  Newspaper,
  Image as ImageIcon,
  GraduationCap,
  House,
  Inbox,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  Users,
  UserCog,
  Wallet,
  Tags,
  Trophy,
} from 'lucide-react';

/**
 * Canonical catalogue of every internal page that can be granted to a role.
 *
 * Backbone of custom roles (doc 12): the Head builds a role by ticking pages
 * from this list, so a new role needs no code change. Adding a page here makes
 * it immediately grantable, and the sidebar picks it up automatically.
 *
 * Grouped into the four layers from doc 13 §4.1. Kerja (work), records,
 * content, settings, rather than by database table, which is what made the old
 * menu read as a list of nouns nobody's job is named after.
 *
 * ⚠️ TODO (doc 14 Phase 0.4): serve from `GET /v1/roles/pages` so the catalogue
 * and the grants live in one place, the database.
 */
export interface PageDef {
  /** Route prefix, access to it also grants its sub-routes. */
  href: string;
  label: string;
  group: PageGroup;
  icon: LucideIcon;
  /** Shown in the sidebar (some pages are detail-only, reached from a parent). */
  inNav?: boolean;
  /** Cannot be revoked from the Head, keeps the system administrable. */
  locked?: boolean;
  description?: string;
}

export type PageGroup = 'Kerja' | 'Siswa' | 'Akademik' | 'Keuangan' | 'Tim' | 'Konten' | 'Setelan';

export const PAGE_GROUPS: PageGroup[] = [
  'Kerja',
  'Siswa',
  'Akademik',
  'Keuangan',
  'Tim',
  'Konten',
  'Setelan',
];

export const PAGES: PageDef[] = [
  //,,, Kerja: "apa yang perlu saya kerjakan sekarang?",,,
  {
    href: '/home',
    label: 'Beranda',
    group: 'Kerja',
    icon: House,
    inNav: true,
    locked: true,
    description: 'Widget sesuai peran yang kamu pegang',
  },
  {
    href: '/inbox',
    label: 'Kotak Masuk',
    group: 'Kerja',
    icon: Inbox,
    inNav: true,
    description: 'Semua keputusan yang menunggu, satu antrean',
  },
  {
    href: '/tasks',
    label: 'Tugas',
    group: 'Kerja',
    icon: ClipboardList,
    inNav: true,
    description: 'Papan delegasi tim',
  },
  {
    href: '/overview',
    label: 'Overview',
    group: 'Kerja',
    icon: LayoutDashboard,
    inNav: true,
    description: 'Dashboard eksekutif, khusus Ketua',
  },

  //,,, Siswa,,,
  {
    href: '/leads',
    label: 'Pendaftar',
    group: 'Siswa',
    icon: Users,
    inNav: true,
    description: 'Pipeline lead: approve, konsultasi, follow-up',
  },
  {
    href: '/students',
    label: 'Siswa',
    group: 'Siswa',
    icon: GraduationCap,
    inNav: true,
    description: 'Database siswa + profil 360°',
  },

  //,,, Akademik,,,
  {
    href: '/schedule',
    label: 'Jadwal',
    group: 'Akademik',
    icon: CalendarRange,
    inNav: true,
    description: 'Kalender gabungan tim & sesi les',
  },
  {
    href: '/competitions',
    label: 'Lomba',
    group: 'Akademik',
    icon: Flag,
    inNav: true,
    description: 'Database lomba, peserta, dan kesiapan',
  },
  {
    href: '/materials',
    label: 'Materi',
    group: 'Akademik',
    icon: BookOpen,
    inNav: true,
    description: 'Modul, topik, dan hak akses materi',
  },
  {
    href: '/assessments',
    label: 'Assessment',
    group: 'Akademik',
    icon: BadgeCheck,
    inNav: true,
    description: 'Antrean cakupan penilaian bulanan',
  },
  {
    href: '/progress',
    label: 'Progress',
    group: 'Akademik',
    icon: ChartNoAxesCombined,
    inNav: true,
    description: 'Progress per topik & hasil lomba',
  },

  //,,, Keuangan,,,
  {
    href: '/finance',
    label: 'Ringkasan Keuangan',
    group: 'Keuangan',
    icon: Wallet,
    inNav: true,
    description: 'Kas masuk, umur piutang, tingkat penagihan',
  },
  {
    href: '/finance/invoices',
    label: 'Tagihan',
    group: 'Keuangan',
    icon: ReceiptText,
    inNav: true,
    description: 'Semua tagihan + penerbitan bulanan',
  },
  {
    href: '/finance/verifications',
    label: 'Verifikasi Bayar',
    group: 'Keuangan',
    icon: ShieldCheck,
    inNav: true,
    description: 'Setujui/tolak bukti transfer',
  },

  //,,, Tim,,,
  {
    href: '/team',
    label: 'Anggota Tim',
    group: 'Tim',
    icon: UserCog,
    inNav: true,
    description: 'Staf, mentor, ketersediaan, dan kinerja',
  },

  //,,, Konten,,,
  {
    href: '/site',
    label: 'Situs (CMS)',
    group: 'Konten',
    icon: Globe,
    inNav: true,
    description: 'Draf, review, jadwal terbit, dan riwayat versi',
  },
  {
    href: '/site/pages',
    label: 'Halaman',
    group: 'Konten',
    icon: LayoutDashboard,
    inNav: true,
    description: 'Halaman pemasaran berbasis blok',
  },
  {
    href: '/site/programs',
    label: 'Program',
    group: 'Konten',
    icon: GraduationCap,
    inNav: true,
    description: 'Isi halaman program dan harganya',
  },
  {
    href: '/site/articles',
    label: 'Artikel',
    group: 'Konten',
    icon: Newspaper,
    inNav: true,
    description: 'Tulis, review, dan terbitkan artikel',
  },
  {
    href: '/site/taxonomy',
    label: 'Kategori & Tag',
    group: 'Konten',
    icon: Tags,
    inNav: true,
    description: 'Navigasi dan pengelompokan artikel',
  },
  {
    href: '/site/collections/faq',
    label: 'FAQ',
    group: 'Konten',
    icon: ClipboardList,
    inNav: true,
    description: 'Pertanyaan umum di situs',
  },
  {
    href: '/site/collections/testimonial',
    label: 'Testimoni',
    group: 'Konten',
    icon: BadgeCheck,
    inNav: true,
    description: 'Kutipan orang tua + catatan izin',
  },
  {
    href: '/site/collections/mentor',
    label: 'Profil Mentor',
    group: 'Konten',
    icon: Users,
    inNav: true,
    description: 'Profil mentor yang tampil publik',
  },
  {
    /**
     * The marketing half of a competition (§3.4).
     *
     * Same row as `/competitions`, different job: this edits the copy that goes
     * on the public calendar, that one runs the lomba. doc 13 §9.4 asked for a
     * collection that "mirrors /competitions", §12.8 asked for one source, and
     * one source wins.
     */
    href: '/site/collections/competition',
    label: 'Info Lomba',
    group: 'Konten',
    icon: Trophy,
    inNav: true,
    description: 'Isi publik lomba di kalender marketing',
  },
  {
    /**
     * §3.7, the curated collection doc 13 §9.4 names. A filtered view of the
     * articles that already exist, not a second store of competition results.
     */
    href: '/site/achievements',
    label: 'Prestasi Siswa',
    group: 'Konten',
    icon: Trophy,
    inNav: true,
    description: 'Artikel prestasi, sebagian dibuat otomatis dari hasil lomba',
  },
  {
    href: '/site/forms',
    label: 'Pesan Masuk',
    group: 'Konten',
    icon: Inbox,
    inNav: true,
    description: 'Pesan dari formulir kontak',
  },
  {
    href: '/site/media',
    label: 'Media',
    group: 'Konten',
    icon: ImageIcon,
    inNav: true,
    description: 'Pustaka gambar & dokumen',
  },
  {
    href: '/content',
    label: 'Konten Saya',
    group: 'Konten',
    icon: BookOpen,
    inNav: true,
    description: 'Buat artikel/porto/story',
  },
  {
    href: '/content-approval',
    label: 'Approval Konten',
    group: 'Konten',
    icon: BadgeCheck,
    inNav: true,
    description: 'Setujui konten sebelum tayang',
  },

  //,,, Setelan,,,
  {
    href: '/settings/organization',
    label: 'Rekening & Organisasi',
    group: 'Setelan',
    icon: Wallet,
    inNav: true,
    description: 'Rekening tujuan transfer yang dilihat orang tua',
  },
  {
    href: '/settings/roles',
    label: 'Kelola Role',
    group: 'Setelan',
    icon: ShieldCheck,
    inNav: true,
    locked: true,
    description: 'Buat role custom & atur halaman + aksinya',
  },
];

/** Pages every signed-in user gets regardless of role (own profile, etc). */
export const ALWAYS_ALLOWED = ['/settings/profile'];

export function pageByHref(href: string): PageDef | undefined {
  return PAGES.find((p) => p.href === href);
}

export function pagesInGroup(group: PageGroup): PageDef[] {
  return PAGES.filter((p) => p.group === group);
}

/** Longest-prefix match so `/finance/invoices` beats `/finance`. */
export function matchPage(pathname: string): PageDef | undefined {
  return PAGES.filter((p) => pathname === p.href || pathname.startsWith(`${p.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
