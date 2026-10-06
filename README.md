# Metroscope

Student portal + internal dashboard + CRM + finance + assessment + scheduling.

## Quick start (development)

> ⚠️ **Architecture migration in progress (2026-07-28).** Target: **five independent 
> Next.js projects + Supabase**, deployed on Vercel, see
> [doc 04 v3.0](./docs/04-architecture.md) and [doc 15](./docs/15-repositories-and-migration.md).
> **NestJS, Prisma, production Docker, and BullMQ/Redis workers are removed from the
> design.** The Turborepo was deleted on 2026-07-28 (recovery point: commit `2c24ec9`).

| Project               | Domain                 | Purpose                                     |
| --------------------- | ---------------------- | ------------------------------------------- |
| `metroscope-landing`  | metroscope.id          | Public marketing site (SSG + ISR)           |
| `metroscope-portal`   | portal.metroscope.id   | Student & parent portal                     |
| `metroscope-internal` | internal.metroscope.id | Head · Secretary · Finance · Editor         |
| `metroscope-mentor`   | mentor.metroscope.id   | Mentor workspace                            |
| **`metroscope-api`**  | **api.metroscope.id**  | **All business logic**: Route Handlers only |

**npm, not pnpm.** Each project is standalone with its own `package-lock.json`;
there is no workspace, so there is nothing for `--filter` to select. Run every
command from inside the project directory.

```bash
# 0. Prereqs: Node 22 LTS.
# 1. API first. It owns the schema and every privileged credential.
cd metroscope-api
cp .env.example .env.local        # fill in Supabase, Upstash, secrets
npm ci
npm run db:migrate                # apply supabase/migrations/
npm run db:seed                   # 5 system roles + grants + Head account
npm run dev                       # :3000

# 2. Then whichever surface you need, each in its own directory:
#      metroscope-portal :3001 · metroscope-internal :3002
#      metroscope-mentor :3003 · metroscope-landing  :3004
cd ../metroscope-internal && npm ci && npm run dev

npm run verify                    # guard + typecheck + lint + format:check
```

> ⚠️ **Percent-encode the database password.** Next.js runs dotenv-expand over
> `.env` files, so a literal `$` is substituted with an empty variable and the
> driver receives a truncated credential, surfacing as `password authentication
failed for user "postgres"`, which points at the username rather than the real
> cause. Write `$` as `%24`. Quoting the value does **not** stop the expansion.

Production deploys to **Vercel**: five projects, five pipelines, independent release
cycles. See [docs/08](./docs/08-infrastructure-and-security.md) for topology, backups,
monitoring, and the hardening checklist.

---
