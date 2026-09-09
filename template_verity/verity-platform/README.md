# Verity — Generic Automated Test Platform

Point it at any site. Upload or AI-generate a test plan. It tells you what
dataset it needs. Run automated HTTP/load tests for real, in-console for
free (capped) or hosted for credits — or export a self-contained Docker
package and run it anywhere, unlimited, free, forever.

This is the full multi-tenant SaaS build: marketing homepage, standalone
signup, org onboarding (platform admin seeds an org + its admin), team
seeding/invites, a generic (not hand-coded) test execution engine, AI test
generation against your own model key, credits billing, and a per-project
downloadable deployment package.

## Everything verified working in this build
- Platform admin bootstrap → org onboarding → seeded org admin → forced
  password reset → team member seeding → standalone self-serve signup
- Generic engine tested against a **real external API** (`api.github.com`):
  structured JSON upload, structured CSV upload, and the **original messy
  markdown test plan** from an earlier engagement — auto-parsed into 13
  runnable HTTP cases + 60 correctly-flagged manual cases
- Real GitHub rate-limit responses came back through the engine — proof
  it's hitting live endpoints, not fixtures
- Hosted execution charged credits correctly (20 → 19), ledger accurate
- AI-generation route confirmed wired to the real Anthropic API (got back
  a genuine `401 authentication_error` when tested with an invalid key)
- Downloaded a project's Docker package, extracted it, `npm install`
  succeeded, and the **standalone runner independently executed a real
  test** against `api.github.com` with no connection to this platform
- Cross-org access denied (403), same-org access allowed (200), platform
  admin override confirmed

## Quick start

```bash
npm install
cp .env.example .env
npm start
# homepage: http://localhost:5000
# console:  http://localhost:5000/console#/login
```

First run prints a platform admin email/password to the console (or set
`PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` before first boot).

### Docker
```bash
docker compose up --build -d
```
`better-sqlite3`'s native binding needs `python3 make g++` to compile on
install — already included in the Dockerfile's base image setup.

## Architecture

```
server.js                 Express app, mounts all routes
lib/db.js                 SQLite schema (users, organizations, invites,
                           projects, suites, test_cases, test_runs, credit_ledger)
lib/auth.js                JWT auth, role middleware
lib/billing.js              Credits ledger + Stripe/Paddle integration seam
lib/specParser.js           Normalizes JSON/CSV/Markdown uploads into one
                           engine-agnostic test spec schema
lib/genericRunner.js        Executes that schema against ANY site_url —
                           no per-test hand-written code
lib/aiGenerate.js           Calls Anthropic/OpenAI (operator's own key) to
                           draft test cases in the same schema
lib/seed.js                First-run platform admin bootstrap
routes/                   auth, admin, org, projects, billing, package
public/index.html          Marketing homepage
public/console/            Auth + role-based SPA (admin/org/workspace views)
standalone-template/       The self-hosted package template — seeded per
                           project at download time by routes/package.js
```

## Roles & journey

| Role | Created by | Can do |
|---|---|---|
| `platform_admin` | First-run bootstrap (env vars) | Onboard organizations, seed org admins, grant/adjust credits, view platform-wide stats |
| `org_admin` | Platform admin, at org creation | Seed/invite team members, view org projects & billing |
| `member` | Org admin (seed or invite link) | Create/run projects under the org's shared credit pool |
| `standalone` | Self-serve `/console#/signup` | Own projects, own credit balance, no org |

## Pricing model (an assumption I made — flag if you want it different)

- **Self-hosted (downloaded Docker package): free and unlimited**, always.
- **In-console "free preview" runs**: free, capped at `PREVIEW_DAILY_CAP`
  (default 15) executions per project per 24h — enough to iterate on a
  suite without paying, not enough to run production monitoring for free.
- **Hosted execution**: 1 credit per automated test run, deducted from the
  org's shared balance (org-scoped projects) or the individual's balance
  (standalone projects).
- **No live payment gateway** is wired — `lib/billing.js#createTopUpIntent`
  is the integration seam for Stripe/Paddle/Razorpay; today, credit
  packages just tell the user to ask a platform admin, who grants credits
  via the Admin console (`POST /api/admin/organizations/:id/credits`).

## What's stubbed / needs real credentials to complete

- **Payment processing** — seam is there, no gateway wired (see above).
- **Transactional email** — invite links and temp passwords are returned
  directly in the API response / shown in the console UI, not emailed.
  Wire an SMTP/SendGrid call in `routes/org.js` and `routes/admin.js`
  wherever a temp password or invite token is generated.
- **AI test generation** requires the operator's own Anthropic or OpenAI
  API key, entered per-generation in the console (never stored server-side
  beyond that request).

## Extending

- New ingestion format → add a case to `lib/specParser.js`, normalize to
  the same `{ type, spec }` schema everything else already understands.
- New assertion capability (e.g. header checks) → extend `expect` handling
  in `lib/genericRunner.js`'s `runHttp`.
- New pricing tier → add a row to `PRICE_TABLE` in `lib/billing.js`.

## Multi-Application & Crawler Completeness Updates

- **Per-Application Target Configuration (Dataset Level)**:
  - `VITE_API_URL`, `JWT_SECRET`, and `CORS_ALLOWED_ORIGINS` are managed per application dataset rather than at the platform environment level.
  - Test suites inject target values dynamically via `{{VITE_API_URL}}`, `{{JWT_SECRET}}`, and `{{CORS_ALLOWED_ORIGINS}}` template parameters.
  - Includes UI support in `DatasetConfigurator.tsx` with cryptographic secret generation.
- **Hardened Site Crawling (`siteCrawler.ts`)**:
  - `sitemap.xml` and sitemap index traversal for automated URL discovery seeded at depth 0.
  - Tracking parameter (`utm_*`, `fbclid`, `gclid`) and anchor hash deduplication via `dedupKey()`.
  - Accessible `<label>` extraction (via `label[for]`, wrapping `<label>`, and `aria-label`).
  - Multi-attribute sensitivity detection (`type`, `name`, `label`).
  - Interactive element discovery covering buttons, JS anchors, onclick handlers, ARIA widgets, and disclosures.
- **Form-Scoped Browser Test Generation (`browserTestGenerator.ts`)**:
  - Eliminates multi-form collision bugs using Playwright `form:has([name="..."])` scoped selectors.
  - Smart named-field recognition for realistic synthetic form data.
  - Automated interactive controls test suites exercising non-form controls without console errors.

