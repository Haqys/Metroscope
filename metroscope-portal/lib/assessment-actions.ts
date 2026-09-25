'use client';

/**
 * The ONE assessment write a family has (doc 03 FR-ASV-4, doc 14 §3.5).
 *
 * "Allow an optional appreciation reaction (Helpful / Motivating / Thank you),
 * this is the only feedback the student gives here (assessments are
 * mentor-authored, not free testimonials)."
 *
 * No verb gates it: none of the seventeen means "thank my child's mentor", and
 * pressing it is not an administrative act. `assessment_reactions_write`
 * admits only a guardian of the student the assessment is about, which is also
 * what stops a mentor from reacting to their own work.
 */
export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function reactToAssessment(
  assessmentId: string,
  reaction: 'HELPFUL' | 'MOTIVATING' | 'THANKS',
): Promise<ActionResult<{ reaction: string }>> {
  try {
    const res = await fetch(`/api/bff/assessments/${assessmentId}/reaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    });
    const payload = (await res.json().catch(() => null)) as {
      data?: { reaction: string };
      error?: { message?: string };
    } | null;

    if (res.ok) return { ok: true, data: payload?.data };
    return { ok: false, error: payload?.error?.message ?? 'Gagal mengirim apresiasi.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}
