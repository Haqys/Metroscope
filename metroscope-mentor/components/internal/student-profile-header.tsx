import { cn } from '@/lib/utils';
import type { StudentDirectoryRow } from '@/lib/api';
import { PAY_LABEL, PAY_TONE, formatDate, formatIdr } from '@/lib/progress-display';

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-neutral-800">
        {value ?? <span className="text-neutral-300">Belum diisi</span>}
      </dd>
    </div>
  );
}

/**
 * Identity card for the 360° profile (wireframe: Ringkasan 4/7).
 *
 * Real as of §3.6. `parentPhone: '0812-xxxx-xxxx'` and `school: 'SMPN 5
 * Jakarta'` were fixture strings shown for every student; the fields are now
 * the student's own, and one that has not been filled in says so rather than
 * borrowing somebody else's.
 */
export function StudentProfileHeader({ student }: { student: StudentDirectoryRow }) {
  const initials = student.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <div className="flex flex-col items-center text-center">
        <span className="from-navy to-navy-dark shadow-navy/20 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-xl font-bold text-white shadow-md">
          {initials}
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-neutral-900">
          {student.name}
        </h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          {student.programNames || 'Belum terdaftar di program mana pun'}
        </p>
        <span
          className={cn(
            'mt-3 rounded-full px-3 py-1 text-xs font-semibold',
            PAY_TONE[student.payStatus],
          )}
        >
          {PAY_LABEL[student.payStatus]}
        </span>
      </div>

      <dl className="mt-6 space-y-4 border-t border-neutral-100 pt-5">
        <Field label="Orang Tua" value={student.parentName} />
        <Field label="Bergabung Sejak" value={formatDate(student.joinDate)} />
        <Field label="Sekolah" value={student.school} />
        <Field label="Jenjang" value={student.level} />
        <Field
          label="Tagihan Terbuka"
          value={student.outstanding > 0 ? formatIdr(student.outstanding) : 'Tidak ada'}
        />
      </dl>
    </div>
  );
}
