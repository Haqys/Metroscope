import type {
  ArticleCard,
  ArticleListPage,
  ProseNode,
  PublicArticle,
  Taxonomy,
} from '@/lib/articles-api';
import type { PublicCompetition, PublicCompetitionDetail } from '@/lib/competitions-api';
import type { PublicProgram, PublicProgramDetail } from '@/lib/programs-api';
import type { SitemapEntry } from '@/lib/seo-api';
import type { FaqEntry, Mentor, MentorDetail, Testimonial } from '@/lib/surfaces-api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SAMPLE CONTENT. Not Metroscope's content.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Served only when `NEXT_PUBLIC_STANDALONE=true`, so the marketing site can be
 * deployed and reviewed before the API exists. Every programme, price, mentor,
 * testimonial, article and competition below is invented.
 *
 * ⚠️ **Three things here would be actively harmful if a real visitor believed
 * them**, and they are the reason `app/robots.ts` blocks crawlers and every
 * page carries `noindex` while the flag is on:
 *
 *   · **prices.** A parent who reads a monthly fee here and budgets for it has
 *     been told something untrue by the business.
 *   · **testimonials.** These are written, not collected. Publishing invented
 *     praise as though a customer said it is a lie about a named person, and
 *     in most markets an unlawful one.
 *   · **competition deadlines.** A family that plans around a date invented
 *     here can miss a real registration window.
 *
 * Typed against the same interfaces the API's responses are, so the day this
 * is deleted, the compiler finds every caller. The fix is to delete this file
 * and unset the flag, not to keep it in step with the real catalogue.
 *
 * Dates are computed from build time rather than written down, so a review
 * deployment never shows a deadline that has already passed.
 */

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const dateAt = (days: number) => at(days).slice(0, 10);

// ── programmes ───────────────────────────────────────────────────────────

const PROGRAM_BASE = {
  publishedAt: at(-120),
  updatedAt: at(-7),
  coverUrl: null,
  coverAlt: null,
  coverWidth: null,
  coverHeight: null,
} satisfies Partial<PublicProgram>;

export const MOCK_PROGRAMS: PublicProgram[] = [
  {
    ...PROGRAM_BASE,
    id: 'sample-program-olimpiade',
    slug: 'olimpiade-sains-matematika',
    name: 'Olimpiade Sains & Matematika',
    category: 'ACADEMIC',
    levels: ['SD', 'SMP', 'SMA'],
    summary:
      'Pendampingan intensif OSN dan olimpiade sains lain, dari penguatan konsep sampai simulasi babak final.',
    description:
      'Materi disusun per topik mengikuti silabus olimpiade, dengan latihan soal bertingkat dan pembahasan bersama mentor. Setiap siswa punya peta progress per topik sehingga orang tua tahu persis bagian mana yang sudah kuat dan mana yang masih perlu diulang.',
    durationMonths: 6,
    cadence: '2× seminggu · 90 menit',
    priceMonthly: 850_000,
  },
  {
    ...PROGRAM_BASE,
    id: 'sample-program-debat',
    slug: 'debat-dan-public-speaking',
    name: 'Debat & Public Speaking',
    category: 'NON_ACADEMIC',
    levels: ['SMP', 'SMA'],
    summary:
      'Latihan argumentasi, riset isu, dan penampilan di depan juri untuk lomba debat bahasa Indonesia dan Inggris.',
    description:
      'Kelas berjalan dalam format mosi mingguan: siswa menyiapkan kasus, beradu argumen, lalu mendapat umpan balik terstruktur dari mentor. Fokusnya bukan menang-kalah, tetapi kemampuan menyusun alasan dan menyampaikannya dengan tenang.',
    durationMonths: 4,
    cadence: '1× seminggu · 120 menit',
    priceMonthly: 700_000,
  },
  {
    ...PROGRAM_BASE,
    id: 'sample-program-kti',
    slug: 'karya-tulis-ilmiah',
    name: 'Karya Tulis Ilmiah',
    category: 'CREATIVE',
    levels: ['SMP', 'SMA'],
    summary:
      'Bimbingan dari pencarian ide, metode, penulisan, sampai presentasi untuk lomba KTI dan penelitian siswa.',
    description:
      'Siswa mengerjakan satu karya dari nol sepanjang program, dengan target yang diperiksa tiap pertemuan. Mentor membantu mempersempit topik, memilih metode yang realistis untuk jenjang sekolah, dan menyiapkan presentasi untuk dewan juri.',
    durationMonths: 5,
    cadence: '1× seminggu · 90 menit',
    priceMonthly: 750_000,
  },
];

const PROGRAM_DETAIL_EXTRA = {
  locale: 'id',
  seoTitle: null,
  seoDescription: null,
  seoCanonical: null,
  seoOgImageUrl: null,
  seoNoindex: false,
  seoJsonLd: null,
  stories: [],
} satisfies Omit<PublicProgramDetail, keyof PublicProgram | 'body'>;

export const MOCK_PROGRAM_DETAILS: PublicProgramDetail[] = MOCK_PROGRAMS.map((p) => ({
  ...p,
  ...PROGRAM_DETAIL_EXTRA,
  body: p.description,
}));

// ── mentors ──────────────────────────────────────────────────────────────

const MENTOR_BASE = {
  publishedAt: at(-90),
  photoUrl: null,
  photoAlt: null,
} satisfies Partial<Mentor>;

export const MOCK_MENTORS: Mentor[] = [
  {
    ...MENTOR_BASE,
    id: 'sample-mentor-1',
    slug: 'mentor-sains',
    displayName: 'Kak Dinda',
    headline: 'Mentor Olimpiade Sains',
    bio: 'Mendampingi siswa SD dan SMP untuk olimpiade sains, dengan penekanan pada pemahaman konsep sebelum latihan soal.',
    specialisms: ['Fisika', 'Matematika', 'OSN SD/SMP'],
    orderIndex: 1,
  },
  {
    ...MENTOR_BASE,
    id: 'sample-mentor-2',
    slug: 'mentor-matematika',
    displayName: 'Kak Bagus',
    headline: 'Mentor Matematika',
    bio: 'Fokus pada strategi pengerjaan soal olimpiade tingkat provinsi dan nasional untuk jenjang SMA.',
    specialisms: ['Matematika', 'Kombinatorika', 'OSN SMA'],
    orderIndex: 2,
  },
  {
    ...MENTOR_BASE,
    id: 'sample-mentor-3',
    slug: 'mentor-debat',
    displayName: 'Kak Ayu',
    headline: 'Mentor Debat & Public Speaking',
    bio: 'Melatih penyusunan argumen dan penyampaian di depan juri untuk lomba debat bahasa Indonesia dan Inggris.',
    specialisms: ['Debat', 'Public Speaking', 'Bahasa Inggris'],
    orderIndex: 3,
  },
  {
    ...MENTOR_BASE,
    id: 'sample-mentor-4',
    slug: 'mentor-kti',
    displayName: 'Kak Rama',
    headline: 'Mentor Karya Tulis Ilmiah',
    bio: 'Membimbing siswa menyusun penelitian yang realistis untuk jenjang sekolah, dari rumusan masalah sampai presentasi.',
    specialisms: ['Karya Tulis Ilmiah', 'Metodologi', 'Presentasi'],
    orderIndex: 4,
  },
];

export const MOCK_MENTOR_DETAILS: MentorDetail[] = MOCK_MENTORS.map((m) => ({
  ...m,
  seoTitle: null,
  seoDescription: null,
  seoCanonical: null,
  seoNoindex: false,
  articles: [],
}));

// ── FAQ ──────────────────────────────────────────────────────────────────

const faq = (
  id: string,
  question: string,
  answer: string,
  category: string,
  orderIndex: number,
): FaqEntry => ({ id, question, answer, category, orderIndex, locale: 'id' });

export const MOCK_FAQ: FaqEntry[] = [
  faq(
    'sample-faq-1',
    'Anak saya belum pernah ikut lomba. Boleh mendaftar?',
    'Boleh. Sebagian besar siswa memulai tanpa pengalaman lomba. Konsultasi awal dipakai untuk melihat titik mulai yang pas, lalu mentor menyusun urutan materi dari sana.',
    'Pendaftaran',
    1,
  ),
  faq(
    'sample-faq-2',
    'Bagaimana cara mendaftar?',
    'Isi formulir konsultasi gratis di halaman Konsultasi Gratis. Tim akan menghubungi untuk menyepakati jadwal konsultasi, dan pendaftaran resmi dilakukan setelah itu.',
    'Pendaftaran',
    2,
  ),
  faq(
    'sample-faq-3',
    'Apakah ada konsultasi gratis sebelum mendaftar?',
    'Ada. Konsultasi 1-on-1 minimal 45 menit, online atau tatap muka, tanpa biaya dan tanpa kewajiban melanjutkan.',
    'Pendaftaran',
    3,
  ),
  faq(
    'sample-faq-4',
    'Berapa jumlah siswa dalam satu kelas?',
    'Kelas dijaga kecil agar mentor sempat memeriksa pekerjaan setiap siswa pada pertemuan yang sama.',
    'Program',
    4,
  ),
  faq(
    'sample-faq-5',
    'Apakah jadwal les bisa diubah?',
    'Bisa. Permintaan pindah jadwal diajukan lewat portal paling lambat satu hari sebelum sesi, lalu dikonfirmasi tim.',
    'Program',
    5,
  ),
  faq(
    'sample-faq-6',
    'Bagaimana orang tua memantau perkembangan anak?',
    'Lewat portal siswa: jadwal, progress per topik, catatan mentor, hasil assessment bulanan, dan riwayat lomba ada di satu tempat.',
    'Program',
    6,
  ),
  faq(
    'sample-faq-7',
    'Bagaimana cara pembayaran?',
    'Pembayaran bulanan melalui transfer bank, dengan tagihan dan bukti transfer tercatat di portal.',
    'Pembayaran',
    7,
  ),
  faq(
    'sample-faq-8',
    'Apakah biaya pendaftaran lomba termasuk?',
    'Biaya pendaftaran lomba mengikuti ketentuan penyelenggara dan ditagihkan terpisah dari biaya bulanan.',
    'Pembayaran',
    8,
  ),
];

// ── testimonials ─────────────────────────────────────────────────────────

/**
 * Written for layout review, not collected from customers, so nobody is
 * quoted by name. "Orang tua siswa SMP" is a role, and the initial is not a
 * person. Real testimonials need real consent and belong in the CMS.
 */
export const MOCK_TESTIMONIALS: Testimonial[] = [
  {
    id: 'sample-testimonial-1',
    quote:
      'Contoh testimoni untuk pratinjau tampilan. Teks ini belum berasal dari orang tua siswa mana pun.',
    authorName: 'Orang tua siswa SD',
    authorRole: 'Olimpiade Sains',
    featured: true,
    orderIndex: 1,
    publishedAt: at(-40),
    programSlug: 'olimpiade-sains-matematika',
    programName: 'Olimpiade Sains & Matematika',
    photoUrl: null,
    photoAlt: null,
  },
  {
    id: 'sample-testimonial-2',
    quote:
      'Contoh testimoni kedua, dipakai untuk memeriksa panjang teks dan jarak antar kartu pada halaman testimoni.',
    authorName: 'Orang tua siswa SMP',
    authorRole: 'Debat & Public Speaking',
    featured: false,
    orderIndex: 2,
    publishedAt: at(-25),
    programSlug: 'debat-dan-public-speaking',
    programName: 'Debat & Public Speaking',
    photoUrl: null,
    photoAlt: null,
  },
  {
    id: 'sample-testimonial-3',
    quote:
      'Contoh testimoni ketiga. Ganti seluruh bagian ini dengan testimoni asli yang sudah diizinkan sebelum situs dipublikasikan.',
    authorName: 'Orang tua siswa SMA',
    authorRole: 'Karya Tulis Ilmiah',
    featured: false,
    orderIndex: 3,
    publishedAt: at(-10),
    programSlug: 'karya-tulis-ilmiah',
    programName: 'Karya Tulis Ilmiah',
    photoUrl: null,
    photoAlt: null,
  },
];

// ── articles ─────────────────────────────────────────────────────────────

const paragraph = (text: string): ProseNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const heading = (text: string): ProseNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});

const body = (intro: string, section: string, detail: string, close: string): ProseNode => ({
  type: 'doc',
  content: [paragraph(intro), heading(section), paragraph(detail), paragraph(close)],
});

interface MockArticleSeed {
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  category: { slug: string; name: string };
  tags: { slug: string; name: string }[];
  readingMin: number;
  ageDays: number;
  featured: boolean;
  body: ProseNode;
}

const ARTICLE_SEEDS: MockArticleSeed[] = [
  {
    slug: 'menyiapkan-osn-dari-nol',
    title: 'Menyiapkan OSN dari Nol: Urutan yang Masuk Akal',
    subtitle: 'Konsep dulu, soal kemudian',
    excerpt:
      'Banyak siswa mulai dari bank soal dan berhenti di tengah jalan. Urutan yang lebih tahan lama dimulai dari konsep.',
    category: { slug: 'persiapan-lomba', name: 'Persiapan Lomba' },
    tags: [
      { slug: 'osn', name: 'OSN' },
      { slug: 'sains', name: 'Sains' },
    ],
    readingMin: 6,
    ageDays: -12,
    featured: true,
    body: body(
      'Artikel contoh untuk pratinjau tata letak halaman artikel. Isinya belum ditulis oleh tim Metroscope.',
      'Mulai dari konsep',
      'Latihan soal berguna setelah konsep dasarnya berdiri. Siswa yang langsung mengerjakan soal olimpiade tanpa fondasi biasanya hafal pola, lalu tersandung begitu soalnya diputar sedikit.',
      'Ganti teks ini dengan artikel asli sebelum situs dipublikasikan.',
    ),
  },
  {
    slug: 'memilih-lomba-yang-tepat',
    title: 'Memilih Lomba yang Tepat untuk Anak',
    subtitle: 'Bukan sebanyak-banyaknya',
    excerpt:
      'Ikut banyak lomba tidak selalu menambah kemampuan. Beberapa pertimbangan sebelum mendaftar.',
    category: { slug: 'panduan-orang-tua', name: 'Panduan Orang Tua' },
    tags: [
      { slug: 'orang-tua', name: 'Orang Tua' },
      { slug: 'strategi', name: 'Strategi' },
    ],
    readingMin: 5,
    ageDays: -26,
    featured: false,
    body: body(
      'Artikel contoh untuk pratinjau. Teks ini hanya mengisi tata letak halaman.',
      'Kualitas di atas jumlah',
      'Satu lomba yang disiapkan matang memberi pengalaman yang lebih berguna daripada lima lomba yang diikuti tanpa persiapan.',
      'Ganti teks ini dengan artikel asli sebelum situs dipublikasikan.',
    ),
  },
  {
    slug: 'latihan-debat-di-rumah',
    title: 'Tiga Latihan Debat yang Bisa Dilakukan di Rumah',
    subtitle: 'Tanpa lawan, tanpa juri',
    excerpt: 'Latihan singkat untuk membiasakan anak menyusun alasan dan berbicara runtut.',
    category: { slug: 'persiapan-lomba', name: 'Persiapan Lomba' },
    tags: [
      { slug: 'debat', name: 'Debat' },
      { slug: 'public-speaking', name: 'Public Speaking' },
    ],
    readingMin: 4,
    ageDays: -45,
    featured: false,
    body: body(
      'Artikel contoh untuk pratinjau tampilan.',
      'Latihan pertama',
      'Minta anak menjelaskan satu pendapat dalam dua menit, lalu menjelaskan pendapat sebaliknya dengan sungguh-sungguh. Tujuannya melatih menyusun alasan, bukan memenangkan perdebatan.',
      'Ganti teks ini dengan artikel asli sebelum situs dipublikasikan.',
    ),
  },
  {
    slug: 'menulis-kti-pertama',
    title: 'Menulis Karya Tulis Ilmiah Pertama',
    subtitle: 'Mempersempit topik lebih dulu',
    excerpt: 'Kesalahan paling sering pada KTI pertama adalah topik yang terlalu besar.',
    category: { slug: 'panduan-orang-tua', name: 'Panduan Orang Tua' },
    tags: [{ slug: 'kti', name: 'KTI' }],
    readingMin: 7,
    ageDays: -60,
    featured: false,
    body: body(
      'Artikel contoh untuk pratinjau tampilan halaman artikel.',
      'Persempit dulu',
      'Topik yang terlalu luas membuat penelitian tidak selesai dalam waktu yang tersedia. Mempersempit pertanyaan di awal menghemat berminggu-minggu di belakang.',
      'Ganti teks ini dengan artikel asli sebelum situs dipublikasikan.',
    ),
  },
];

const toCard = (s: MockArticleSeed): ArticleCard => ({
  id: `sample-article-${s.slug}`,
  slug: s.slug,
  title: s.title,
  subtitle: s.subtitle,
  excerpt: s.excerpt,
  locale: 'id',
  featured: s.featured,
  readingMin: s.readingMin,
  publishedAt: at(s.ageDays),
  updatedAt: at(s.ageDays),
  categorySlug: s.category.slug,
  categoryName: s.category.name,
  authorName: 'Tim Metroscope',
  coverUrl: null,
  coverAlt: null,
  coverWidth: null,
  coverHeight: null,
  tags: s.tags,
});

export const MOCK_ARTICLE_CARDS: ArticleCard[] = ARTICLE_SEEDS.map(toCard);

export const MOCK_ARTICLES: PublicArticle[] = ARTICLE_SEEDS.map((s) => ({
  ...toCard(s),
  body: s.body,
  categoryDescription: null,
  viewCount: 0,
  seoTitle: null,
  seoDescription: null,
  seoCanonical: null,
  seoOgImageUrl: null,
  seoNoindex: false,
  seoJsonLd: null,
  related: MOCK_ARTICLE_CARDS.filter((c) => c.slug !== s.slug).slice(0, 2),
}));

/** Paginated and filtered here, because in standalone there is nothing to ask. */
export function mockArticlePage(query: {
  category?: string;
  tag?: string;
  q?: string;
  featured?: boolean;
  page?: number;
  perPage?: number;
}): ArticleListPage {
  const perPage = query.perPage ?? 9;
  const page = query.page ?? 1;

  let items = MOCK_ARTICLE_CARDS;
  if (query.category) items = items.filter((a) => a.categorySlug === query.category);
  if (query.tag) items = items.filter((a) => a.tags.some((t) => t.slug === query.tag));
  if (query.featured) items = items.filter((a) => a.featured);
  if (query.q) {
    const needle = query.q.toLowerCase();
    items = items.filter(
      (a) =>
        a.title.toLowerCase().includes(needle) || (a.excerpt ?? '').toLowerCase().includes(needle),
    );
  }

  const total = items.length;
  return {
    items: items.slice((page - 1) * perPage, page * perPage),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

export const MOCK_TAXONOMY: Taxonomy = {
  categories: [
    {
      slug: 'persiapan-lomba',
      name: 'Persiapan Lomba',
      description: 'Cara menyiapkan diri sebelum hari lomba.',
      articleCount: MOCK_ARTICLE_CARDS.filter((a) => a.categorySlug === 'persiapan-lomba').length,
    },
    {
      slug: 'panduan-orang-tua',
      name: 'Panduan Orang Tua',
      description: 'Hal-hal yang perlu diketahui orang tua.',
      articleCount: MOCK_ARTICLE_CARDS.filter((a) => a.categorySlug === 'panduan-orang-tua').length,
    },
  ],
  tags: Array.from(
    MOCK_ARTICLE_CARDS.reduce((acc, a) => {
      for (const t of a.tags)
        acc.set(t.slug, { ...t, articleCount: (acc.get(t.slug)?.articleCount ?? 0) + 1 });
      return acc;
    }, new Map<string, { slug: string; name: string; articleCount: number }>()).values(),
  ),
};

// ── competitions ─────────────────────────────────────────────────────────

interface CompetitionSeed {
  slug: string;
  name: string;
  summary: string;
  organizer: string;
  level: PublicCompetition['level'];
  format: PublicCompetition['format'];
  mode: PublicCompetition['mode'];
  categories: string[];
  levels: PublicCompetition['levels'];
  fee: number | null;
  deadlineInDays: number;
  eventInDays: number;
}

const COMPETITION_SEEDS: CompetitionSeed[] = [
  {
    slug: 'olimpiade-sains-tingkat-kota',
    name: 'Olimpiade Sains Tingkat Kota',
    summary: 'Seleksi tingkat kota untuk bidang Matematika, IPA, dan Informatika.',
    organizer: 'Dinas Pendidikan Kota',
    level: 'REGIONAL',
    format: 'INDIVIDUAL',
    mode: 'OFFLINE',
    categories: ['Matematika', 'IPA'],
    levels: ['SD', 'SMP'],
    fee: null,
    deadlineInDays: 21,
    eventInDays: 45,
  },
  {
    slug: 'lomba-debat-bahasa-indonesia',
    name: 'Lomba Debat Bahasa Indonesia',
    summary: 'Kompetisi debat beregu untuk jenjang SMP dan SMA tingkat provinsi.',
    organizer: 'Panitia Debat Provinsi',
    level: 'PROVINCIAL',
    format: 'TEAM',
    mode: 'OFFLINE',
    categories: ['Debat'],
    levels: ['SMP', 'SMA'],
    fee: 150_000,
    deadlineInDays: 35,
    eventInDays: 60,
  },
  {
    slug: 'lomba-karya-tulis-ilmiah-nasional',
    name: 'Lomba Karya Tulis Ilmiah Nasional',
    summary: 'Kompetisi penelitian siswa dengan babak penyisihan daring dan final tatap muka.',
    organizer: 'Universitas Penyelenggara',
    level: 'NATIONAL',
    format: 'BOTH',
    mode: 'HYBRID',
    categories: ['Karya Tulis Ilmiah'],
    levels: ['SMA'],
    fee: 200_000,
    deadlineInDays: 54,
    eventInDays: 90,
  },
  {
    slug: 'kompetisi-matematika-sd',
    name: 'Kompetisi Matematika SD',
    summary: 'Kompetisi matematika daring untuk siswa sekolah dasar.',
    organizer: 'Yayasan Pendidikan',
    level: 'NATIONAL',
    format: 'INDIVIDUAL',
    mode: 'ONLINE',
    categories: ['Matematika'],
    levels: ['SD'],
    fee: 100_000,
    deadlineInDays: 12,
    eventInDays: 30,
  },
  {
    slug: 'olimpiade-sains-provinsi',
    name: 'Olimpiade Sains Tingkat Provinsi',
    summary: 'Lanjutan seleksi kota, pendaftaran dibuka setelah pengumuman tingkat kota.',
    organizer: 'Dinas Pendidikan Provinsi',
    level: 'PROVINCIAL',
    format: 'INDIVIDUAL',
    mode: 'OFFLINE',
    categories: ['Matematika', 'Fisika', 'Biologi'],
    levels: ['SMP', 'SMA'],
    fee: null,
    deadlineInDays: 80,
    eventInDays: 110,
  },
];

export const MOCK_COMPETITIONS: PublicCompetition[] = COMPETITION_SEEDS.map((s) => ({
  id: `sample-competition-${s.slug}`,
  slug: s.slug,
  name: s.name,
  summary: s.summary,
  description: `${s.summary} Keterangan ini adalah contoh untuk pratinjau dan bukan informasi resmi penyelenggara.`,
  organizer: s.organizer,
  venue: s.mode === 'ONLINE' ? null : 'Denpasar, Bali',
  level: s.level,
  format: s.format,
  mode: s.mode,
  categories: s.categories,
  levels: s.levels,
  registrationFee: s.fee,
  feeNote: s.fee === null ? 'Gratis' : null,
  registrationUrl: null,
  guidebookUrl: null,
  registrationOpensAt: at(-14),
  registrationDeadline: dateAt(s.deadlineInDays),
  eventStart: dateAt(s.eventInDays),
  eventEnd: dateAt(s.eventInDays + 1),
  /** Computed, never written down: a deadline 60 days out is not "CLOSED". */
  phase: s.deadlineInDays < 0 ? 'CLOSED' : s.deadlineInDays > 60 ? 'UPCOMING' : 'OPEN',
  coverKey: null,
  coverAlt: null,
}));

export const MOCK_COMPETITION_DETAILS: PublicCompetitionDetail[] = MOCK_COMPETITIONS.map((c) => ({
  ...c,
  seoTitle: null,
  seoDescription: null,
  seoCanonical: null,
  seoNoindex: false,
  seoOgImageKey: null,
}));

// ── sitemap ──────────────────────────────────────────────────────────────

/**
 * Empty on purpose.
 *
 * `app/robots.ts` disallows every crawler in standalone, so a sitemap listing
 * sample pages would be an invitation nobody should accept. The static routes
 * the sitemap adds itself are harmless and stay.
 */
export const MOCK_SITEMAP_ENTRIES: SitemapEntry[] = [];
