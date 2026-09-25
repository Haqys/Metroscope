'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Shared form-control styling so every form looks identical.
 * Import `fieldBase` when you need the raw class on a custom element.
 */
export const fieldBase =
  'w-full rounded-xl border bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400';

const fieldTone = {
  normal: 'border-neutral-300 focus:border-navy focus:ring-navy/20',
  error: 'border-maroon/60 focus:border-maroon focus:ring-maroon/20',
};

function toneOf(invalid?: boolean) {
  return invalid ? fieldTone.error : fieldTone.normal;
}

/* ------------------------------------------------------------------ Field */

interface FieldProps {
  label?: React.ReactNode;
  /** Small grey note next to the label, e.g. "opsional". */
  hint?: React.ReactNode;
  /** Helper text under the control. */
  description?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

/** Label + control + description/error wrapper with consistent spacing. */
export function Field({
  label,
  hint,
  description,
  error,
  required,
  className,
  children,
  htmlFor,
}: FieldProps) {
  return (
    <div className={cn('block', className)}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-800">
            {label}
            {required && <span className="text-maroon ml-0.5">*</span>}
          </label>
          {hint && <span className="text-xs text-neutral-400">{hint}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-maroon mt-1.5 text-xs font-medium">{error}</p>
      ) : (
        description && <p className="mt-1.5 text-xs text-neutral-400">{description}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Input */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(fieldBase, 'h-12 py-3', toneOf(invalid), className)}
    {...props}
  />
));
Input.displayName = 'Input';

/* --------------------------------------------------------------- Textarea */

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, rows = 4, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    aria-invalid={invalid || undefined}
    className={cn(fieldBase, 'resize-none py-3 leading-relaxed', toneOf(invalid), className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

/* ----------------------------------------------------------------- Select */

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, 'h-12 appearance-none py-3 pr-10', toneOf(invalid), className)}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400"
      aria-hidden
    />
  </div>
));
Select.displayName = 'Select';

/* -------------------------------------------------------------- PillGroup */

export interface PillOption<T extends string> {
  value: T;
  label: string;
  /** Optional colour classes applied when selected. */
  activeClass?: string;
}

/* ------------------------------------------------------------ RadioGroup */

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** Classic radio row group, for mutually exclusive choices in forms. */
export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  columns = 3,
  className,
}: {
  options: readonly RadioOption<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  label?: string;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns];
  return (
    <div className={cn('grid gap-2.5', cols, className)} role="radiogroup" aria-label={label}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors',
              active ? 'border-navy bg-navy-light/50' : 'hover:border-navy/40 border-neutral-300',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                active ? 'border-navy' : 'border-neutral-300',
              )}
              aria-hidden
            >
              {active && <span className="bg-navy h-2 w-2 rounded-full" />}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-sm font-medium',
                  active ? 'text-navy' : 'text-neutral-700',
                )}
              >
                {opt.label}
              </span>
              {opt.description && (
                <span className="mt-0.5 block text-xs text-neutral-400">{opt.description}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Switch */

/** Accessible on/off toggle. */
export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'focus:ring-navy/25 relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus:ring-2 focus:outline-none',
          checked ? 'bg-navy' : 'bg-neutral-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
          aria-hidden
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-800">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-neutral-400">{description}</span>
        )}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------- FileDrop */

/** Dashed upload affordance (wiring to real storage is TODO). */
export function FileDrop({
  label = 'Lampirkan File',
  hint,
  icon,
}: {
  label?: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="hover:border-navy/40 hover:bg-navy-light/20 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center transition-colors"
    >
      <span className="text-neutral-400">{icon}</span>
      <span className="text-sm font-medium text-neutral-600">{label}</span>
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </button>
  );
}

/** Radio group rendered as selectable pills (roles, priorities, slots…). */
export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: readonly PillOption<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="radiogroup" aria-label={label}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-xl font-medium transition-all duration-150',
              size === 'sm' ? 'px-3.5 py-2 text-xs' : 'px-4 py-2.5 text-sm',
              active
                ? (opt.activeClass ?? 'bg-navy shadow-navy/20 text-white shadow-sm')
                : 'hover:ring-navy/40 bg-white text-neutral-600 ring-1 ring-neutral-300',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
