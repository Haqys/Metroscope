import { Check } from 'lucide-react';

export interface WizardStep {
  label: string; // "Data Anak"
}

/** Accent per surface: maroon for customer forms, navy for internal ones. */
export type WizardTone = 'maroon' | 'navy';

const TONE: Record<WizardTone, { bg: string; text: string; ring: string }> = {
  maroon: { bg: 'bg-maroon', text: 'text-maroon', ring: 'ring-maroon/15' },
  navy: { bg: 'bg-navy', text: 'text-navy', ring: 'ring-navy/15' },
};

/** Numbered wizard section with an accent dot rail + connector line. */
export function WizardSection({
  number,
  title,
  subtitle,
  isLast = false,
  tone = 'maroon',
  children,
}: {
  number: number;
  title: string;
  subtitle: string;
  isLast?: boolean;
  tone?: WizardTone;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-5 sm:gap-7">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${TONE[tone].bg}`}
        >
          {number}
        </span>
        {!isLast && <span className="mt-2 w-0.5 flex-1 rounded-full bg-neutral-200" aria-hidden />}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-10'}`}>
        <h2 className="pt-1.5 text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
        <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

/**
 * Shared 4-step indicator for input wizards (docs/05: step-wizard).
 * `completed` marks how many leading steps are done; `active` is the
 * current one (usually the first incomplete step).
 */
export function Stepper({
  steps,
  completed,
  active,
  tone = 'maroon',
}: {
  steps: WizardStep[];
  completed: number;
  active: number;
  tone?: WizardTone;
}) {
  const t = TONE[tone];
  return (
    <ol className="flex items-start">
      {steps.map((step, i) => {
        const isDone = i < completed;
        const isActive = i === active;
        return (
          <li key={step.label} className="flex flex-1 items-start last:flex-none">
            <div className="flex w-16 flex-col items-center sm:w-24">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  isDone
                    ? `${t.bg} text-white`
                    : isActive
                      ? `${t.bg} text-white ring-4 ${t.ring}`
                      : 'bg-white text-neutral-400 ring-1 ring-neutral-300'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={`mt-2 text-center text-[11px] leading-tight font-medium sm:text-xs ${
                  isDone || isActive ? t.text : 'text-neutral-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={`mt-[17px] h-0.5 flex-1 rounded-full transition-colors ${
                  i < completed ? t.bg : 'bg-neutral-200'
                }`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
