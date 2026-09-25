import { sql, type SQL } from 'drizzle-orm';

/**
 * Bind a string list as ONE parameter, as a real Postgres `text[]`.
 *
 * `SET levels = ${['SD','SMP']}` looks right and is not: drizzle expands a JS
 * array into separate placeholders, so it compiles to `SET levels = ($1, $2)`,
 * a row expression, which Postgres rejects. The same shape in an INSERT fails
 * the same way.
 *
 * It failed loudly here, which is the lucky case. The dangerous one is a
 * SINGLE-element list: `($1)` is valid SQL that Postgres reads as a plain
 * parenthesised scalar, so a one-level programme would have silently stored
 * something else instead of erroring.
 *
 * One JSON parameter, unnested server-side, still fully parameterised.
 */
export function textArray(values: string[]): SQL {
  return sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(values)}::jsonb))::text[]`;
}
