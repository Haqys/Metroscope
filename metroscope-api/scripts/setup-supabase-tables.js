const postgres = require('postgres');
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_URL or DATABASE_URL environment variable is required');
  process.exit(1);
}

const INITIAL_ARTICLES = [
  {
    id: 'art-science-castle-asia-2025',
    slug: 'science-castle-asia-2025',
    title: 'Science Castle Asia 2025: Young Innovators Present Advanced IoT and Biomedical Solutions',
    subtitle: 'Elevating Youth Research: High school delegates represent Metro on an international stage at Multimedia University Cyberjaya',
    excerpt: 'Eleven young researchers from five schools represented Metro at Science Castle Asia 2025, presenting IoT environmental monitoring and antibacterial medical research on an international stage.',
    locale: 'en',
    status: 'PUBLISHED',
    featured: true,
    reading_min: 6,
    published_at: '2025-10-21T00:00:00.000Z',
    updated_at: '2025-10-21T00:00:00.000Z',
    category_slug: 'international-competition',
    category_name: 'International Competition',
    author_name: 'Metroscope Academic Board',
    cover_url: '/images/events/sca-2025-award.jpg',
    cover_alt: 'Metroscope delegation receiving awards at Science Castle Asia 2025, MMU Cyberjaya',
    tags: [
      { slug: 'international-competition', name: 'International Competition' },
      { slug: 'iot', name: 'IoT' },
      { slug: 'biomedical', name: 'Biomedical Science' },
      { slug: 'environmental-science', name: 'Environmental Science' }
    ],
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Cyberjaya, Malaysia — The advancement of modern science and technology relies heavily on empowering young minds to transform critical thinking into tangible solutions. To cultivate this vision, Science Castle Asia 2025 served as an international platform for high school students to showcase competitive research and scientific breakthroughs. Hosted at Multimedia University (MMU) Cyberjaya, the conference brought together student researchers, educators, and industry experts from across the region to foster scientific literacy, academic rigor, and global competitiveness.' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Fostering a Culture of Scientific Inquiry' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Science Castle Asia 2025 was organized to nurture early-stage research capabilities, encouraging students to engage directly with complex global challenges in environmental science and healthcare. Beyond standard classroom learning, the initiative challenged participants to execute rigorous scientific methodologies, from formulation and laboratory experimentation to data analysis and peer defense.' }]
        },
        {
          type: 'image',
          attrs: { src: '/images/events/sca-2025-judging.jpg', alt: 'Metroscope delegates defending their research during oral judging at Science Castle Asia 2025' }
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'By stepping onto an international stage, participants gained invaluable exposure to competitive research environments. The program aims to build student confidence, enhance cross-cultural collaboration, and demonstrate that secondary school students can produce meaningful research with real-world applications.' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'From National Selection to the International Stage' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'The journey began with an open call for research submissions, where teams submitted comprehensive research essays adhering to strict academic guidelines. Following a thorough review process by the scientific committee, the shortlisted finalists were officially announced on July 18, 2025.' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'The main conference took place on October 18–19, 2025, at MMU Cyberjaya, where finalists presented their findings through oral defenses and interactive poster sessions. To conclude the program, participants joined an educational field trip on October 20, 2025, offering hands-on learning experiences outside the competitive setting and expanding their professional networks.' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Key Contributions and Research Highlights' }]
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'IoT-Based Environmental Monitoring: The first research team engineered an Internet of Things (IoT) monitoring system designed to measure and analyze tropospheric ozone pollutants.' }] }]
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Biomedical Research on Natural Antibacterial Agents: The second research team conducted a phytochemical profiling study on Sungkai leaf (Peronema canescens) extracts to evaluate antibacterial efficacy against MRSA.' }] }]
            }
          ]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Through these contributions, the participants demonstrated the impactful role of youth-led research in addressing pressing environmental and health issues on a global scale.' }]
        }
      ]
    }
  },
  {
    id: 'art-jisf-2026',
    slug: 'jakarta-international-science-fair-2026',
    title: 'Jakarta International Science Fair (JISF) 2026: Papuan Red Fruit Innovation & Cultural Delegation',
    subtitle: 'Advancing Global Science: Metroscope researchers present functional food breakthroughs and cultural heritage at i3L University',
    excerpt: 'Metroscope delegates presented pioneering functional food research on Papuan red fruit at JISF 2026, successfully navigating rigorous hybrid evaluation stages within a premier international academic forum.',
    locale: 'en',
    status: 'PUBLISHED',
    featured: false,
    reading_min: 6,
    published_at: '2026-04-28T00:00:00.000Z',
    updated_at: '2026-04-28T00:00:00.000Z',
    category_slug: 'life-sciences',
    category_name: 'Life Sciences',
    author_name: 'Metroscope Academic Board',
    cover_url: '/images/events/jisf-2026-smp-5.jpg',
    cover_alt: 'Metroscope delegates presenting their Papuan red fruit research poster at JISF 2026, i3L University',
    tags: [
      { slug: 'life-sciences', name: 'Life Sciences' },
      { slug: 'functional-food', name: 'Functional Food' },
      { slug: 'international-competition', name: 'International Competition' },
      { slug: 'jisf', name: 'JISF' }
    ],
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Jakarta, Indonesia — Fostering global scientific literacy and cultivating empirical inquiry necessitate robust academic platforms that connect emerging student researchers with international evaluation benchmarks. The Jakarta International Science Fair (JISF) 2026 provided a distinguished forum for secondary and tertiary students to present original empirical investigations, defend methodological frameworks, and engage in cross-disciplinary scholarly discourse. Configured as a hybrid symposium, the conference facilitated remote scholarly defense via Zoom alongside physical presentations hosted at i3L University in Jakarta.' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Empowering Young Scholars Through Global Academic Engagement' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Metroscope’s active delegation at JISF 2026 underscores an enduring institutional commitment to transcending conventional pedagogical boundaries. By participating in a competitive international arena, students refine vital research competencies, ranging from systematic hypothesis formulation and laboratory-based analytical testing to persuasive academic discourse.' }]
        },
        {
          type: 'image',
          attrs: { src: '/images/events/jisf-2026-smp-1.jpg', alt: 'Metroscope junior high delegates during exhibition presentation at JISF 2026' }
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Research Contributions and Scientific Focus' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'The Metroscope delegation comprised six student researchers representing three collaborating institutions, SMP Negeri 1 Metro, Cahaya Bangsa School, and SMP Muhammadiyah Ahmad Dahlan Metro—unified under a single collaborative research team. Competing within the Life Sciences domain, the investigators addressed a prominent public health challenge through the utilization of indigenous bio-resources in their study entitled "Papuan Red Fruit (Pandanus conoideus) Based Functional Mayonnaise for the Dietary Management of Hypercholesterolaemia and Dyslipidaemia."' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Event Documentation & Cultural Delegation' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Over four days (from 24–27 April 2026), participants engaged in scientific competitions, educational visits, cultural exploration, and international networking opportunities across Jakarta. Metroscope students also had the honour of representing Indonesia\'s cultural heritage through a performance of Yamko Rambe Yamko on the international stage at i3L University.' }]
        }
      ]
    }
  },
  {
    id: 'art-i2aspo-2025',
    slug: 'i2aspo-2025',
    title: 'i2ASPO 2025: Metroscope Researchers Present IoT-Integrated Environmental Solutions',
    subtitle: 'Fostering Applied Innovation: Student innovators showcase tropospheric ozone absorption technology at Universitas Gadjah Mada',
    excerpt: 'Metroscope delegates demonstrated applied environmental innovation at i2ASPO 2025, presenting an IoT-integrated tropospheric ozone absorption system within an international applied science forum.',
    locale: 'en',
    status: 'PUBLISHED',
    featured: false,
    reading_min: 6,
    published_at: '2025-12-22T00:00:00.000Z',
    updated_at: '2025-12-22T00:00:00.000Z',
    category_slug: 'applied-science',
    category_name: 'Applied Science',
    author_name: 'Metroscope Academic Board',
    cover_url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80',
    cover_alt: 'Metroscope Researchers at i2ASPO 2025, Universitas Gadjah Mada',
    tags: [
      { slug: 'applied-science', name: 'Applied Science' },
      { slug: 'environmental-science', name: 'Environmental Science' },
      { slug: 'iot', name: 'IoT' },
      { slug: 'i2aspo', name: 'i2ASPO' }
    ],
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Yogyakarta, Indonesia — Addressing contemporary ecological challenges requires robust applied research platforms capable of translating theoretical scientific inquiry into tangible technological solutions. The Indonesia International Applied Science Project Olympiad (i2ASPO) 2025 offered a prominent international stage for young researchers to showcase applied science innovations, defend practical product designs, and engage with global scientific evaluators.' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Empowering Young Innovators Through Applied Science' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Metroscope’s delegation at i2ASPO 2025 reflects an ongoing institutional dedication to fostering hands-on research competencies and technological innovation among secondary school students. Participation in an applied scientific olympiad challenges emerging scholars to move beyond conventional empirical testing into prototype engineering, functional optimization, and product defense.' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Research Contributions and Scientific Focus' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'The Metroscope delegation comprised six student researchers representing three collaborating institutions, SMP Negeri 1 Metro, SMP Cahaya Bangsa, and SMP Muhammadiyah Ahmad Dahlan Metro—unified under a single collaborative research team. Competing within the Applied Environmental Science division, the investigators addressed atmospheric pollution monitoring in their study entitled "Neutral Buffered Potassium Iodide and Na₂S₂O₃ as Absorbers of Harmful Tropospheric Ozone Using Ozonometric, an IoT-Based Integrated Spectrophotometric Impinger."' }]
        }
      ]
    }
  }
];

async function setup() {
  const sql = postgres(connectionString);

  try {
    console.log('1. Creating articles table in public schema...');
    await sql`
      CREATE TABLE IF NOT EXISTS public.articles (
        id text PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        title text NOT NULL,
        subtitle text,
        excerpt text,
        locale text NOT NULL DEFAULT 'id',
        status text NOT NULL DEFAULT 'PUBLISHED',
        featured boolean NOT NULL DEFAULT false,
        reading_min integer NOT NULL DEFAULT 5,
        published_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        category_slug text,
        category_name text,
        author_name text DEFAULT 'Metroscope Academic Board',
        cover_url text,
        cover_alt text,
        tags jsonb DEFAULT '[]'::jsonb,
        body jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb,
        blocks jsonb DEFAULT '[]'::jsonb,
        created_at timestamptz DEFAULT now()
      );
    `;

    console.log('2. Creating impacts table in public schema...');
    await sql`
      CREATE TABLE IF NOT EXISTS public.impacts (
        id text PRIMARY KEY,
        title text NOT NULL,
        subtitle text,
        category text,
        category_label text,
        year text,
        location text,
        metric text,
        summary text,
        key_takeaways jsonb DEFAULT '[]'::jsonb,
        cover_url text,
        status text NOT NULL DEFAULT 'PUBLISHED',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `;

    console.log('3. Setting up Row Level Security and permissions for Anon & Authenticated users...');
    await sql`ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;`;
    await sql`ALTER TABLE public.impacts ENABLE ROW LEVEL SECURITY;`;

    // Drop existing policies if any
    await sql`DROP POLICY IF EXISTS "Public can view published articles" ON public.articles;`;
    await sql`DROP POLICY IF EXISTS "Anyone can insert articles" ON public.articles;`;
    await sql`DROP POLICY IF EXISTS "Anyone can update articles" ON public.articles;`;
    await sql`DROP POLICY IF EXISTS "Anyone can delete articles" ON public.articles;`;

    // Create full access policies for anon & authenticated so CMS and landing site can read/write
    await sql`
      CREATE POLICY "Allow public read access to articles"
      ON public.articles FOR SELECT
      USING (true);
    `;
    await sql`
      CREATE POLICY "Allow anon and auth insert articles"
      ON public.articles FOR INSERT
      WITH CHECK (true);
    `;
    await sql`
      CREATE POLICY "Allow anon and auth update articles"
      ON public.articles FOR UPDATE
      USING (true)
      WITH CHECK (true);
    `;
    await sql`
      CREATE POLICY "Allow anon and auth delete articles"
      ON public.articles FOR DELETE
      USING (true);
    `;

    // Impacts policies
    await sql`DROP POLICY IF EXISTS "Allow public read access to impacts" ON public.impacts;`;
    await sql`DROP POLICY IF EXISTS "Allow anon and auth insert impacts" ON public.impacts;`;
    await sql`DROP POLICY IF EXISTS "Allow anon and auth update impacts" ON public.impacts;`;
    await sql`DROP POLICY IF EXISTS "Allow anon and auth delete impacts" ON public.impacts;`;

    await sql`
      CREATE POLICY "Allow public read access to impacts"
      ON public.impacts FOR SELECT
      USING (true);
    `;
    await sql`
      CREATE POLICY "Allow anon and auth insert impacts"
      ON public.impacts FOR INSERT
      WITH CHECK (true);
    `;
    await sql`
      CREATE POLICY "Allow anon and auth update impacts"
      ON public.impacts FOR UPDATE
      USING (true)
      WITH CHECK (true);
    `;
    await sql`
      CREATE POLICY "Allow anon and auth delete impacts"
      ON public.impacts FOR DELETE
      USING (true);
    `;

    // Grant schema permissions
    await sql`GRANT ALL ON public.articles TO anon, authenticated, service_role;`;
    await sql`GRANT ALL ON public.impacts TO anon, authenticated, service_role;`;

    console.log('4. Seeding initial Metroscope articles...');
    for (const art of INITIAL_ARTICLES) {
      await sql`
        INSERT INTO public.articles (
          id, slug, title, subtitle, excerpt, locale, status, featured, reading_min,
          published_at, updated_at, category_slug, category_name, author_name,
          cover_url, cover_alt, tags, body
        ) VALUES (
          ${art.id}, ${art.slug}, ${art.title}, ${art.subtitle}, ${art.excerpt},
          ${art.locale}, ${art.status}, ${art.featured}, ${art.reading_min},
          ${art.published_at}, ${art.updated_at}, ${art.category_slug}, ${art.category_name},
          ${art.author_name}, ${art.cover_url}, ${art.cover_alt},
          ${JSON.stringify(art.tags)}, ${JSON.stringify(art.body)}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          subtitle = EXCLUDED.subtitle,
          excerpt = EXCLUDED.excerpt,
          body = EXCLUDED.body,
          cover_url = EXCLUDED.cover_url,
          cover_alt = EXCLUDED.cover_alt,
          tags = EXCLUDED.tags,
          updated_at = now();
      `;
    }

    const count = await sql`SELECT count(*) FROM public.articles;`;
    console.log('SUCCESS! Articles in Supabase table:', count[0].count);

  } catch (err) {
    console.error('Setup failed:', err);
  } finally {
    await sql.end();
  }
}

setup();
