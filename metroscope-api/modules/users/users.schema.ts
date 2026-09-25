import { z } from 'zod';

export const ListUsersQuery = z
  .object({
    /** Staff only by default, customers are a different population entirely. */
    scope: z.enum(['staff', 'all']).default('staff'),
    q: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const UpdateUserRoles = z
  .object({
    roles: z.array(z.string().min(2).max(32)).min(1, 'Akun harus punya minimal satu role.').max(10),
    primaryRole: z.string().min(2).max(32),
  })
  .strict()
  /**
   * The primary role decides where the account lands after login. If it is not
   * one the account holds, login sends them to a page they cannot open.
   */
  .refine((v) => v.roles.includes(v.primaryRole), {
    message: 'Role utama harus salah satu role yang dimiliki.',
    path: ['primaryRole'],
  });

export const CreateUser = z
  .object({
    fullName: z.string().min(3, 'Nama lengkap minimal 3 karakter').max(120),
    displayName: z.string().max(60).optional(),
    email: z.string().email('Format email tidak valid').max(200),
    phone: z.string().max(30).optional(),
    roles: z.array(z.string().min(2).max(32)).min(1, 'Pilih minimal satu role').max(10),
    primaryRole: z.string().min(2).max(32),
  })
  .strict()
  .refine((v) => v.roles.includes(v.primaryRole), {
    message: 'Role utama harus salah satu role yang dipilih.',
    path: ['primaryRole'],
  });

export const UpdateUserStatus = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict();

export type CreateUserInput = z.infer<typeof CreateUser>;
export type ListUsersQueryInput = z.infer<typeof ListUsersQuery>;
export type UpdateUserRolesInput = z.infer<typeof UpdateUserRoles>;
export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatus>;

export interface StaffMember {
  id: string;
  fullName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  status: string;
  roles: string[];
  primaryRole: string | null;
}
