/**
 * The 16 action verbs (doc 04 §8.5 / doc 12 §10.2), for the role editor.
 *
 * Page grants decide what a role can SEE; these decide what it can DO. The
 * editor previously offered only pages, which meant a custom role could be
 * given the finance screens and never the ability to act on them, visible,
 * inert, and indistinguishable from a bug to whoever held it.
 *
 * The API owns the authoritative list (`lib/auth/actions.ts`) and rejects
 * anything outside it, so this file is labels only. Kept in the same order as
 * the API's array to make the two easy to diff by eye.
 */
export interface ActionDef {
  value: string;
  label: string;
  hint: string;
  group: string;
  /** Grants other grants. Worth a visual warning in the editor. */
  dangerous?: boolean;
}

export const ACTION_CATALOGUE: ActionDef[] = [
  {
    value: 'lead.approve',
    label: 'Setujui pendaftar',
    hint: 'Meloloskan pendaftar ke tahap berikutnya dan mengonversinya jadi siswa.',
    group: 'Funnel',
  },
  {
    value: 'lead.reject',
    label: 'Tolak pendaftar',
    hint: 'Menutup pendaftar dengan alasan.',
    group: 'Funnel',
  },
  {
    value: 'invoice.issue',
    label: 'Terbitkan tagihan',
    hint: 'Mengubah draf tagihan jadi tagihan nyata yang dikirim ke keluarga.',
    group: 'Keuangan',
  },
  {
    value: 'invoice.void',
    label: 'Batalkan tagihan',
    hint: 'Membatalkan tagihan yang salah.',
    group: 'Keuangan',
  },
  {
    value: 'payment.verify',
    label: 'Verifikasi pembayaran',
    hint: 'Menyetujui bukti transfer. Ini yang mengakui uang masuk.',
    group: 'Keuangan',
  },
  {
    value: 'payment.record',
    label: 'Catat pembayaran',
    hint: 'Mencatat pembayaran manual (mis. tunai).',
    group: 'Keuangan',
  },
  {
    value: 'content.publish',
    label: 'Terbitkan konten',
    hint: 'Menayangkan artikel ke situs publik.',
    group: 'Konten',
  },
  {
    value: 'content.review',
    label: 'Review konten',
    hint: 'Menyetujui atau meminta revisi draf.',
    group: 'Konten',
  },
  {
    value: 'user.manage',
    label: 'Kelola akun',
    hint: 'Membuat, mengubah, dan menonaktifkan akun tim.',
    group: 'Administrasi',
  },
  {
    value: 'role.manage',
    label: 'Kelola role',
    hint: 'Membuat role dan menentukan izinnya, termasuk izin ini sendiri.',
    group: 'Administrasi',
    dangerous: true,
  },
  {
    value: 'student.edit',
    label: 'Ubah data siswa',
    hint: 'Mengubah catatan siswa.',
    group: 'Akademik',
  },
  {
    value: 'session.manage',
    label: 'Atur jadwal sesi',
    hint: 'Membuat dan menjadwal ulang sesi.',
    group: 'Akademik',
  },
  {
    value: 'assessment.submit',
    label: 'Isi assessment',
    hint: 'Mengirim penilaian siswa.',
    group: 'Akademik',
  },
  {
    value: 'progress.edit',
    label: 'Ubah progress',
    hint: 'Menandai penguasaan topik.',
    group: 'Akademik',
  },
  {
    value: 'settings.edit',
    label: 'Ubah pengaturan',
    hint: 'Program, harga, rekening organisasi.',
    group: 'Administrasi',
  },
  {
    value: 'data.export',
    label: 'Ekspor data',
    hint: 'Mengunduh data sebagai CSV.',
    group: 'Administrasi',
  },
];

export const ACTION_GROUPS = [...new Set(ACTION_CATALOGUE.map((a) => a.group))];

export const actionsInGroup = (group: string) => ACTION_CATALOGUE.filter((a) => a.group === group);
