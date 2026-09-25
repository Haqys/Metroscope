import { z } from 'zod';

/**
 * Auth contracts. Strict, like every other module: an unknown key on a login
 * request is a client bug or an attack, never something to ignore.
 */
export const Login = z
  .object({
    email: z.string().email(),
    // No max/complexity rules here: this validates a login, not a signup. The
    // only thing that matters is that it is a non-empty string to compare.
    password: z.string().min(1),
  })
  .strict();

export const Refresh = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export const RequestReset = z
  .object({
    email: z.string().email(),
  })
  .strict();

export const RequestOtp = z
  .object({
    email: z.string().email(),
  })
  .strict();

export type LoginInput = z.infer<typeof Login>;
export type RefreshInput = z.infer<typeof Refresh>;
export type RequestResetInput = z.infer<typeof RequestReset>;
export type RequestOtpInput = z.infer<typeof RequestOtp>;
