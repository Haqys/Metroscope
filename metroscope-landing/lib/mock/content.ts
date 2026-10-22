import type {
  ArticleCard,
  ArticleListPage,
  ProseNode,
  PublicArticle,
  Taxonomy,
} from '@/lib/articles-api';
import type { ImpactsData } from '@/lib/impacts-api';
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
    id: 'event-science-castle-asia-2025',
    slug: 'science-castle-asia-2025',
    name: 'Science Castle Asia 2025',
    category: 'Research & Innovation · International Competition',
    dateVenue: 'October 18–20, 2025 | Multimedia University (MMU) Cyberjaya, Malaysia',
    summary:
      'Eleven young researchers from five schools represented Metro at Science Castle Asia 2025, presenting IoT environmental monitoring and antibacterial medical research on an international stage.',
    description:
      'Eleven young researchers from five schools represented Metro at Science Castle Asia 2025, presenting IoT environmental monitoring and antibacterial medical research on an international stage.',
    ctaText: 'Read Article →',
    coverUrl: '/images/events/sca-2025-award.jpg',
    coverAlt: 'Metroscope delegation receiving awards at Science Castle Asia 2025, MMU Cyberjaya',
  },
  {
    ...PROGRAM_BASE,
    id: 'event-jisf-2026',
    slug: 'jakarta-international-science-fair-2026',
    name: 'Jakarta International Science Fair (JISF) 2026',
    category: 'Research & Innovation · International Competition',
    dateVenue: 'April 14–27, 2026 |  i3L University, Jakarta',
    summary:
      'Metroscope delegates presented pioneering functional food research on Papuan red fruit at JISF 2026, successfully navigating rigorous hybrid evaluation stages within a premier international academic forum.',
    description:
      'Metroscope delegates presented pioneering functional food research on Papuan red fruit at JISF 2026, successfully navigating rigorous hybrid evaluation stages within a premier international academic forum.',
    ctaText: 'Read Article →',
    coverUrl: '/images/events/jisf-2026-smp-5.jpg',
    coverAlt: 'Metroscope delegates presenting their Papuan red fruit research poster at JISF 2026, i3L University',
  },
  {
    ...PROGRAM_BASE,
    id: 'event-i2aspo-2025',
    slug: 'i2aspo-2025',
    name: 'Indonesia International Applied Science Project Olympiad (i2ASPO) 2025',
    category: 'Research & Innovation · International Competition',
    dateVenue: 'December 9–21, 2025 | Universitas Gadjah Mada (UGM)',
    summary:
      'Metroscope delegates demonstrated applied environmental innovation at i2ASPO 2025, presenting an IoT-integrated tropospheric ozone absorption system within an international applied science forum.',
    description:
      'Metroscope delegates demonstrated applied environmental innovation at i2ASPO 2025, presenting an IoT-integrated tropospheric ozone absorption system within an international applied science forum.',
    ctaText: 'Read Article →',
    coverUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80',
    coverAlt: 'Metroscope Researchers at i2ASPO 2025, Universitas Gadjah Mada',
  },
];

interface ProgramArticleData {
  headline: string;
  articleType: string;
  venue: string;
  date: string;
  delegationStats: { label: string; value: string }[];
  researchHighlights: { title: string; subtitle?: string; desc: string; tag?: string }[];
  itineraryPhases?: { phase: string; period: string; title: string; desc: string }[];
  gallery?: { url: string; alt: string; caption: string }[];
  body: string;
  stories: ProgramStory[];
}

const PROGRAM_ARTICLES_MAP: Record<string, ProgramArticleData> = {
  'science-castle-asia-2025': {
    headline:
      'Elevating Youth Research: Young Innovators Present Advanced IoT and Biomedical Solutions at Science Castle Asia 2025',
    articleType: 'News & Research Feature Article',
    venue: 'Multimedia University (MMU) Cyberjaya, Malaysia',
    date: 'October 18–20, 2025',
    delegationStats: [
      { label: 'Student Delegation', value: '11 Young Researchers' },
      { label: 'Team Formation', value: '2 Selected Research Teams' },
      { label: 'School Origins', value: '5 Metro Secondary Schools' },
      { label: 'Research Domain', value: 'Pollution IoT & MRSA Biomedicine' },
    ],
    researchHighlights: [
      {
        title: 'IoT-Based Environmental Monitoring',
        subtitle: 'Real-Time Tropospheric Ozone Pollutant Monitoring',
        desc: 'The first research team engineered an Internet of Things (IoT) monitoring system designed to measure and analyze tropospheric ozone pollutants. This system provides real-time data tracking to assist in local air quality assessment and environmental hazard mitigation.',
        tag: 'Environmental Science & IoT',
      },
      {
        title: 'Biomedical Research on Natural Antibacterial Agents',
        subtitle: 'Efficacy Testing of Sungkai Leaf Extract Against MRSA Bacteria',
        desc: 'The second research team conducted a phytochemical profiling study on Sungkai leaf (Peronema canescens) extracts to evaluate their antibacterial efficacy against Methicillin-Resistant Staphylococcus aureus (MRSA), highlighting the potential of indigenous flora in addressing antibiotic resistance.',
        tag: 'Biomedical Science',
      },
    ],
    itineraryPhases: [
      {
        phase: 'National Selection Phase',
        period: 'May – July 2025',
        title: 'Scientific Essay Submission & Committee Review',
        desc: 'Submission of comprehensive research essays adhering to rigorous academic standards, followed by an intensive review process leading to finalist announcements on July 18, 2025.',
      },
      {
        phase: 'Main Conference',
        period: 'October 18–19, 2025',
        title: 'Oral Defense & Interactive Poster Session at MMU Cyberjaya',
        desc: 'Presentation of research findings through oral defense sessions and interactive posters before a panel of international scientists and adjudicators.',
      },
      {
        phase: 'Educational Exploration',
        period: 'October 20, 2025',
        title: 'Educational Field Trip & Professional Networking',
        desc: 'Hands-on scientific excursion outside the competition arena to enrich practical research insights and expand students’ global professional network.',
      },
    ],
    gallery: [
      {
        url: '/images/events/sca-2025-award.jpg',
        alt: 'Certificate Presentation & SCA 2025 Awards',
        caption:
          'Metroscope delegation presenting their award certificates and research posters at Science Castle Asia 2025, MMU Cyberjaya.',
      },
      {
        url: '/images/events/sca-2025-judging.jpg',
        alt: 'Oral Defense & Jury Q&A Session',
        caption:
          'Student delegates during an intensive Q&A and methodology defense before the international jury panel.',
      },
      {
        url: '/images/events/sca-2025-delegation.jpg',
        alt: 'Metroscope Research Delegation Contingent',
        caption:
          'Student delegation contingent representing 5 secondary schools from Metro throughout the conference series in Cyberjaya, Malaysia.',
      },
    ],
    body: `Cyberjaya, Malaysia — The advancement of modern science and technology relies heavily on empowering young minds to transform critical thinking into tangible solutions. To cultivate this vision, Science Castle Asia 2025 served as an international platform for high school students to showcase competitive research and scientific breakthroughs. Hosted at Multimedia University (MMU) Cyberjaya, the conference brought together student researchers, educators, and industry experts from across the region to foster scientific literacy, academic rigor, and global competitiveness.

Fostering a Culture of Scientific Inquiry

Science Castle Asia 2025 was organized to nurture early-stage research capabilities, encouraging students to engage directly with complex global challenges in environmental science and healthcare. Beyond standard classroom learning, the initiative challenged participants to execute rigorous scientific methodologies, from formulation and laboratory experimentation to data analysis and peer defense.

By stepping onto an international stage, participants gained invaluable exposure to competitive research environments. The program aims to build student confidence, enhance cross-cultural collaboration, and demonstrate that secondary school students can produce meaningful research with real-world applications.

From National Selection to the International Stage

The journey began with an open call for research submissions, where teams submitted comprehensive research essays adhering to strict academic guidelines. Following a thorough review process by the scientific committee, the shortlisted finalists were officially announced on July 18, 2025.

The main conference took place on October 18–19, 2025, at MMU Cyberjaya, where finalists presented their findings through oral defenses and interactive poster sessions. To conclude the program, participants joined an educational field trip on October 20, 2025, offering hands-on learning experiences outside the competitive setting and expanding their professional networks.

Key Contributions and Research Highlights

The delegation featured 11 student researchers organized into 2 dedicated teams representing 5 secondary schools from Metro and its surrounding regions. Each team addressed critical challenges in environmental monitoring and medical science:

IoT-Based Environmental Monitoring: The first research team engineered an Internet of Things (IoT) monitoring system designed to measure and analyze tropospheric ozone pollutants. This system provides real-time data tracking to assist in local air quality assessment and environmental hazard mitigation.

Biomedical Research on Natural Antibacterial Agents: The second research team conducted a phytochemical profiling study on Sungkai leaf (Peronema canescens) extracts to evaluate their antibacterial efficacy against Methicillin-Resistant Staphylococcus aureus (MRSA), highlighting the potential of indigenous flora in addressing antibiotic resistance.

Through these contributions, the participants demonstrated the impactful role of youth-led research in addressing pressing environmental and health issues on a global scale.`,
    stories: [
      {
        slug: 'oktavianus-alexa-pratama',
        title: "Alexa's Story: Bringing Metro's Ozone Research to MMU Cyberjaya",
        excerpt:
          'Leading the environmental monitoring prototype engineering through to presenting before international scientists at Science Castle Asia.',
        publishedAt: at(-12),
        readingMin: 5,
        coverUrl: '/images/students/Alex.jpeg',
        coverAlt: 'Oktavianus Alexa Pratama',
      },
      {
        slug: 'aura-kirana',
        title: 'Aura Kirana: From Laboratory Research to the International Podium',
        excerpt:
          'Navigating Sungkai leaf phytochemical research and leading cross-school research collaboration to address antibiotic resistance challenges.',
        publishedAt: at(-20),
        readingMin: 6,
        coverUrl: '/images/students/Aura.jpeg',
        coverAlt: 'Aura Kirana',
      },
    ],
  },
  'jakarta-international-science-fair-2026': {
    headline:
      'Advancing Global Science: Metroscope Researchers Showcase Papuan Red Fruit Innovation at JISF 2026',
    articleType: 'Academic Educational Article',
    venue: 'i3L University, Jakarta',
    date: 'April 14–27, 2026',
    delegationStats: [
      { label: 'Research Delegation', value: '6 Student Researchers' },
      { label: 'Institutional Collaboration', value: '3 Schools in Metro' },
      { label: 'Competition Division', value: 'Life Sciences' },
      { label: 'Symposium Modality', value: 'Hybrid (Online & On-Site)' },
    ],
    researchHighlights: [
      {
        title: 'Papuan Red Fruit Functional Mayonnaise',
        subtitle:
          'Papuan Red Fruit (Pandanus conoideus) Based Functional Mayonnaise for the Dietary Management of Hypercholesterolaemia and Dyslipidaemia',
        desc: 'The research evaluated the formulation of a functional food matrix enriched with bioactive compounds derived from Papuan red fruit, offering a supplementary dietary intervention designed to assist in managing hypercholesterolemia and lipid metabolic disorders.',
        tag: 'Life Sciences & Functional Food',
      },
    ],
    itineraryPhases: [
      {
        phase: 'Virtual Phase',
        period: 'April 14–17, 2026',
        title: 'Inaugural Online & Virtual Zoom Judging',
        desc: 'Beginning with an online opening ceremony and live remote evaluation sessions via Zoom, concluding with a virtual award ceremony on April 17, 2026.',
      },
      {
        phase: 'On-Site Phase',
        period: 'April 24–27, 2026',
        title: 'Symposium & Oral Defense at i3L University Campus Jakarta',
        desc: 'Physical opening ceremony at i3L (April 24), in-person oral defense sessions (April 25), interactive academic workshop (April 26), and closing grand award ceremony (April 27, 2026).',
      },
    ],
    gallery: [
      {
        url: '/images/events/jisf-2026-smp-5.jpg',
        alt: 'Papuan Red Fruit Research Booth',
        caption: 'Junior high delegates beside their Papuan red fruit functional food research poster and product display.',
      },
      {
        url: '/images/events/jisf-2026-sd-1.jpg',
        alt: 'Elementary Delegates at the JISF Exhibition Hall',
        caption: 'Elementary school delegates in costume among the project booths at the JISF 2026 exhibition.',
      },
      {
        url: '/images/events/jisf-2026-sd-2.jpg',
        alt: 'Seismic-Vibration IoT Project Display',
        caption: 'Presenting a distributed seismic-vibration system powered by IoT for the early identification of illegal logging in protected forests.',
      },
      {
        url: '/images/events/jisf-2026-sd-3.jpg',
        alt: 'Research Poster & Forest Diorama',
        caption: 'The project poster and forest diorama prepared for the oral defense and judging sessions.',
      },
      {
        url: '/images/events/jisf-2026-sd-4.jpg',
        alt: 'Yamko Rambe Yamko Performance',
        caption: 'Students in traditional costume for the Yamko Rambe Yamko cultural performance at i3L University.',
      },
      {
        url: '/images/events/jisf-2026-smp-1.jpg',
        alt: 'Cultural Performers Backstage',
        caption: 'Metroscope students representing Indonesia\'s cultural heritage on the international stage.',
      },
      {
        url: '/images/events/jisf-2026-smp-2.jpg',
        alt: 'Delegation Between Sessions',
        caption: 'Delegates gathering between sessions during the four-day programme in Jakarta.',
      },
      {
        url: '/images/events/jisf-2026-smp-3.jpg',
        alt: 'Delegation Group Photo',
        caption: 'The Metroscope delegation in cultural attire ahead of the performance.',
      },
      {
        url: '/images/events/jisf-2026-smp-4.jpg',
        alt: 'Delegation on the Move in Jakarta',
        caption: 'Students and mentors heading to venues during the educational and cultural visits across Jakarta.',
      },
    ],
    body: `Jakarta, Indonesia — Fostering global scientific literacy and cultivating empirical inquiry necessitate robust academic platforms that connect emerging student researchers with international evaluation benchmarks. The Jakarta International Science Fair (JISF) 2026 provided a distinguished forum for secondary and tertiary students to present original empirical investigations, defend methodological frameworks, and engage in cross-disciplinary scholarly discourse. Configured as a hybrid symposium, the conference facilitated remote scholarly defense via Zoom alongside physical presentations hosted at i3L University in Jakarta. This dual modality exposed participants to rigorous multi-tiered evaluation protocols, requiring delegates to articulate complex scientific findings before an international panel of academic reviewers.

Empowering Young Scholars Through Global Academic Engagement

Metroscope’s active delegation at JISF 2026 underscores an enduring institutional commitment to transcending conventional pedagogical boundaries. By participating in a competitive international arena, students refine vital research competencies, ranging from systematic hypothesis formulation and laboratory-based analytical testing to persuasive academic discourse. Beyond traditional competition metrics, the initiative prioritizes critical thinking and translational problem-solving. Defending empirical research before an international jury instills scholarly rigor, cultivates academic self-efficacy, and demonstrates the practical viability of student-led scientific investigations addressing contemporary challenges.

An Integrated Hybrid Academic Itinerary

The delegation navigated two distinct operational phases throughout the JISF 2026 proceedings. The virtual phase commenced on April 14, 2026, with the inaugural online ceremony and live remote evaluation sessions, culminating in the virtual award ceremony on April 17, 2026. Transitioning to the physical venue at i3L University, participants engaged in the on-site opening ceremony on April 24, 2026, followed by face-to-face oral defenses on April 25, an interactive academic workshop on April 26, and the formal concluding award ceremony on April 27, 2026. This multi-modal structure afforded delegates comprehensive exposure to both digital academic presentation standards and physical scholarly networking.

Research Contributions and Scientific Focus

The Metroscope delegation comprised six student researchers representing three collaborating institutions, SMP Negeri 1 Metro, Cahaya Bangsa School, and SMP Muhammadiyah Ahmad Dahlan Metro—unified under a single collaborative research team. Competing within the Life Sciences domain, the investigators addressed a prominent public health challenge through the utilization of indigenous bio-resources in their study entitled "Papuan Red Fruit (Pandanus conoideus) Based Functional Mayonnaise for the Dietary Management of Hypercholesterolaemia and Dyslipidaemia." The research evaluated the formulation of a functional food matrix enriched with bioactive compounds derived from Papuan red fruit, offering a supplementary dietary intervention designed to assist in managing hypercholesterolemia and lipid metabolic disorders.

Event Documentation

An interactive documentary gallery captures the key milestones of the Metroscope delegation throughout JISF 2026, highlighting virtual defense sessions, live oral presentations before the academic panel at i3L University, specialized research workshops, and the final conferral proceedings.

Over four days (April 24–27, 2026), delegates took part in project exhibitions, judging sessions, the Opening Ceremony, Farewell Gathering and Awarding Ceremony. The programme also included educational and cultural visits to the National Museum, the Ministry of Women's Empowerment and Child Protection of the Republic of Indonesia, KidZania Jakarta, the Istiqlal Mosque and several iconic Jakarta landmarks. Metroscope students also had the honour of representing Indonesia's cultural heritage through a performance of Yamko Rambe Yamko on the international stage at i3L University.`,
    stories: [
      {
        slug: 'aura-kirana',
        title: 'Functional Food Formulation: From Ideation to Laboratory Validation',
        excerpt:
          'How a collaboration among three schools in Metro produced Papuan red fruit research that succeeded in JISF 2026 hybrid judging.',
        publishedAt: at(-30),
        readingMin: 5,
        coverUrl: '/images/students/Aura.jpeg',
        coverAlt: 'Aura Kirana',
      },
    ],
  },
  'i2aspo-2025': {
    headline:
      'Fostering Applied Innovation: Metroscope Researchers Present IoT-Integrated Environmental Solutions at i2ASPO 2025',
    articleType: 'Academic Educational Article',
    venue: 'Universitas Gadjah Mada (UGM)',
    date: 'December 9–21, 2025',
    delegationStats: [
      { label: 'Innovator Delegation', value: '6 Student Researchers' },
      { label: 'Collaborative Institutions', value: '3 Schools in Metro' },
      { label: 'Competition Division', value: 'Applied Environmental Science' },
      { label: 'Judging Format', value: '7-Min Presentation + 8-Min Jury Examination' },
    ],
    researchHighlights: [
      {
        title: 'IoT-Based Integrated Spectrophotometric Impinger (Ozonometric)',
        subtitle:
          'Neutral Buffered Potassium Iodide and Na₂S₂O₃ as Absorbers of Harmful Tropospheric Ozone Using Ozonometric',
        desc: 'The team engineered an innovative environmental monitoring system combining chemical absorption methodology with Internet of Things (IoT) hardware to capture, measure, and analyze hazardous tropospheric ozone levels in real time.',
        tag: 'Applied Environmental Science & IoT',
      },
    ],
    itineraryPhases: [
      {
        phase: 'Virtual Phase',
        period: 'December 9–12, 2025',
        title: 'Inaugural Online & Remote Judging',
        desc: 'Online opening ceremony, preliminary remote evaluations via Zoom, intensive assessment sessions on December 10, and virtual award ceremony on December 12, 2025.',
      },
      {
        phase: 'On-Site Phase',
        period: 'December 17–21, 2025',
        title: 'Prototype Exhibition & Oral Defense at UGM Yogyakarta',
        desc: 'Arrival in Yogyakarta (Dec 17), physical opening (Dec 18), live prototype exhibition & jury examination (Dec 19), academic activities (Dec 20), and grand award ceremony (Dec 21, 2025).',
      },
    ],
    gallery: [
      {
        url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',
        alt: 'Ozonometric Impinger Prototype',
        caption: 'IoT-integrated spectrophotometric impinger prototype for tropospheric ozone absorption.',
      },
      {
        url: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&auto=format&fit=crop&q=80',
        alt: 'Science Exhibition at Universitas Gadjah Mada',
        caption: 'Prototype exhibition and jury examination sessions at Grha Sabha Pramana UGM.',
      },
    ],
    body: `Yogyakarta, Indonesia — Addressing contemporary ecological challenges requires robust applied research platforms capable of translating theoretical scientific inquiry into tangible technological solutions. The Indonesia International Applied Science Project Olympiad (i2ASPO) 2025 offered a prominent international stage for young researchers to showcase applied science innovations, defend practical product designs, and engage with global scientific evaluators. Conducted as a hybrid symposium, the Olympiad facilitated remote project defenses via Zoom alongside physical exhibition sessions hosted at Universitas Gadjah Mada (UGM) in Yogyakarta. This dual-modal framework evaluated participants on both their theoretical foundation and the functional efficacy of their physical research prototypes.

Empowering Young Innovators Through Applied Science

Metroscope’s delegation at i2ASPO 2025 reflects an ongoing institutional dedication to fostering hands-on research competencies and technological innovation among secondary school students. Participation in an applied scientific olympiad challenges emerging scholars to move beyond conventional empirical testing into prototype engineering, functional optimization, and product defense. Navigating strict defense protocols, comprising a concentrated seven-minute oral presentation followed by an eight-minute intensive examination by an international jury panel, instills essential skills in concise scientific communication, analytical defense, and technological translation.

An Integrated Hybrid Competition Framework

The delegation navigated two comprehensive phases during the i2ASPO 2025 itinerary. The virtual competition phase commenced on December 9, 2025, with the inaugural online ceremony and preliminary remote judging, continuing through dedicated evaluation sessions on December 10, and concluding with the virtual award ceremony on December 12, 2025. Transitioning to the physical venue at Universitas Gadjah Mada, on-site participants arrived on December 17, attending the physical opening ceremony on December 18 and engaging in live prototype exhibitions and oral defenses on December 19. Following interactive scholarly activities on December 20, the event culminated in the grand award conferral ceremony on December 21, 2025.

Research Contributions and Scientific Focus

The Metroscope delegation comprised six student researchers representing three collaborating institutions, SMP Negeri 1 Metro, SMP Cahaya Bangsa, and SMP Muhammadiyah Ahmad Dahlan Metro—unified under a single collaborative research team. Competing within the Applied Environmental Science division, the investigators addressed atmospheric pollution monitoring in their study entitled "Neutral Buffered Potassium Iodide and Na₂S₂O₃ as Absorbers of Harmful Tropospheric Ozone Using Ozonometric, an IoT-Based Integrated Spectrophotometric Impinger." The team engineered an innovative environmental monitoring system combining chemical absorption methodology with Internet of Things (IoT) hardware to capture, measure, and analyze hazardous tropospheric ozone levels in real time.`,
    stories: [
      {
        slug: 'vien-dhia-feyza-as',
        title: 'Vien Dhia Feyza: The Journey to Winning a Gold Medal at i2ASPO',
        excerpt:
          'In-depth research experience engineering the ozonometric instrument through to defending findings before the UGM jury.',
        publishedAt: at(-15),
        readingMin: 6,
        coverUrl: '/images/students/Vien.jpeg',
        coverAlt: 'Vien Dhia Feyza AS',
      },
    ],
  },
};

const PROGRAM_DETAIL_EXTRA = {
  locale: 'en',
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
    headline: custom?.headline ?? p.name,
    articleType: custom?.articleType ?? 'News & Research Feature Article',
    venue: custom?.venue,
    date: custom?.date,
    delegationStats: custom?.delegationStats,
    researchHighlights: custom?.researchHighlights,
    itineraryPhases: custom?.itineraryPhases,
    gallery: custom?.gallery,
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

const doc = (...nodes: ProseNode[]): ProseNode => ({
  type: 'doc',
  content: nodes,
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
  coverUrl?: string | null;
  coverAlt?: string | null;
  body: ProseNode;
}

const ARTICLE_SEEDS: MockArticleSeed[] = [
  {
    slug: 'science-castle-asia-2025',
    title: 'Science Castle Asia 2025: Young Innovators Present Advanced IoT and Biomedical Solutions',
    subtitle:
      'Elevating Youth Research: High school delegates represent Metro on an international stage at Multimedia University Cyberjaya',
    excerpt:
      'Eleven young researchers from five schools represented Metro at Science Castle Asia 2025, presenting IoT environmental monitoring and antibacterial medical research on an international stage.',
    category: { slug: 'international-competition', name: 'International Competition' },
    tags: [
      { slug: 'international-competition', name: 'International Competition' },
      { slug: 'iot', name: 'IoT' },
      { slug: 'biomedical', name: 'Biomedical Science' },
      { slug: 'environmental-science', name: 'Environmental Science' },
    ],
    readingMin: 6,
    ageDays: -14,
    featured: true,
    coverUrl: '/images/events/sca-2025-award.jpg',
    coverAlt: 'Metroscope delegation receiving awards at Science Castle Asia 2025, MMU Cyberjaya',
    body: doc(
      paragraph(
        'Cyberjaya, Malaysia — The advancement of modern science and technology relies heavily on empowering young minds to transform critical thinking into tangible solutions. To cultivate this vision, Science Castle Asia 2025 served as an international platform for high school students to showcase competitive research and scientific breakthroughs. Hosted at Multimedia University (MMU) Cyberjaya, the conference brought together student researchers, educators, and industry experts from across the region to foster scientific literacy, academic rigor, and global competitiveness.',
      ),
      heading('Fostering a Culture of Scientific Inquiry'),
      paragraph(
        'Science Castle Asia 2025 was organized to nurture early-stage research capabilities, encouraging students to engage directly with complex global challenges in environmental science and healthcare. Beyond standard classroom learning, the initiative challenged participants to execute rigorous scientific methodologies, from formulation and laboratory experimentation to data analysis and peer defense.',
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
      paragraph(
        'IoT-Based Environmental Monitoring: The first research team engineered an Internet of Things (IoT) monitoring system designed to measure and analyze tropospheric ozone pollutants. This system provides real-time data tracking to assist in local air quality assessment and environmental hazard mitigation.',
      ),
      paragraph(
        'Biomedical Research on Natural Antibacterial Agents: The second research team conducted a phytochemical profiling study on Sungkai leaf (Peronema canescens) extracts to evaluate their antibacterial efficacy against Methicillin-Resistant Staphylococcus aureus (MRSA), highlighting the potential of indigenous flora in addressing antibiotic resistance.',
      ),
      paragraph(
        'Through these contributions, the participants demonstrated the impactful role of youth-led research in addressing pressing environmental and health issues on a global scale.',
      ),
    ),
  },
  {
    slug: 'jakarta-international-science-fair-2026',
    title: 'Jakarta International Science Fair (JISF) 2026: Papuan Red Fruit Innovation & Cultural Delegation',
    subtitle:
      'Advancing Global Science: Metroscope researchers present functional food breakthroughs and cultural heritage at i3L University',
    excerpt:
      'Metroscope delegates presented pioneering functional food research on Papuan red fruit at JISF 2026, successfully navigating rigorous hybrid evaluation stages within a premier international academic forum.',
    category: { slug: 'life-sciences', name: 'Life Sciences' },
    tags: [
      { slug: 'life-sciences', name: 'Life Sciences' },
      { slug: 'functional-food', name: 'Functional Food' },
      { slug: 'international-competition', name: 'International Competition' },
      { slug: 'jisf', name: 'JISF' },
    ],
    readingMin: 6,
    ageDays: -7,
    featured: false,
    coverUrl: '/images/events/jisf-2026-smp-5.jpg',
    coverAlt: 'Metroscope delegates presenting their Papuan red fruit research poster at JISF 2026, i3L University',
    body: doc(
      paragraph(
        'Jakarta, Indonesia — Fostering global scientific literacy and cultivating empirical inquiry necessitate robust academic platforms that connect emerging student researchers with international evaluation benchmarks. The Jakarta International Science Fair (JISF) 2026 provided a distinguished forum for secondary and tertiary students to present original empirical investigations, defend methodological frameworks, and engage in cross-disciplinary scholarly discourse. Configured as a hybrid symposium, the conference facilitated remote scholarly defense via Zoom alongside physical presentations hosted at i3L University in Jakarta. This dual modality exposed participants to rigorous multi-tiered evaluation protocols, requiring delegates to articulate complex scientific findings before an international panel of academic reviewers.',
      ),
      heading('Empowering Young Scholars Through Global Academic Engagement'),
      paragraph(
        'Metroscope’s active delegation at JISF 2026 underscores an enduring institutional commitment to transcending conventional pedagogical boundaries. By participating in a competitive international arena, students refine vital research competencies, ranging from systematic hypothesis formulation and laboratory-based analytical testing to persuasive academic discourse. Beyond traditional competition metrics, the initiative prioritizes critical thinking and translational problem-solving. Defending empirical research before an international jury instills scholarly rigor, cultivates academic self-efficacy, and demonstrates the practical viability of student-led scientific investigations addressing contemporary challenges.',
      ),
      heading('An Integrated Hybrid Academic Itinerary'),
      paragraph(
        'The delegation navigated two distinct operational phases throughout the JISF 2026 proceedings. The virtual phase commenced on April 14, 2026, with the inaugural online ceremony and live remote evaluation sessions, culminating in the virtual award ceremony on April 17, 2026. Transitioning to the physical venue at i3L University, participants engaged in the on-site opening ceremony on April 24, 2026, followed by face-to-face oral defenses on April 25, an interactive academic workshop on April 26, and the formal concluding award ceremony on April 27, 2026. This multi-modal structure afforded delegates comprehensive exposure to both digital academic presentation standards and physical scholarly networking.',
      ),
      heading('Research Contributions and Scientific Focus'),
      paragraph(
        'The Metroscope delegation comprised six student researchers representing three collaborating institutions, SMP Negeri 1 Metro, Cahaya Bangsa School, and SMP Muhammadiyah Ahmad Dahlan Metro—unified under a single collaborative research team. Competing within the Life Sciences domain, the investigators addressed a prominent public health challenge through the utilization of indigenous bio-resources in their study entitled "Papuan Red Fruit (Pandanus conoideus) Based Functional Mayonnaise for the Dietary Management of Hypercholesterolaemia and Dyslipidaemia." The research evaluated the formulation of a functional food matrix enriched with bioactive compounds derived from Papuan red fruit, offering a supplementary dietary intervention designed to assist in managing hypercholesterolemia and lipid metabolic disorders.',
      ),
      heading('Event Documentation & Cultural Delegation'),
      paragraph(
        'An interactive documentary gallery captures the key milestones of the Metroscope delegation throughout JISF 2026, highlighting virtual defense sessions, live oral presentations before the academic panel at i3L University, specialized research workshops, and the final conferral proceedings.',
      ),
      paragraph(
        'Over four days (from 24–27 April 2026), participants engaged in scientific competitions, educational visits, cultural exploration, and international networking opportunities across Jakarta. The programme included project exhibitions, judging sessions, educational visits, cultural exploration, and networking opportunities with participants from diverse backgrounds. Students also attended the Opening Ceremony, Farewell Gathering, and Awarding Ceremony.',
      ),
      paragraph(
        'The four-day programme also included educational and cultural visits to the National Museum, the Ministry of Women\'s Empowerment and Child Protection of the Republic of Indonesia (MoWECP), KidZania Jakarta, the Istiqlal Mosque, and several iconic landmarks across Jakarta. Metroscope students also had the honour of representing Indonesia\'s cultural heritage through a performance of Yamko Rambe Yamko, on the international stage at i3L University.',
      ),
    ),
  },
  {
    slug: 'i2aspo-2025',
    title: 'i2ASPO 2025: Metroscope Researchers Present IoT-Integrated Environmental Solutions',
    subtitle:
      'Fostering Applied Innovation: Student innovators showcase tropospheric ozone absorption technology at Universitas Gadjah Mada',
    excerpt:
      'Metroscope delegates demonstrated applied environmental innovation at i2ASPO 2025, presenting an IoT-integrated tropospheric ozone absorption system within an international applied science forum.',
    category: { slug: 'applied-science', name: 'Applied Science' },
    tags: [
      { slug: 'applied-science', name: 'Applied Science' },
      { slug: 'environmental-science', name: 'Environmental Science' },
      { slug: 'iot', name: 'IoT' },
      { slug: 'i2aspo', name: 'i2ASPO' },
    ],
    readingMin: 6,
    ageDays: -21,
    featured: false,
    coverUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80',
    coverAlt: 'Metroscope Researchers at i2ASPO 2025, Universitas Gadjah Mada',
    body: doc(
      paragraph(
        'Yogyakarta, Indonesia — Addressing contemporary ecological challenges requires robust applied research platforms capable of translating theoretical scientific inquiry into tangible technological solutions. The Indonesia International Applied Science Project Olympiad (i2ASPO) 2025 offered a prominent international stage for young researchers to showcase applied science innovations, defend practical product designs, and engage with global scientific evaluators. Conducted as a hybrid symposium, the Olympiad facilitated remote project defenses via Zoom alongside physical exhibition sessions hosted at Universitas Gadjah Mada (UGM) in Yogyakarta. This dual-modal framework evaluated participants on both their theoretical foundation and the functional efficacy of their physical research prototypes.',
      ),
      heading('Empowering Young Innovators Through Applied Science'),
      paragraph(
        'Metroscope’s delegation at i2ASPO 2025 reflects an ongoing institutional dedication to fostering hands-on research competencies and technological innovation among secondary school students. Participation in an applied scientific olympiad challenges emerging scholars to move beyond conventional empirical testing into prototype engineering, functional optimization, and product defense. Navigating strict defense protocols, comprising a concentrated seven-minute oral presentation followed by an eight-minute intensive examination by an international jury panel, instills essential skills in concise scientific communication, analytical defense, and technological translation.',
      ),
      heading('An Integrated Hybrid Competition Framework'),
      paragraph(
        'The delegation navigated two comprehensive phases during the i2ASPO 2025 itinerary. The virtual competition phase commenced on December 9, 2025, with the inaugural online ceremony and preliminary remote judging, continuing through dedicated evaluation sessions on December 10, and concluding with the virtual award ceremony on December 12, 2025. Transitioning to the physical venue at Universitas Gadjah Mada, on-site participants arrived on December 17, attending the physical opening ceremony on December 18 and engaging in live prototype exhibitions and oral defenses on December 19. Following interactive scholarly activities on December 20, the event culminated in the grand award conferral ceremony on December 21, 2025.',
      ),
      heading('Research Contributions and Scientific Focus'),
      paragraph(
        'The Metroscope delegation comprised six student researchers representing three collaborating institutions, SMP Negeri 1 Metro, SMP Cahaya Bangsa, and SMP Muhammadiyah Ahmad Dahlan Metro—unified under a single collaborative research team. Competing within the Applied Environmental Science division, the investigators addressed atmospheric pollution monitoring in their study entitled "Neutral Buffered Potassium Iodide and Na₂S₂O₃ as Absorbers of Harmful Tropospheric Ozone Using Ozonometric, an IoT-Based Integrated Spectrophotometric Impinger." The team engineered an innovative environmental monitoring system combining chemical absorption methodology with Internet of Things (IoT) hardware to capture, measure, and analyze hazardous tropospheric ozone levels in real time.',
      ),
    ),
  },
];

const toCard = (s: MockArticleSeed): ArticleCard => ({
  id: `sample-article-${s.slug}`,
  slug: s.slug,
  title: s.title,
  subtitle: s.subtitle,
  excerpt: s.excerpt,
  locale: 'en',
  featured: s.featured,
  readingMin: s.readingMin,
  publishedAt: at(s.ageDays),
  updatedAt: at(s.ageDays),
  categorySlug: s.category.slug,
  categoryName: s.category.name,
  authorName: 'Metroscope Academic Board',
  coverUrl: s.coverUrl ?? null,
  coverAlt: s.coverAlt ?? null,
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
      slug: 'international-competition',
      name: 'International Competition',
      description: 'Global scientific symposiums, delegations, and international competition showcases.',
      articleCount: MOCK_ARTICLE_CARDS.filter((a) => a.categorySlug === 'international-competition').length,
    },
    {
      slug: 'life-sciences',
      name: 'Life Sciences',
      description: 'Biomedical research, functional food formulations, and health innovations.',
      articleCount: MOCK_ARTICLE_CARDS.filter((a) => a.categorySlug === 'life-sciences').length,
    },
    {
      slug: 'applied-science',
      name: 'Applied Science',
      description: 'Applied engineering, IoT environmental monitoring, and sustainable technology.',
      articleCount: MOCK_ARTICLE_CARDS.filter((a) => a.categorySlug === 'applied-science').length,
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

// ── impacts & achievements ──────────────────────────────────────────────────

export const SAVED_SAMPLE_IMPACTS = [
  {
    id: 'impact-jisf-2026-junior-high',
    slug: 'jisf-2026-junior-high-delegation',
    title: 'Jakarta International Science Fair (JISF) 2026 Delegation',
    subtitle: 'Junior High Delegation Secures Prestigious Accolades in Applied Engineering',
    category: 'GLOBAL_DELEGATION' as const,
    categoryLabel: 'Global Delegation',
    year: '2026',
    location: 'Jakarta, Indonesia',
    metric: 'Gold Medal & Special Commendation',
    metricLabel: 'Competition Result',
    summary:
      'Junior High delegates from Metroscope presented cutting-edge applied science research, defending an IoT-based atmospheric air quality monitoring prototype before a global jury panel.',
    keyTakeaways: [
      'Designed real-time IoT hardware sensor array for tropospheric pollutant detection',
      'Defended quantitative findings in English during rigorous 15-minute jury oral defense',
      'Competed against leading middle school delegations from across the Asia-Pacific region',
    ],
    coverUrl: '/images/events/jisf-2026-smp-1.jpg',
    coverAlt: 'Metroscope Junior High delegation at JISF 2026',
    gallery: [
      { url: '/images/events/jisf-2026-smp-1.jpg', alt: 'Delegates presenting before the jury' },
      { url: '/images/events/jisf-2026-smp-2.jpg', alt: 'Live prototype testing session' },
      { url: '/images/events/jisf-2026-smp-3.jpg', alt: 'Medal ceremony celebration' },
    ],
    articleSlug: 'research-excellence-jisf-2026',
    programSlug: 'event-jisf-2026-junior-high',
    publishedAt: at(-30),
  },
  {
    id: 'impact-sca-2025-cyberjaya',
    slug: 'science-castle-asia-2025-malaysia',
    title: 'Science Castle Asia (SCA) 2025 — Cyberjaya, Malaysia',
    subtitle: 'International Academic Symposium & Sustainable Innovation Presentation',
    category: 'GLOBAL_DELEGATION' as const,
    categoryLabel: 'International Symposium',
    year: '2025',
    location: 'Cyberjaya, Malaysia',
    metric: 'Outstanding International Presenter Award',
    metricLabel: 'Academic Recognition',
    summary:
      'Representing young Indonesian researchers on the global academic stage, Metroscope delegates defended sustainable circular economy solutions and biomedical botanical extracts before corporate and university evaluators.',
    keyTakeaways: [
      'Evaluated by international researchers from Japanese and Malaysian universities',
      'Published conference abstract in official symposium proceeding index',
      'Strengthened cross-border peer networks with fellow young innovators',
    ],
    coverUrl: '/images/events/sca-2025-award.jpg',
    coverAlt: 'Science Castle Asia delegation presentation and award',
    gallery: [
      { url: '/images/events/sca-2025-award.jpg', alt: 'Award acceptance on main stage' },
      { url: '/images/events/sca-2025-delegation.jpg', alt: 'Delegation group photo in Cyberjaya' },
      { url: '/images/events/sca-2025-judging.jpg', alt: 'Symposium poster defense session' },
    ],
    articleSlug: 'science-castle-asia-2025-coverage',
    programSlug: 'event-science-castle-asia-2025',
    publishedAt: at(-120),
  },
  {
    id: 'impact-jisf-2026-elementary',
    slug: 'jisf-2026-elementary-young-inventors',
    title: 'Elementary Scientific Inquiry at JISF 2026',
    subtitle: 'Early-Age Research Literacy Leads to Exceptional Podium Recognition',
    category: 'RESEARCH_INNOVATION' as const,
    categoryLabel: 'Applied Science',
    year: '2026',
    location: 'Jakarta, Indonesia',
    metric: 'Silver Award in Life Sciences',
    metricLabel: 'Division Outcome',
    summary:
      'Young primary school researchers showcased biological antibacterial properties of native agricultural extracts, proving that rigorous scientific methodology starts well before high school.',
    keyTakeaways: [
      'Formulated hypothesis, control groups, and measurable laboratory trials',
      'Synthesized research poster adhering to international symposium standards',
      'Demonstrated public speaking poise and scientific rigor at elementary level',
    ],
    coverUrl: '/images/events/jisf-2026-sd-1.jpg',
    coverAlt: 'Elementary student researchers at JISF 2026',
    gallery: [
      { url: '/images/events/jisf-2026-sd-1.jpg', alt: 'Elementary delegation at display booth' },
      { url: '/images/events/jisf-2026-sd-2.jpg', alt: 'Data chart explanation to evaluators' },
      { url: '/images/events/jisf-2026-sd-3.jpg', alt: 'Certificate and medal award moment' },
    ],
    articleSlug: 'jisf-2026-elementary-breakthrough',
    programSlug: 'event-jisf-2026-elementary',
    publishedAt: at(-45),
  },
];

export const MOCK_IMPACTS: ImpactsData = {
  stats: [
    {
      value: 128,
      suffix: '+',
      label: 'Delegates & Scholars',
      sublabel: 'Trained across Olympiad & Science Fair divisions',
    },
    {
      value: 40,
      suffix: '+',
      label: 'International & National Podiums',
      sublabel: 'Gold, silver, bronze, and special jury commendations',
    },
    {
      value: 100,
      suffix: '%',
      label: 'Oral Defense Pass Rate',
      sublabel: 'Successful research defenses before international juries',
    },
    {
      value: 12,
      suffix: '',
      label: 'Flagship Research Papers',
      sublabel: 'Presented at international scientific conferences',
    },
  ],
  // Emptied per user request - stories will be uploaded via CMS
  items: [],
};
