# Metroscope. Landing Website

Production: <https://metroscope.id>

Public marketing site: programs, articles, competition calendar, mentor
profiles, testimonials, FAQ, and the registration form.

**Statically rendered.** Content is fetched at build/ISR time and revalidated
by tag when the CMS publishes. The API is deliberately kept out of the request
path: otherwise page TTFB would inherit API cold starts and an API incident
would take down the top of the funnel (doc 04 section 2.2).

## Rules this project must not break

| Rule                                                           | Why                                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| No business logic here                                         | It belongs to `metroscope-api`. Duplicated rules drift, and drifted rules about money and minors are the expensive kind.          |
| No `SUPABASE_SERVICE_ROLE_KEY`                                 | It bypasses RLS entirely. `npm run guard` fails the build if a privileged value is exposed.                                       |
| Client components call `/api/bff/*`, never `api.metroscope.id` | Keeps the access token out of browser JavaScript, so an XSS cannot become account takeover.                                       |
| Tokens live in HttpOnly cookies                                | Never `localStorage`.                                                                                                             |
| Middleware is routing, not permission                          | Every protected byte is authorised by the API, which assumes requests may arrive from cURL with a valid token for the wrong role. |

## Getting started

```bash
cp .env.example .env.local   # then fill in the values
npm ci
npm run dev
```

Runs on <http://localhost:3004>. Health check: `/api/health`.

## Scripts

| Script              | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Development server                                          |
| `npm run build`     | Production build                                            |
| `npm run typecheck` | `tsc --noEmit`                                              |
| `npm run lint`      | ESLint                                                      |
| `npm run format`    | Prettier write                                              |
| `npm run guard`     | Fails if a privileged secret is exposed to the client       |
| `npm run verify`    | guard + typecheck + lint + format:check, run before pushing |

## Deploying

Independent Vercel project. It does not import from any other Metroscope repo,
so it can be deployed on its own schedule.

**Deploy `metroscope-api` first** when the API contract changed: the API is
additive within `/v1`, so an API deploy never breaks a running frontend, the
reverse is not true (doc 15 section 5.3).

## Documentation

- `docs/04-architecture.md`, system design, auth, RLS, communication
- `docs/15-repositories-and-migration.md`, repo layout, CI/CD, migration
- `docs/02-sitemap.md`, routes for every surface
- `docs/13-product-blueprint.md`, information architecture
