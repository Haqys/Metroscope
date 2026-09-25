import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { MyContentList, type MyContentItem } from '@/components/internal/my-content-list';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Konten Saya' };

/* Dummy, the signed-in author's own submissions. TODO: `GET /content?author=me`. */
const MY_CONTENT: MyContentItem[] = [
  {
    id: 'c1',
    title: 'Juara 1 OSN Kota. Aditya Pratama',
    type: 'PORTFOLIO',
    status: 'PENDING',
    submittedAt: '2 jam lalu',
    featuredStudent: 'Aditya Pratama',
    body: 'Selamat kepada Aditya Pratama yang berhasil meraih Juara 1 pada Olimpiade Sains Nasional tingkat Kota Jakarta Selatan tahun 2026. Pencapaian ini adalah hasil kerja keras dan bimbingan intensif bersama mentor Metroscope.',
  },
  {
    id: 'c3',
    title: 'Story Trial Class Juli',
    type: 'IG_STORY',
    status: 'PENDING',
    submittedAt: 'Kemarin',
    body: 'Rangkuman kegiatan kelas bulan Juli dalam format story Instagram, 5 slide, closing dengan ajakan konsultasi gratis.',
  },
  {
    id: 'c4',
    title: 'Artikel: Tips Hadapi OSK',
    type: 'ARTICLE',
    status: 'PENDING',
    submittedAt: '2 hari lalu',
    body: 'Lima strategi praktis menghadapi OSK: kenali pola soal, atur waktu pengerjaan, kuasai materi dasar, latihan soal tahun sebelumnya, dan jaga kondisi fisik menjelang hari-H.',
  },
  {
    id: 'c7',
    title: 'Story Trial Class Juni',
    type: 'IG_STORY',
    status: 'NEEDS_REVISION',
    submittedAt: '1 minggu lalu',
    revisionNote:
      'Tolong ganti istilah "trial class", sekarang kita memakai "konsultasi gratis". Selain itu, tambahkan CTA ke halaman pendaftaran di slide terakhir.',
    body: 'Rangkuman kegiatan trial class bulan Juni dalam format story Instagram.',
  },
  {
    id: 'c9',
    title: 'Pengumuman Jadwal Libur Idul Adha',
    type: 'ANNOUNCEMENT',
    status: 'APPROVED',
    submittedAt: '2 minggu lalu',
    body: 'Kegiatan belajar diliburkan pada 6–8 Juni 2026. Sesi pengganti akan dijadwalkan ulang oleh Sekretaris.',
  },
  {
    id: 'c10',
    title: 'Porto Finalis OSP. Bagas Nugroho',
    type: 'PORTFOLIO',
    status: 'APPROVED',
    submittedAt: '3 minggu lalu',
    featuredStudent: 'Bagas Nugroho',
    body: 'Bagas Nugroho berhasil menembus babak final Olimpiade Sains Provinsi 2026 untuk bidang Matematika.',
  },
];

/**
 * Internal, the author's own content and its approval status (doc 12 §6).
 * Editors and Mentors submit here; the Head reviews at `/content-approval`.
 */
export default function MyContentPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Konten Saya"
        subtitle="Konten yang kamu ajukan beserta statusnya. Yang dikembalikan Balqis bisa langsung direvisi."
        action={
          <Link
            href="/content/new"
            className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Konten Baru
          </Link>
        }
      />

      <div className="mt-8">
        <MyContentList items={MY_CONTENT} />
      </div>
    </div>
  );
}
