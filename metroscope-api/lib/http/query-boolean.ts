import { z } from 'zod';

/**
 * A boolean that arrives as a query-string value.
 *
 * `z.coerce.boolean()` is the obvious choice and it is WRONG here: coercion is
 * `Boolean(value)`, and `Boolean("false")` is `true`, as is `Boolean("0")` and
 * `Boolean("no")`. Every non-empty string is truthy. So `?handled=false` asked
 * for handled rows, `?featured=false` asked for featured articles, and
 * `?deleted=false` asked for deleted media. Each read as a filter doing nothing
 * rather than a filter doing the opposite, which is why none of them was
 * noticed: the caller usually omits the parameter and gets the default.
 *
 * Found when the contact inbox rendered "no new messages" while a message sat
 * unhandled in the table (doc 14 §2.7).
 *
 * This accepts the forms a browser and a fetch client actually send, and
 * rejects anything else rather than guessing.
 */
export const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');
