import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  What the signed-in caller may change about themselves.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deliberately narrow. `users` also holds `status`, `primary_role_id` and the
 * role grants, and none of those belong to the person they describe: an
 * account that can promote itself is not an account, it is a back door.
 * `users_update_self` allows the row, this schema decides the columns.
 */
export const UpdateProfile = z
  .object({
    fullName: z.string().min(2, 'Nama minimal 2 karakter').max(120).optional(),
    displayName: z.string().min(1).max(60).nullable().optional(),
    phone: z
      .string()
      .max(32)
      .regex(/^[0-9+()\s-]*$/, 'Nomor telepon hanya boleh angka dan tanda + ( ) -')
      .nullable()
      .optional(),
    bio: z.string().max(500).nullable().optional(),
    /** Set by `POST /v1/me/photo/confirm`; clearing it removes the avatar. */
    photoUrl: z.string().url().nullable().optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof UpdateProfile>;

/**
 * Notification preferences are (channel, category) pairs the caller can switch
 * off. EMAIL is the only channel that exists (doc 08 §4 removed WhatsApp), but
 * the column is kept general so an added channel does not need a migration.
 */
export const UpdatePreferences = z
  .object({
    preferences: z
      .array(
        z.object({
          /** The database enum is `notification_channel`, IN_APP with the underscore. */
          channel: z.enum(['EMAIL', 'IN_APP']),
          category: z.string().min(1).max(40),
          enabled: z.boolean(),
        }),
      )
      .max(40),
  })
  .strict();

export type UpdatePreferencesInput = z.infer<typeof UpdatePreferences>;

export const ListNotifications = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

export type ListNotificationsInput = z.infer<typeof ListNotifications>;

/** An avatar upload asks for a signed URL, then confirms once the PUT lands. */
export const PhotoUpload = z
  .object({
    filename: z.string().min(1).max(200),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    /** Bytes. Kept small: this is a face, not a poster. */
    size: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024, 'Foto maksimal 5 MB'),
  })
  .strict();

export type PhotoUploadInput = z.infer<typeof PhotoUpload>;

export const ConfirmPhoto = z.object({ storageKey: z.string().min(1).max(300) }).strict();

/**
 * The three fields a guardian owns on their own child (FR-SET-1..3).
 *
 * Not `students` in general: the write goes through
 * `app.update_student_self()`, whose signature is the allowlist. Level,
 * points and account status are not here and must never be, a family that can
 * set its own `account_status` has stopped needing to pay.
 */
export const UpdateStudentSettings = z
  .object({
    parentName: z.string().max(120).nullable().optional(),
    parentPhone: z
      .string()
      .max(32)
      .regex(/^[0-9+()\s-]*$/, 'Nomor telepon hanya boleh angka dan tanda + ( ) -')
      .nullable()
      .optional(),
    showOnLeaderboard: z.boolean().optional(),
  })
  .strict();

export type UpdateStudentSettingsInput = z.infer<typeof UpdateStudentSettings>;
