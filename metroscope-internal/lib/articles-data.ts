import fs from 'node:fs';
import path from 'node:path';
import type { Article, ArticleCategory, ArticleListItem, ArticleTag, ProseNode } from './api';

export const doc = (...nodes: ProseNode[]): ProseNode => ({
  type: 'doc',
  content: nodes,
});

export const paragraph = (text: string): ProseNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

export const heading = (text: string, level = 2): ProseNode => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

export const imageNode = (src: string, alt = ''): ProseNode => ({
  type: 'image',
  attrs: { src, alt },
});

export const blockquote = (text: string): ProseNode => ({
  type: 'blockquote',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

export const bulletList = (...items: string[]): ProseNode => ({
  type: 'bulletList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
  })),
});

export const INITIAL_CATEGORIES: ArticleCategory[] = [
  {
    id: 'cat-international-competition',
    slug: 'international-competition',
    name: 'International Competition',
    description: 'Kompetisi sains dan inovasi internasional tingkat pelajar.',
    orderIndex: 1,
    articleCount: 2,
  },
  {
    id: 'cat-life-sciences',
    slug: 'life-sciences',
    name: 'Life Sciences',
    description: 'Riset biologi, pangan fungsional, dan biomedis.',
    orderIndex: 2,
    articleCount: 1,
  },
  {
    id: 'cat-applied-science',
    slug: 'applied-science',
    name: 'Applied Science',
    description: 'Aplikasi sains terapan, IoT, dan teknologi ramah lingkungan.',
    orderIndex: 3,
    articleCount: 1,
  },
  {
    id: 'cat-research-innovation',
    slug: 'research-innovation',
    name: 'Riset & Inovasi',
    description: 'Metodologi penelitian ilmiah dan inkubasi inovasi siswa.',
    orderIndex: 4,
    articleCount: 0,
  },
  {
    id: 'cat-competition-tips',
    slug: 'competition-tips',
    name: 'Tips Lomba',
    description: 'Panduan persiapan kompetisi, penulisan esai, dan presentasi juri.',
    orderIndex: 5,
    articleCount: 0,
  },
  {
    id: 'cat-parent-guides',
    slug: 'parent-guides',
    name: 'Panduan Orang Tua',
    description: 'Dukungan orang tua dalam mendampingi bakat riset dan olimpiade anak.',
    orderIndex: 6,
    articleCount: 0,
  },
];

export const INITIAL_TAGS: (ArticleTag & { articleCount: number })[] = [
  { id: 'tag-intl-comp', slug: 'international-competition', name: 'International Competition', articleCount: 2 },
  { id: 'tag-iot', slug: 'iot', name: 'IoT', articleCount: 2 },
  { id: 'tag-biomedical', slug: 'biomedical', name: 'Biomedical Science', articleCount: 1 },
  { id: 'tag-env-science', slug: 'environmental-science', name: 'Environmental Science', articleCount: 2 },
  { id: 'tag-life-sciences', slug: 'life-sciences', name: 'Life Sciences', articleCount: 1 },
  { id: 'tag-functional-food', slug: 'functional-food', name: 'Functional Food', articleCount: 1 },
  { id: 'tag-jisf', slug: 'jisf', name: 'JISF', articleCount: 1 },
  { id: 'tag-applied-science', slug: 'applied-science', name: 'Applied Science', articleCount: 1 },
  { id: 'tag-i2aspo', slug: 'i2aspo', name: 'i2ASPO', articleCount: 1 },
];

export const INITIAL_ARTICLES: Article[] = [
  {
    id: 'art-science-castle-asia-2025',
    slug: 'science-castle-asia-2025',
    title: 'Science Castle Asia 2025: Young Innovators Present Advanced IoT and Biomedical Solutions',
    subtitle:
      'Elevating Youth Research: High school delegates represent Metro on an international stage at Multimedia University Cyberjaya',
    excerpt:
      'Eleven young researchers from five schools represented Metro at Science Castle Asia 2025, presenting IoT environmental monitoring and antibacterial medical research on an international stage.',
    locale: 'en',
    status: 'PUBLISHED',
    version: 1,
    featured: true,
    pinnedRank: 1,
    readingMin: 6,
    viewCount: 1420,
    publishAt: '2025-10-21T00:00:00.000Z',
    publishedAt: '2025-10-21T00:00:00.000Z',
    updatedAt: '2025-10-21T00:00:00.000Z',
    categoryId: 'cat-international-competition',
    categoryName: 'International Competition',
    categorySlug: 'international-competition',
    authorId: 'author-metroscope',
    authorName: 'Metroscope Academic Board',
    coverId: 'cov-sca-2025',
    coverKey: 'sca-2025-award.jpg',
    coverUrl: '/images/events/sca-2025-award.jpg',
    coverAlt: 'Metroscope delegation receiving awards at Science Castle Asia 2025, MMU Cyberjaya',
    competitionTargetId: null,
    studentId: null,
    studentName: null,
    competitionName: null,
    consentSource: 'METROSCOPE_CONSENT_REGISTRY',
    consentAt: '2025-10-15T00:00:00.000Z',
    programId: 'event-science-castle-asia-2025',
    competitionId: null,
    reviewNote: 'Approved for global publication',
    tags: [
      { id: 'tag-intl-comp', slug: 'international-competition', name: 'International Competition' },
      { id: 'tag-iot', slug: 'iot', name: 'IoT' },
      { id: 'tag-biomedical', slug: 'biomedical', name: 'Biomedical Science' },
      { id: 'tag-env-science', slug: 'environmental-science', name: 'Environmental Science' },
    ],
    body: doc(
      paragraph(
        'Cyberjaya, Malaysia — The advancement of modern science and technology relies heavily on empowering young minds to transform critical thinking into tangible solutions. To cultivate this vision, Science Castle Asia 2025 served as an international platform for high school students to showcase competitive research and scientific breakthroughs. Hosted at Multimedia University (MMU) Cyberjaya, the conference brought together student researchers, educators, and industry experts from across the region to foster scientific literacy, academic rigor, and global competitiveness.',
      ),
      heading('Fostering a Culture of Scientific Inquiry'),
      paragraph(
        'Science Castle Asia 2025 was organized to nurture early-stage research capabilities, encouraging students to engage directly with complex global challenges in environmental science and healthcare. Beyond standard classroom learning, the initiative challenged participants to execute rigorous scientific methodologies, from formulation and laboratory experimentation to data analysis and peer defense.',
      ),
      imageNode(
        '/images/events/sca-2025-judging.jpg',
        'Metroscope delegates defending their research during oral judging at Science Castle Asia 2025',
      ),
      paragraph(
        'By stepping onto an international stage, participants gained invaluable exposure to competitive research environments. The program aims to build student confidence, enhance cross-cultural collaboration, and demonstrate that secondary school students can produce meaningful research with real-world applications.',
      ),
      heading('From National Selection to the International Stage'),
      paragraph(
        'The journey began with an open call for research submissions, where teams submitted comprehensive research essays adhering to strict academic guidelines. Following a thorough review process by the scientific committee, the shortlisted finalists were officially announced on July 18, 2025.',
      ),
      paragraph(
        'The main conference took place on October 18–19, 2025, at MMU Cyberjaya, where finalists presented their findings through oral defenses and interactive poster sessions. To conclude the program, participants joined an educational field trip on October 20, 2025, offering hands-on learning experiences outside the competitive setting and expanding their professional networks.',
      ),
      heading('Key Contributions and Research Highlights'),
      paragraph(
        'The delegation featured 11 student researchers organized into 2 dedicated teams representing 5 secondary schools from Metro and its surrounding regions. Each team addressed critical challenges in environmental monitoring and medical science:',
      ),
      bulletList(
        'IoT-Based Environmental Monitoring: The first research team engineered an Internet of Things (IoT) monitoring system designed to measure and analyze tropospheric ozone pollutants.',
        'Biomedical Research on Natural Antibacterial Agents: The second research team conducted a phytochemical profiling study on Sungkai leaf (Peronema canescens) extracts to evaluate antibacterial efficacy against MRSA.',
      ),
      paragraph(
        'Through these contributions, the participants demonstrated the impactful role of youth-led research in addressing pressing environmental and health issues on a global scale.',
      ),
    ),
  },
  {
    id: 'art-jisf-2026',
    slug: 'jakarta-international-science-fair-2026',
    title: 'Jakarta International Science Fair (JISF) 2026: Papuan Red Fruit Innovation & Cultural Delegation',
    subtitle:
      'Advancing Global Science: Metroscope researchers present functional food breakthroughs and cultural heritage at i3L University',
    excerpt:
      'Metroscope delegates presented pioneering functional food research on Papuan red fruit at JISF 2026, successfully navigating rigorous hybrid evaluation stages within a premier international academic forum.',
    locale: 'en',
    status: 'PUBLISHED',
    version: 1,
    featured: false,
    pinnedRank: 2,
    readingMin: 6,
    viewCount: 980,
    publishAt: '2026-04-28T00:00:00.000Z',
    publishedAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    categoryId: 'cat-life-sciences',
    categoryName: 'Life Sciences',
    categorySlug: 'life-sciences',
    authorId: 'author-metroscope',
    authorName: 'Metroscope Academic Board',
    coverId: 'cov-jisf-2026',
    coverKey: 'jisf-2026-smp-5.jpg',
    coverUrl: '/images/events/jisf-2026-smp-5.jpg',
    coverAlt: 'Metroscope delegates presenting their Papuan red fruit research poster at JISF 2026, i3L University',
    competitionTargetId: null,
    studentId: null,
    studentName: null,
    competitionName: null,
    consentSource: 'METROSCOPE_CONSENT_REGISTRY',
    consentAt: '2026-04-20T00:00:00.000Z',
    programId: 'event-jisf-2026',
    competitionId: null,
    reviewNote: 'Approved for global publication',
    tags: [
      { id: 'tag-life-sciences', slug: 'life-sciences', name: 'Life Sciences' },
      { id: 'tag-functional-food', slug: 'functional-food', name: 'Functional Food' },
      { id: 'tag-intl-comp', slug: 'international-competition', name: 'International Competition' },
      { id: 'tag-jisf', slug: 'jisf', name: 'JISF' },
    ],
    body: doc(
      paragraph(
        'Jakarta, Indonesia — Fostering global scientific literacy and cultivating empirical inquiry necessitate robust academic platforms that connect emerging student researchers with international evaluation benchmarks. The Jakarta International Science Fair (JISF) 2026 provided a distinguished forum for secondary and tertiary students to present original empirical investigations, defend methodological frameworks, and engage in cross-disciplinary scholarly discourse. Configured as a hybrid symposium, the conference facilitated remote scholarly defense via Zoom alongside physical presentations hosted at i3L University in Jakarta.',
      ),
      heading('Empowering Young Scholars Through Global Academic Engagement'),
      paragraph(
        'Metroscope’s active delegation at JISF 2026 underscores an enduring institutional commitment to transcending conventional pedagogical boundaries. By participating in a competitive international arena, students refine vital research competencies, ranging from systematic hypothesis formulation and laboratory-based analytical testing to persuasive academic discourse.',
      ),
      imageNode(
        '/images/events/jisf-2026-smp-1.jpg',
        'Metroscope junior high delegates during exhibition presentation at JISF 2026',
      ),
      heading('Research Contributions and Scientific Focus'),
      paragraph(
        'The Metroscope delegation comprised six student researchers representing three collaborating institutions, SMP Negeri 1 Metro, Cahaya Bangsa School, and SMP Muhammadiyah Ahmad Dahlan Metro—unified under a single collaborative research team. Competing within the Life Sciences domain, the investigators addressed a prominent public health challenge through the utilization of indigenous bio-resources in their study entitled "Papuan Red Fruit (Pandanus conoideus) Based Functional Mayonnaise for the Dietary Management of Hypercholesterolaemia and Dyslipidaemia."',
      ),
      heading('Event Documentation & Cultural Delegation'),
      paragraph(
        'Over four days (from 24–27 April 2026), participants engaged in scientific competitions, educational visits, cultural exploration, and international networking opportunities across Jakarta. Metroscope students also had the honour of representing Indonesia\'s cultural heritage through a performance of Yamko Rambe Yamko on the international stage at i3L University.',
      ),
    ),
  },
  {
    id: 'art-i2aspo-2025',
    slug: 'i2aspo-2025',
    title: 'i2ASPO 2025: Metroscope Researchers Present IoT-Integrated Environmental Solutions',
    subtitle:
      'Fostering Applied Innovation: Student innovators showcase tropospheric ozone absorption technology at Universitas Gadjah Mada',
    excerpt:
      'Metroscope delegates demonstrated applied environmental innovation at i2ASPO 2025, presenting an IoT-integrated tropospheric ozone absorption system within an international applied science forum.',
    locale: 'en',
    status: 'PUBLISHED',
    version: 1,
    featured: false,
    pinnedRank: 3,
    readingMin: 6,
    viewCount: 750,
    publishAt: '2025-12-22T00:00:00.000Z',
    publishedAt: '2025-12-22T00:00:00.000Z',
    updatedAt: '2025-12-22T00:00:00.000Z',
    categoryId: 'cat-applied-science',
    categoryName: 'Applied Science',
    categorySlug: 'applied-science',
    authorId: 'author-metroscope',
    authorName: 'Metroscope Academic Board',
    coverId: 'cov-i2aspo-2025',
    coverKey: 'i2aspo-2025.jpg',
    coverUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80',
    coverAlt: 'Metroscope Researchers at i2ASPO 2025, Universitas Gadjah Mada',
    competitionTargetId: null,
    studentId: null,
    studentName: null,
    competitionName: null,
    consentSource: 'METROSCOPE_CONSENT_REGISTRY',
    consentAt: '2025-12-05T00:00:00.000Z',
    programId: 'event-i2aspo-2025',
    competitionId: null,
    reviewNote: 'Approved for global publication',
    tags: [
      { id: 'tag-applied-science', slug: 'applied-science', name: 'Applied Science' },
      { id: 'tag-env-science', slug: 'environmental-science', name: 'Environmental Science' },
      { id: 'tag-iot', slug: 'iot', name: 'IoT' },
      { id: 'tag-i2aspo', slug: 'i2aspo', name: 'i2ASPO' },
    ],
    body: doc(
      paragraph(
        'Yogyakarta, Indonesia — Addressing contemporary ecological challenges requires robust applied research platforms capable of translating theoretical scientific inquiry into tangible technological solutions. The Indonesia International Applied Science Project Olympiad (i2ASPO) 2025 offered a prominent international stage for young researchers to showcase applied science innovations, defend practical product designs, and engage with global scientific evaluators.',
      ),
      heading('Empowering Young Innovators Through Applied Science'),
      paragraph(
        'Metroscope’s delegation at i2ASPO 2025 reflects an ongoing institutional dedication to fostering hands-on research competencies and technological innovation among secondary school students. Participation in an applied scientific olympiad challenges emerging scholars to move beyond conventional empirical testing into prototype engineering, functional optimization, and product defense.',
      ),
      heading('Research Contributions and Scientific Focus'),
      paragraph(
        'The Metroscope delegation comprised six student researchers representing three collaborating institutions, SMP Negeri 1 Metro, SMP Cahaya Bangsa, and SMP Muhammadiyah Ahmad Dahlan Metro—unified under a single collaborative research team. Competing within the Applied Environmental Science division, the investigators addressed atmospheric pollution monitoring in their study entitled "Neutral Buffered Potassium Iodide and Na₂S₂O₃ as Absorbers of Harmful Tropospheric Ozone Using Ozonometric, an IoT-Based Integrated Spectrophotometric Impinger."',
      ),
    ),
  },
];

function loadStoredCustomArticles(): Article[] {
  try {
    const filePath = path.join(process.cwd(), 'lib', 'custom-articles.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed as Article[];
    }
  } catch {}
  return [];
}

function persistCustomArticles(articles: Article[]) {
  try {
    const custom = articles.filter(
      (a) => !INITIAL_ARTICLES.some((init) => init.id === a.id),
    );
    const internalPath = path.join(process.cwd(), 'lib', 'custom-articles.json');
    fs.writeFileSync(internalPath, JSON.stringify(custom, null, 2), 'utf-8');

    const landingPath = path.join(process.cwd(), '..', 'metroscope-landing', 'lib', 'mock', 'custom-articles.json');
    if (fs.existsSync(path.dirname(landingPath))) {
      fs.writeFileSync(landingPath, JSON.stringify(custom, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('Failed to persist custom articles to disk:', err);
  }
}

const storedCustom = loadStoredCustomArticles();

/** In-memory article store (persists for the server process lifespan) */
let runtimeArticles: Article[] = [...storedCustom, ...INITIAL_ARTICLES];
const runtimeCategories: ArticleCategory[] = [...INITIAL_CATEGORIES];
const runtimeTags: (ArticleTag & { articleCount: number })[] = [...INITIAL_TAGS];

export function getRuntimeArticles(): Article[] {
  return runtimeArticles;
}

export function getRuntimeArticle(idOrSlug: string): Article | null {
  return (
    runtimeArticles.find((a) => a.id === idOrSlug || a.slug === idOrSlug) ?? null
  );
}

export function getRuntimeCategories(): ArticleCategory[] {
  return runtimeCategories;
}

export function getRuntimeTags(): (ArticleTag & { articleCount: number })[] {
  return runtimeTags;
}

export function saveRuntimeArticle(
  patch: Partial<Article> & { title: string; id?: string },
): Article {
  const existingIndex = patch.id
    ? runtimeArticles.findIndex((a) => a.id === patch.id)
    : -1;

  if (existingIndex >= 0) {
    const existing = runtimeArticles[existingIndex]!;
    const updated: Article = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };
    runtimeArticles[existingIndex] = updated;
    persistCustomArticles(runtimeArticles);
    return updated;
  }

  const slug =
    patch.slug ||
    patch.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) ||
    `artikel-${Date.now()}`;

  const category = runtimeCategories.find((c) => c.id === patch.categoryId);

  const newArticle: Article = {
    id: patch.id || `art-${Date.now()}`,
    slug,
    title: patch.title,
    subtitle: patch.subtitle ?? null,
    excerpt: patch.excerpt ?? null,
    locale: patch.locale ?? 'id',
    status: patch.status ?? 'PUBLISHED',
    version: 1,
    featured: Boolean(patch.featured),
    pinnedRank: patch.featured ? 1 : null,
    readingMin: patch.readingMin ?? 5,
    viewCount: 0,
    publishAt: new Date().toISOString(),
    publishedAt: patch.status === 'PUBLISHED' ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
    categoryId: patch.categoryId ?? null,
    categoryName: category?.name ?? patch.categoryName ?? null,
    categorySlug: category?.slug ?? patch.categorySlug ?? null,
    authorId: patch.authorId ?? 'author-metroscope',
    authorName: patch.authorName ?? 'Metroscope Academic Board',
    coverId: patch.coverId ?? null,
    coverKey: null,
    coverUrl: patch.coverUrl ?? null,
    coverAlt: patch.coverAlt ?? patch.title,
    competitionTargetId: null,
    studentId: null,
    studentName: null,
    competitionName: null,
    consentSource: 'METROSCOPE_CONSENT_REGISTRY',
    consentAt: new Date().toISOString(),
    programId: null,
    competitionId: null,
    reviewNote: null,
    tags: patch.tags ?? [],
    body: patch.body ?? doc(paragraph(patch.excerpt || patch.title)),
  };

  runtimeArticles = [newArticle, ...runtimeArticles];
  persistCustomArticles(runtimeArticles);
  return newArticle;
}

export function deleteRuntimeArticle(id: string): boolean {
  const prevCount = runtimeArticles.length;
  runtimeArticles = runtimeArticles.filter((a) => a.id !== id && a.slug !== id);
  if (runtimeArticles.length < prevCount) {
    persistCustomArticles(runtimeArticles);
    return true;
  }
  return false;
}

export function toListItem(a: Article): ArticleListItem {
  return {
    id: a.id,
    title: a.title,
    subtitle: a.subtitle,
    slug: a.slug,
    locale: a.locale,
    status: a.status,
    version: a.version,
    excerpt: a.excerpt,
    body: a.body,
    featured: a.featured,
    pinnedRank: a.pinnedRank,
    readingMin: a.readingMin,
    viewCount: a.viewCount,
    publishAt: a.publishAt,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
    categoryId: a.categoryId,
    categoryName: a.categoryName,
    authorId: a.authorId,
    authorName: a.authorName,
    coverId: a.coverId,
    coverKey: a.coverKey,
    coverUrl: a.coverUrl,
    coverAlt: a.coverAlt,
    competitionTargetId: a.competitionTargetId,
    studentId: a.studentId,
    consentSource: a.consentSource,
    tags: a.tags,
  };
}
