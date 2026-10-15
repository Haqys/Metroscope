import type {
  ArticleCard,
  ArticleListPage,
  ProseNode,
  PublicArticle,
  Taxonomy,
} from '@/lib/articles-api';
import type { PublicCompetition, PublicCompetitionDetail } from '@/lib/competitions-api';
import type { PublicProgram, PublicProgramDetail, ProgramStory } from '@/lib/programs-api';
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
      'Kerangka pendampingan intensif olimpiade sains dan matematika yang memprioritaskan pemahaman konsep mendasar, dekonstruksi soal non-rutin, dan pembentukan ketahanan mental bertanding.',
    description:
      'Materi disusun per topik mengikuti silabus olimpiade, dengan latihan soal bertingkat dan pembahasan bersama mentor. Setiap siswa memiliki peta progress per topik sehingga orang tua dan siswa tahu persis bagian mana yang sudah kuat dan mana yang masih perlu diulang.',
    durationMonths: 6,
    cadence: '2× seminggu · 90 menit',
    priceMonthly: 850_000,
    coverUrl: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1200&auto=format&fit=crop&q=80',
    coverAlt: 'Siswa Metroscope dalam sesi pendampingan sains dan matematika',
  },
  {
    ...PROGRAM_BASE,
    id: 'sample-program-debat',
    slug: 'debat-dan-public-speaking',
    name: 'Debat & Public Speaking',
    category: 'NON_ACADEMIC',
    levels: ['SMP', 'SMA'],
    summary:
      'Inkubator retorika, riset isu global, dan konstruksi argumentasi logis untuk melahirkan pemikir muda yang berani bersuara di panggung kompetisi nasional maupun internasional.',
    description:
      'Kelas berjalan dalam format mosi mingguan: siswa menyiapkan kasus, beradu argumen, lalu mendapat umpan balik terstruktur dari mentor. Fokusnya bukan menang-kalah, tetapi kemampuan menyusun alasan dan menyampaikannya dengan tenang.',
    durationMonths: 4,
    cadence: '1× seminggu · 120 menit',
    priceMonthly: 700_000,
    coverUrl: 'https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=1200&auto=format&fit=crop&q=80',
    coverAlt: 'Siswa Metroscope dalam sesi latihan debat dan public speaking',
  },
  {
    ...PROGRAM_BASE,
    id: 'sample-program-kti',
    slug: 'karya-tulis-ilmiah',
    name: 'Karya Tulis Ilmiah',
    category: 'CREATIVE',
    levels: ['SMP', 'SMA'],
    summary:
      'Pendampingan komprehensif riset siswa mulai dari perumusan hipotesis orisinal, metodologi ilmiah terapan, hingga penulisan naskah standar jurnal dan persiapan sidang juri.',
    description:
      'Siswa mengerjakan satu karya penelitian dari nol sepanjang program, dengan target yang dievaluasi tiap pertemuan. Mentor membantu mempersempit topik, memilih metode yang realistis untuk jenjang sekolah, dan menyiapkan presentasi untuk dewan juri.',
    durationMonths: 5,
    cadence: '1× seminggu · 90 menit',
    priceMonthly: 750_000,
    coverUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&auto=format&fit=crop&q=80',
    coverAlt: 'Pendampingan riset karya tulis ilmiah Metroscope',
  },
];

const PROGRAM_ARTICLES_MAP: Record<string, { body: string; stories: ProgramStory[] }> = {
  'olimpiade-sains-matematika': {
    body: `Sebagian besar siswa yang menghadapi Olimpiade Sains Nasional (OSN) atau kompetisi sains internasional memulai perjalanan mereka dari tumpukan bank soal tanpa fondasi konsep yang memadai. Ketika pembuat soal mengubah sedikit saja pola atau sudut pandang pertanyaan, siswa kerap kehilangan arah karena hanya mengandalkan hafalan pola jawaban.

Di Metroscope, kami memandang persiapan olimpiade bukan sekadar "trik rumus cepat". Program ini dirancang sebagai inkubator nalar ilmiah: membiasakan siswa memahami mengapa suatu teorema bekerja, bagaimana sebuah prinsip fisika atau kimia diturunkan dari kondisi batas, serta bagaimana menyusun pembuktian matematika yang rigor, rapi, dan elegan.

Kurikulum kami disusun secara terstruktur ke dalam tiga tahapan pembinaan berkesinambungan:

Pertama, Penguatan Fondasi & Pemetaan Diagnostik. Siswa diajak membedah kembali silabus fundamental dari akarnya. Kami mengidentifikasi celah pemahaman (misconceptions) yang kerap terlewat di sekolah umum dan membangun kembali pemahaman intuitifnya secara mendalam.

Kedua, Analisis Soal Non-Rutin & Multi-Solusi. Siswa ditantang memecahkan persoalan sulit menggunakan 2 hingga 3 pendekatan alternatif. Latihan ini menumbuhkan fleksibilitas kognitif dan intuisi analitis yang menjadi kunci utama saat menghadapi soal-soal kejutan di babak provinsi maupun nasional.

Ketiga, Simulasi Babak Kompetisi & Manajemen Waktu. Menjelang kompetisi riil, siswa menjalani simulasi kondisi sebenarnya dengan batasan waktu ketat. Mentor membedah strategi seleksi soal, alokasi waktu per butir pertanyaan, serta menjaga ketenangan psikologis saat menghadapi kebuntuan.

Setiap siswa memiliki profil kekuatan yang unik. Melalui sistem evaluasi berkala Metroscope, perkembangan setiap topik dicatat secara visual dalam peta kompetensi personal. Orang tua dan siswa dapat melihat dengan transparan modul mana yang telah dikuasai dan area mana yang membutuhkan perhatian ekstra.

Tujuan akhir dari pendampingan ini melampaui raihan medali. Kami membangun ketahanan mental (grit), kejujuran akademik, dan rasa ingin tahu yang tak kunjung padam—bekal seumur hidup yang akan mengantar siswa unggul di jenjang pendidikan tinggi global.`,
    stories: [
      {
        slug: 'menyiapkan-osn-dari-nol',
        title: 'Menyiapkan OSN dari Nol: Urutan yang Masuk Akal',
        excerpt: 'Banyak siswa mulai dari bank soal lalu berhenti di tengah jalan. Urutan yang lebih tahan lama dimulai dari konsep.',
        publishedAt: at(-12),
        readingMin: 6,
        coverUrl: '/images/students/Alex.jpeg',
        coverAlt: 'Siswa Metroscope',
      },
    ],
  },
  'debat-dan-public-speaking': {
    body: `Debat kompetitif sering disalahartikan sebagai ajang berbicara cepat atau saling mendominasi secara agresif. Di Metroscope, kami mendefinisikan debat sebagai seni penalaran tingkat tinggi: kemampuan mendengar secara empatik, membedah struktur argumen lawan dalam hitungan detik, serta menyajikan sanggahan logis berbasis bukti yang runtut dan persuasif.

Program ini dirancang untuk melahirkan pemikir muda yang berani bersuara dengan dasar data yang kuat, baik dalam format debat bahasa Indonesia maupun format internasional seperti World Schools Debating Championship (WSDC) dan Asian Parliamentary.

Pembelajaran dibangun dengan pendekatan aktif melalui siklus latihan mosi mingguan:

Riset Isu Kontemporer & Geopolitik: Siswa membedah isu-isu krusial dunia nyata, mulai dari transisi energi terbarukan, etika kecerdasan buatan, ekonomi sirkular, hingga kebijakan pendidikan global untuk memperkaya basis wawasan mereka.

Konstruksi Argumen Terstandar AREL: Siswa dibiasakan menyusun setiap poin gagasan melalui kerangka Assertion (Klaim), Reasoning (Penalaran Logis), Evidence (Bukti Empiris), dan Linkback (Relevansi terhadap Mosi) agar argumen berdiri kokoh di bawah tekanan interupsi.

Simulasi Kamar Debat & Adjudikasi Komprehensif: Setiap sesi latihan diakhiri dengan evaluasi mendalam dari mentor berpengalaman, memberikan umpan balik langsung mengenai poise panggung, modulasi vokal, dan kedalaman argumen.

Banyak siswa berbakat menahan diri karena rasa cemas berbicara di hadapan publik (glossophobia). Lingkungan mentoring di Metroscope dirancang aman, inklusif, dan saling mendukung, mengubah ketakutan berbicara menjadi rasa percaya diri yang otentik.

Kemampuan mengartikulasikan ide secara tenang di bawah tekanan adalah keterampilan kepemimpinan seumur hidup. Alumni dari program ini telah membuktikan kepiawaian mereka tidak hanya di podium turnamen debat, tetapi juga terpilih sebagai duta muda daerah dan pemimpin organisasi siswa.`,
    stories: [
      {
        slug: 'latihan-debat-di-rumah',
        title: 'Tiga Latihan Debat yang Bisa Dikerjakan di Rumah',
        excerpt: 'Latihan-latihan pendek untuk membiasakan anak menyusun alasan dan berbicara runtut tanpa cemas.',
        publishedAt: at(-45),
        readingMin: 4,
        coverUrl: '/images/students/Bulan.jpeg',
        coverAlt: 'Bulan Putri Ayu',
      },
    ],
  },
  'karya-tulis-ilmiah': {
    body: `Riset dan penelitian bukanlah domain eksklusif kalangan akademisi perguruan tinggi. Siswa sekolah menengah memiliki perspektif segar dan kepekaan tinggi terhadap persoalan di sekitar mereka—dari limbah organik lingkungan sekolah hingga inovasi teknologi ramah lingkungan.

Program Karya Tulis Ilmiah (KTI) Metroscope hadir untuk menyalurkan kepekaan tersebut menjadi penelitian ilmiah yang terstruktur, metodologis, dan memiliki kontribusi orisinal yang diakui di ajang kompetisi nasional maupun pameran inovasi internasional.

Siswa dibimbing melalui seluruh tahapan siklus penelitian secara komprehensif:

Eksplorasi Ide & Uji Kebaruan (Novelty Check): Membantu siswa menyaring ide penelitian agar tidak terlalu luas, realistis diselesaikan dengan sarana yang tersedia, namun memiliki daya tawar orisinalitas tinggi yang memikat dewan juri.

Metodologi Saintifik & Pengambilan Data Beretika: Menuntun perancangan desain eksperimen laboratorium, survei lapangan, atau pengujian prototipe teknik dengan memegang teguh etika riset ilmiah.

Penulisan Naskah Standar Jurnal Ilmiah: Melatih siswa menyusun naskah akademik yang formal dan rapi: mulai dari perumusan latar belakang masalah, tinjauan pustaka yang relevan, metodologi terperinci, hingga visualisasi grafik data yang komunikatif.

Coaching Sidang & Presentasi Poster: Mempersiapkan siswa menghadapi sesi tanya jawab dewan juri, melatih cara menjawab kritik ilmiah dengan argumen berbasis data tanpa kehilangan ketenangan.

Setiap naskah ditelaah secara bertahap oleh mentor yang berpengalaman dalam publikasi ilmiah. Melalui pertemuan mingguan, siswa dipandu mengatasi kebuntuan olah data dan terus mempertajam kualitas analisis riset mereka.

Karya-karya penelitian yang dibina dalam program ini telah berhasil menembus berbagai ajang bergengsi seperti Science Castle Asia, International Science and Invention Fair (ISIF), dan NYOI, membuktikan bahwa riset siswa Indonesia mampu bersaing tangguh di panggung dunia.`,
    stories: [
      {
        slug: 'menulis-kti-pertama',
        title: 'Menulis Karya Tulis Ilmiah Pertama',
        excerpt: 'Kesalahan paling sering dalam karya tulis pertama adalah topik yang terlalu luas. Mempersempit sejak awal menghemat berminggu-minggu.',
        publishedAt: at(-60),
        readingMin: 7,
        coverUrl: '/images/students/Aura.jpeg',
        coverAlt: 'Aura Kirana',
      },
    ],
  },
};

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

export const MOCK_PROGRAM_DETAILS: PublicProgramDetail[] = MOCK_PROGRAMS.map((p) => {
  const custom = PROGRAM_ARTICLES_MAP[p.slug];
  return {
    ...p,
    ...PROGRAM_DETAIL_EXTRA,
    body: custom?.body ?? p.description,
    stories: custom?.stories ?? [],
  };
});

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
    title: 'Preparing for OSN from Scratch: A Logical Sequence',
    subtitle: 'Concepts first, questions later',
    excerpt:
      'Many students start from question banks and stop halfway. A more durable sequence begins with concepts.',
    category: { slug: 'persiapan-lomba', name: 'Competition Prep' },
    tags: [
      { slug: 'osn', name: 'OSN' },
      { slug: 'sains', name: 'Science' },
    ],
    readingMin: 6,
    ageDays: -12,
    featured: true,
    body: body(
      'Sample article for article page layout preview. The content has not yet been written by the Metroscope team.',
      'Start with concepts',
      'Practice questions are useful after the basic concepts are established. Students who directly do olympiad questions without a foundation usually memorize patterns, then stumble as soon as the questions are slightly twisted.',
      'Replace this text with the real article before the site is published.',
    ),
  },
  {
    slug: 'memilih-lomba-yang-tepat',
    title: 'Choosing the Right Competition for Your Child',
    subtitle: 'Not as many as possible',
    excerpt:
      'Participating in many competitions does not always increase skills. Some considerations before registering.',
    category: { slug: 'panduan-orang-tua', name: 'Parent Guide' },
    tags: [
      { slug: 'orang-tua', name: 'Parents' },
      { slug: 'strategi', name: 'Strategy' },
    ],
    readingMin: 5,
    ageDays: -26,
    featured: false,
    body: body(
      'Sample article for preview. This text only fills the page layout.',
      'Quality over quantity',
      'One well-prepared competition provides a more useful experience than five competitions participated in without preparation.',
      'Replace this text with the real article before the site is published.',
    ),
  },
  {
    slug: 'latihan-debat-di-rumah',
    title: 'Three Debate Exercises to Do at Home',
    subtitle: 'No opponents, no judges',
    excerpt: 'Short exercises to get kids used to arranging reasons and speaking coherently.',
    category: { slug: 'persiapan-lomba', name: 'Competition Prep' },
    tags: [
      { slug: 'debat', name: 'Debate' },
      { slug: 'public-speaking', name: 'Public Speaking' },
    ],
    readingMin: 4,
    ageDays: -45,
    featured: false,
    body: body(
      'Sample article for layout preview.',
      'The first exercise',
      'Ask the child to explain one opinion in two minutes, then earnestly explain the opposite opinion. The goal is to train in arranging reasons, not to win the debate.',
      'Replace this text with the real article before the site is published.',
    ),
  },
  {
    slug: 'menulis-kti-pertama',
    title: 'Writing the First Scientific Paper',
    subtitle: 'Narrowing down the topic first',
    excerpt: 'The most frequent mistake in the first paper is a topic that is too broad.',
    category: { slug: 'panduan-orang-tua', name: 'Parent Guide' },
    tags: [{ slug: 'kti', name: 'Scientific Paper' }],
    readingMin: 7,
    ageDays: -60,
    featured: false,
    body: body(
      'Sample article for article page layout preview.',
      'Narrow it down first',
      'A topic that is too broad makes the research unfinishable in the available time. Narrowing down the question at the beginning saves weeks later.',
      'Replace this text with the real article before the site is published.',
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
  authorName: 'Metroscope Team',
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
      name: 'Competition Prep',
      description: 'How to prepare before competition day.',
      articleCount: MOCK_ARTICLE_CARDS.filter((a) => a.categorySlug === 'persiapan-lomba').length,
    },
    {
      slug: 'panduan-orang-tua',
      name: 'Parent Guide',
      description: 'Things parents need to know.',
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
