import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Compass,
  GraduationCap,
  Sparkles,
  Award,
  CheckCircle2,
  Quote,
  BookOpen,
} from 'lucide-react';

import {
  formatDuration,
  formatLevels,
  categoryLabel,
  type PublicProgramDetail,
} from '@/lib/programs-api';

interface Competency {
  title: string;
  desc: string;
}

const COMPETENCIES_BY_CATEGORY: Record<string, Competency[]> = {
  ACADEMIC: [
    {
      title: 'Pemahaman Konseptual Mendalam',
      desc: 'Bukan hafalan pola atau trik instan; membangun intuisi dari prinsip pertama (first principles) teoretis.',
    },
    {
      title: 'Dekomposisi Soal Non-Rutin',
      desc: 'Melatih kemampuan membedah soal olimpiade tingkat lanjut dengan 2-3 metode alternatif kreatif.',
    },
    {
      title: 'Peta Kompetensi 1-on-1',
      desc: 'Pelacakan progres transparan per topik untuk mendiagnosis celah pemahaman spesifik setiap siswa.',
    },
    {
      title: 'Ketahanan Mental Bertanding',
      desc: 'Simulasi kondisi kompetisi dengan batasan waktu nyata untuk memupuk stamina berpikir di bawah tekanan.',
    },
  ],
  NON_ACADEMIC: [
    {
      title: 'Struktur Logis AREL',
      desc: 'Assertion, Reasoning, Evidence, dan Linkback yang tersusun rapi dan tak mudah runtuh saat interupsi.',
    },
    {
      title: 'Riset Isu Kontemporer Global',
      desc: 'Membedah dinamika geopolitik, ekonomi sirkular, kecerdasan buatan, dan kebijakan publik dunia nyata.',
    },
    {
      title: 'Retorika & Poise Panggung',
      desc: 'Mengubah kecemasan berbicara di depan umum menjadi artikulasi yang percaya diri, tenang, dan berbobot.',
    },
    {
      title: 'Kepemimpinan Berbasis Data',
      desc: 'Membentuk generasi muda yang tidak sekadar vokal, tetapi selalu bersuara atas dasar bukti dan empati.',
    },
  ],
  CREATIVE: [
    {
      title: 'Formulasi Ide & Uji Orisinalitas',
      desc: 'Menemukan novelty riset yang tajam, terarah, dan realistis untuk diselesaikan pada jenjang sekolah.',
    },
    {
      title: 'Metodologi Saintifik Terapan',
      desc: 'Perancangan desain eksperimen terukur, survei lapangan, dan pengolahan data beretika ilmiah tinggi.',
    },
    {
      title: 'Penulisan Standar Jurnal Ilmiah',
      desc: 'Menyusun naskah akademik dengan sistematika formal: abstrak tajam, tinjauan pustaka, dan visualisasi grafik.',
    },
    {
      title: 'Penguasaan Sidang & Tanya Jawab',
      desc: 'Coaching presentasi dan strategi menjawab pertanyaan kritis dewan juri dengan tenang berbasis data.',
    },
  ],
};

const FOCUS_BY_CATEGORY: Record<string, string> = {
  ACADEMIC: 'Silabus OSN & Teorema Lanjutan',
  NON_ACADEMIC: 'Riset Mosi & Artikulasi Publik',
  CREATIVE: 'Metodologi Ilmiah & Sidang Juri',
};

const STUDENT_SHOWCASE_BY_CATEGORY: Record<
  string,
  {
    slug: string;
    name: string;
    role: string;
    education: string;
    program: string;
    quote: string;
    imageUrl: string;
  }[]
> = {
  ACADEMIC: [
    {
      slug: 'oktavianus-alexa-pratama',
      name: 'Oktavianus Alexa Pratama',
      role: 'Student Innovator',
      education: 'SMPN 1 Kota Metro',
      program: 'Science Castle Asia (SCA)',
      quote:
        'Melalui bimbingan mentor, saya belajar bahwa sains bukan hafalan rumus yang membosankan, melainkan sarana menemukan solusi atas tantangan lingkungan di sekitar kita.',
      imageUrl: '/images/students/Alex.jpeg',
    },
    {
      slug: 'vien-dhia-feyza-as',
      name: 'Vien Dhia Feyza AS',
      role: 'Student Researcher & Medalist',
      education: 'Cahaya Rancamaya Boarding School',
      program: 'Science Castle Asia & I²ASPO',
      quote:
        'Setiap tantangan yang saya hadapi bersama mentor Metroscope membentuk ketahanan mental saya untuk siap berkompetisi di panggung ilmiah internasional.',
      imageUrl: '/images/students/Vien.jpeg',
    },
  ],
  NON_ACADEMIC: [
    {
      slug: 'bulan-putri-ayu',
      name: 'Bulan Putri Ayu',
      role: 'Youth Role Model & Public Speaker',
      education: 'SMP Unggulan Metro',
      program: 'Metro City Junior High School Star Ambassador',
      quote:
        'Keberanian berbicara runtut dan tenang tidak muncul secara instan, melainkan ditempa melalui latihan terstruktur dan umpan balik yang membangun dari mentor Metroscope.',
      imageUrl: '/images/students/Bulan.jpeg',
    },
  ],
  CREATIVE: [
    {
      slug: 'aura-kirana',
      name: 'Aura Kirana',
      role: 'Team Leader',
      education: 'SMP Cahaya Bangsa',
      program: 'Science Castle Asia (SCA)',
      quote:
        'Menyusun riset dari nol hingga mempresentasikannya di depan dewan juri internasional adalah pengalaman transformatif yang membuka cakrawala masa depan saya.',
      imageUrl: '/images/students/Aura.jpeg',
    },
    {
      slug: 'vien-dhia-feyza-as',
      name: 'Vien Dhia Feyza AS',
      role: 'Student Researcher & Role Model',
      education: 'Cahaya Rancamaya Boarding School',
      program: 'I²ASPO & Science Castle Asia',
      quote:
        'Pendampingan metodologi di Metroscope memastikan penelitian kami memiliki dasar ilmiah yang kokoh dan mampu bertahan di sesi tanya jawab juri.',
      imageUrl: '/images/students/Vien.jpeg',
    },
  ],
};

/**
 * Editorial Article / Portfolio view of a Metroscope mentoring program.
 * Designed as a case study explaining the curriculum framework, philosophy,
 * student outcomes, and methodology without direct-selling commercial elements.
 */
export function ProgramDetail({ program }: { program: PublicProgramDetail }) {
  const competencies =
    COMPETENCIES_BY_CATEGORY[program.category] ?? COMPETENCIES_BY_CATEGORY.ACADEMIC;
  const focusLabel = FOCUS_BY_CATEGORY[program.category] ?? 'Penguasaan Konsep & Strategi';
  const showcases =
    STUDENT_SHOWCASE_BY_CATEGORY[program.category] ?? STUDENT_SHOWCASE_BY_CATEGORY.ACADEMIC;

  // Split long body copy by double linebreaks
  const paragraphs = (program.body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <article className="w-full">
      {/* ── Breadcrumb & Category Badge ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 pb-6">
        <nav aria-label="Breadcrumbs" className="flex items-center gap-2 text-sm text-neutral-400">
          <Link
            href="/programs"
            className="hover:text-maroon inline-flex items-center gap-1.5 font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All Programmes
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-neutral-600 font-normal">{categoryLabel(program.category)}</span>
        </nav>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-maroon/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-maroon uppercase">
          <Compass className="h-3.5 w-3.5" aria-hidden />
          {categoryLabel(program.category)} · Mentoring Portfolio
        </span>
      </div>

      {/* ── Header: Title & Abstract ────────────────────────────────────── */}
      <header className="mt-8">
        <h1 className="font-serif text-[clamp(2.5rem,5.5vw,4.25rem)] leading-[1.08] font-medium tracking-tight text-neutral-900">
          {program.name}
        </h1>

        {program.summary && (
          <p className="mt-6 text-xl sm:text-2xl leading-relaxed font-light text-neutral-600 max-w-3xl">
            {program.summary}
          </p>
        )}

        {/* Editorial Byline */}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-100 pt-6 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-maroon" />
            <span className="font-medium text-neutral-800">Metroscope Academic & Mentoring Board</span>
          </div>
          <span>•</span>
          <span>Curated Portfolio Framework</span>
          <span>•</span>
          <span>Edisi Kurikulum 2026/2027</span>
        </div>
      </header>

      {/* ── Framework Specifications (NO PRICING - Portfolio Specs) ─────── */}
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-3xl border border-neutral-200/80 bg-neutral-50/70 p-6 sm:p-8">
        <div>
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
            <GraduationCap className="h-3.5 w-3.5 text-maroon" aria-hidden />
            Jenjang Siswa
          </dt>
          <dd className="mt-2 text-base font-medium text-neutral-900">
            {formatLevels(program.levels)}
          </dd>
        </div>

        <div>
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
            <Calendar className="h-3.5 w-3.5 text-maroon" aria-hidden />
            Siklus Program
          </dt>
          <dd className="mt-2 text-base font-medium text-neutral-900">
            {formatDuration(program.durationMonths)}
          </dd>
        </div>

        <div>
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
            <Clock className="h-3.5 w-3.5 text-maroon" aria-hidden />
            Intensitas Sesi
          </dt>
          <dd className="mt-2 text-base font-medium text-neutral-900">
            {program.cadence ?? 'Terjadwal'}
          </dd>
        </div>

        <div>
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
            <Sparkles className="h-3.5 w-3.5 text-maroon" aria-hidden />
            Fokus Kerangka
          </dt>
          <dd className="mt-2 text-base font-medium text-neutral-900">
            {focusLabel}
          </dd>
        </div>
      </div>

      {/* ── Cover Image ─────────────────────────────────────────────────── */}
      {program.coverUrl && (
        <figure className="mt-10">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl bg-neutral-100 shadow-lg shadow-neutral-200/50">
            <Image
              src={program.coverUrl}
              alt={program.coverAlt ?? program.name}
              fill
              sizes="(min-width: 1024px) 56rem, 100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />
          </div>
          <figcaption className="mt-3 text-center text-xs text-neutral-400 font-light">
            {program.coverAlt ?? 'Dokumentasi kerangka pendampingan dan inkubasi prestasi Metroscope.'}
          </figcaption>
        </figure>
      )}

      {/* ── Core Competency Pillars Grid ────────────────────────────────── */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <Award className="h-5 w-5 text-maroon" aria-hidden />
          <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
            Pilar Kompetensi yang Dikembangkan
          </h2>
        </div>
        <p className="mt-2 text-sm text-neutral-500 font-light">
          Empat domain keterampilan esensial yang dibangun secara sistematis dalam siklus program ini.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {competencies.map((comp, idx) => (
            <div
              key={comp.title}
              className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm transition-all hover:border-maroon/30 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-maroon/10 text-xs font-semibold text-maroon">
                  0{idx + 1}
                </span>
                <h3 className="font-serif text-lg font-medium text-neutral-900">
                  {comp.title}
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600 font-light">
                {comp.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Article Body Narrative ──────────────────────────────────────── */}
      <section className="mt-16 border-t border-neutral-100 pt-12">
        <div className="prose prose-neutral max-w-none">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="h-5 w-5 text-maroon" aria-hidden />
            <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900 m-0">
              Ulasan Kerangka & Metodologi Program
            </h2>
          </div>

          <div className="space-y-6 text-neutral-700 leading-[1.85] text-lg font-light">
            {paragraphs.map((para, i) => {
              // Highlight lead paragraph with slight drop-in styling
              if (i === 0) {
                return (
                  <p key={i} className="text-xl leading-relaxed text-neutral-800 font-normal">
                    {para}
                  </p>
                );
              }

              // Format numbered / phased paragraphs with distinct badges
              if (
                para.startsWith('Pertama,') ||
                para.startsWith('Kedua,') ||
                para.startsWith('Ketiga,') ||
                para.startsWith('Riset Isu') ||
                para.startsWith('Konstruksi Argumen') ||
                para.startsWith('Simulasi Kamar') ||
                para.startsWith('Eksplorasi Ide') ||
                para.startsWith('Metodologi Saintifik') ||
                para.startsWith('Penulisan Naskah') ||
                para.startsWith('Coaching Sidang')
              ) {
                const parts = para.split(/[:—]/);
                const title = parts[0];
                const rest = parts.slice(1).join('—');
                return (
                  <div
                    key={i}
                    className="my-5 rounded-2xl border-l-4 border-maroon bg-neutral-50/80 p-5 pl-6"
                  >
                    <h4 className="font-medium text-neutral-900 text-base mb-1">{title}</h4>
                    <p className="text-neutral-600 text-base leading-relaxed m-0 font-light">
                      {rest || para}
                    </p>
                  </div>
                );
              }

              return (
                <p key={i} className="text-neutral-700">
                  {para}
                </p>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Student Showcase & Case Studies ─────────────────────────────── */}
      {showcases.length > 0 && (
        <section className="mt-20 border-t border-neutral-100 pt-14">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-maroon text-xs font-semibold tracking-[0.25em] uppercase">
                Portofolio Siswa & Rekam Jejak
              </p>
              <h2 className="mt-2 font-serif text-3xl font-medium tracking-tight text-neutral-900">
                Cerita Nyata dari Peserta Program
              </h2>
            </div>
            <Link
              href="/showcase"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-maroon hover:text-maroon-dark transition-colors"
            >
              Lihat Semua Showcase <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {showcases.map((student) => (
              <div
                key={student.slug}
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-neutral-200/80 bg-white p-7 transition-all hover:border-maroon/30 hover:shadow-lg"
              >
                <div>
                  <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-neutral-100 shrink-0">
                      <Image
                        src={student.imageUrl}
                        alt={student.name}
                        fill
                        className="object-cover object-top"
                      />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-medium text-neutral-900">
                        {student.name}
                      </h3>
                      <p className="text-xs text-neutral-500 font-light">{student.education}</p>
                      <span className="mt-1 inline-block rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700">
                        {student.program}
                      </span>
                    </div>
                  </div>

                  <blockquote className="mt-5 text-sm leading-relaxed text-neutral-600 font-light italic">
                    {student.quote}
                  </blockquote>
                </div>

                <div className="mt-6 pt-4 border-t border-neutral-100">
                  <Link
                    href={`/showcase/${student.slug}`}
                    className="inline-flex items-center text-xs font-medium text-maroon hover:text-maroon-dark transition-colors group/link"
                  >
                    Baca Kisah Lengkap Siswa
                    <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Related Articles Section ────────────────────────────────────── */}
      {program.stories.length > 0 && (
        <section className="mt-16 border-t border-neutral-100 pt-12">
          <p className="text-maroon text-xs font-semibold tracking-[0.25em] uppercase">
            Artikel & Wawasan Terkait
          </p>
          <div className="mt-5 space-y-4">
            {program.stories.map((story) => (
              <Link
                key={story.slug}
                href={`/articles/${story.slug}`}
                className="hover:border-maroon/30 group flex flex-col sm:flex-row gap-5 rounded-3xl border border-neutral-200/80 p-5 transition-all hover:bg-neutral-50/50"
              >
                {story.coverUrl && (
                  <div className="relative h-32 sm:h-24 sm:w-36 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
                    <Image
                      src={story.coverUrl}
                      alt={story.coverAlt ?? story.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="group-hover:text-maroon font-serif text-xl font-medium text-neutral-900 transition-colors">
                    {story.title}
                  </h3>
                  {story.excerpt && (
                    <p className="mt-2 text-sm leading-relaxed text-neutral-500 font-light line-clamp-2">
                      {story.excerpt}
                    </p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-neutral-400">
                    <Clock className="h-3 w-3" aria-hidden />
                    {story.readingMin} menit membaca
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Editorial Portfolio Callout (NO DIRECT SELLING) ─────────────── */}
      <section className="mt-20 overflow-hidden rounded-3xl border border-neutral-200/80 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 p-8 sm:p-12 text-white">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-medium tracking-wider text-neutral-200 uppercase backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-maroon-light" />
            Kolaborasi & Diskusi Kurikulum
          </span>

          <h2 className="mt-6 font-serif text-3xl sm:text-4xl font-medium tracking-tight text-white leading-tight">
            Tertarik Mendiskusikan Kerangka Kurikulum Ini?
          </h2>

          <p className="mt-4 text-neutral-300 font-light leading-relaxed text-base sm:text-lg">
            Metroscope membuka ruang diskusi kurikulum bagi orang tua, pendidik, dan pihak sekolah
            yang ingin menjajaki metodologi pendampingan, pemetaan kompetensi, maupun kolaborasi
            pembinaan kompetisi akademik.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-2xl bg-maroon px-6 py-3.5 text-sm font-medium text-white shadow-md transition-all hover:bg-maroon-dark hover:shadow-lg"
            >
              Jadwalkan Diskusi Kurikulum
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>

            <Link
              href="/programs"
              className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-white/10"
            >
              Lihat Portofolio Program Lain
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
