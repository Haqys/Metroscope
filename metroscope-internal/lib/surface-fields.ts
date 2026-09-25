/**
 * Field specs for the §2.7 collections, in a PLAIN module.
 *
 * Deliberately not exported from `surface-editor.tsx`. That file is
 * `'use client'`, and Next replaces a client module with a reference proxy when
 * a server component imports it, so a named constant read on the server comes
 * back `undefined`. The collection list did exactly that: `TYPE_LABEL[type]`
 * was undefined, the page called `notFound()`, and every collection URL 404'd
 * while the code looked correct.
 *
 * Constants shared across the boundary belong in a module with no directive.
 */
export interface SurfaceField {
  key: string;
  label: string;
  type: 'text' | 'area' | 'number' | 'media' | 'checkbox' | 'tags' | 'date';
  hint?: string;
}

export const FIELDS: Record<string, SurfaceField[]> = {
  faq: [
    { key: 'question', label: 'Pertanyaan', type: 'text' },
    {
      key: 'answer',
      label: 'Jawaban',
      type: 'area',
      hint: 'Satu baris kosong memisahkan paragraf.',
    },
    {
      key: 'category',
      label: 'Kategori',
      type: 'text',
      hint: 'Opsional. Mengelompokkan akordeon.',
    },
    { key: 'orderIndex', label: 'Urutan', type: 'number', hint: 'Kecil tampil lebih dulu.' },
  ],
  testimonial: [
    { key: 'quote', label: 'Kutipan', type: 'area' },
    { key: 'authorName', label: 'Nama', type: 'text' },
    { key: 'authorRole', label: 'Keterangan', type: 'text', hint: 'Misal: Orang tua Aditya, SMP.' },
    { key: 'photoId', label: 'Foto', type: 'media' },
    {
      key: 'consentSource',
      label: 'Catatan izin',
      type: 'text',
      hint: 'Dari mana persetujuannya didapat. Wajib sebelum terbit.',
    },
    { key: 'consentAt', label: 'Tanggal izin', type: 'date' },
    { key: 'featured', label: 'Tampilkan lebih dulu', type: 'checkbox' },
    { key: 'orderIndex', label: 'Urutan', type: 'number' },
  ],
  mentor: [
    { key: 'displayName', label: 'Nama tampil', type: 'text' },
    { key: 'slug', label: 'Alamat (slug)', type: 'text' },
    { key: 'headline', label: 'Satu baris', type: 'text', hint: 'Misal: Mentor OSN Matematika.' },
    { key: 'bio', label: 'Profil', type: 'area' },
    { key: 'photoId', label: 'Foto', type: 'media' },
    { key: 'specialisms', label: 'Spesialisasi', type: 'tags', hint: 'Pisahkan dengan koma.' },
    { key: 'orderIndex', label: 'Urutan', type: 'number' },
  ],
  /**
   * Competitions (§3.4).
   *
   * The marketing half of the row. The operational half, peserta, tim,
   * kesiapan, hasil, lives on `/competitions/[slug]`, because entering a child
   * in a lomba is not an editorial act and the two are gated by different
   * grants. One row, two screens, and neither one is a copy of the other.
   */
  competition: [
    { key: 'name', label: 'Nama lomba', type: 'text' },
    { key: 'slug', label: 'Alamat (slug)', type: 'text', hint: 'Menentukan URL /competitions/…' },
    { key: 'summary', label: 'Ringkasan', type: 'area', hint: 'Satu-dua kalimat untuk kartu.' },
    { key: 'description', label: 'Deskripsi lengkap', type: 'area' },
    { key: 'coverId', label: 'Gambar', type: 'media' },
    { key: 'organizer', label: 'Penyelenggara', type: 'text' },
    { key: 'venue', label: 'Lokasi', type: 'text' },
    { key: 'categories', label: 'Bidang', type: 'tags', hint: 'Pisahkan dengan koma.' },
    {
      key: 'registrationFee',
      label: 'Biaya (Rp)',
      type: 'number',
      hint: 'Angka bulat. Kosongkan kalau belum pasti.',
    },
    {
      key: 'feeNote',
      label: 'Catatan biaya',
      type: 'text',
      hint: 'Untuk biaya bertingkat yang tidak muat di satu angka.',
    },
    { key: 'registrationUrl', label: 'Link pendaftaran', type: 'text' },
    { key: 'guidebookUrl', label: 'Link panduan', type: 'text' },
    { key: 'registrationOpensAt', label: 'Pendaftaran dibuka', type: 'date' },
    { key: 'registrationDeadline', label: 'Deadline pendaftaran', type: 'date' },
    { key: 'eventStart', label: 'Pelaksanaan mulai', type: 'date' },
    { key: 'eventEnd', label: 'Pelaksanaan selesai', type: 'date' },
  ],
};

export const TYPE_LABEL: Record<string, string> = {
  faq: 'FAQ',
  testimonial: 'Testimoni',
  mentor: 'Mentor',
  competition: 'Lomba',
};

/** Types whose props are a list are edited as JSON until a repeater exists. */
export const SUBTITLE: Record<string, string> = {
  faq: 'Jawaban atas keberatan yang paling sering muncul. Tampil di /faq dan di blok FAQ.',
  testimonial: 'Kutipan orang tua. Butuh catatan izin sebelum bisa terbit.',
  mentor: 'Profil publik mentor. Hanya untuk akun tim.',
  competition:
    'Isi publik lomba, tampil di /competitions dan di Info Lomba portal. Peserta dan hasilnya ada di Database Lomba.',
};
