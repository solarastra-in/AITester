# Verity — Multi-Application Automated Test Platform

Verity is a multi-user, multi-application automated QA and browser test generation platform. It automatically crawls, discovers, and generates comprehensive test suites for any web application or API hosted at any target URL.

---

## Key Architectural & Technical Capabilities

### 1. Multi-Application Target Configuration (Dataset Level)

In a multi-user portal testing multiple applications across different domains, environment-level variables like `CORS_ALLOWED_ORIGINS`, `JWT_SECRET`, and `VITE_API_URL` are insufficient because each target application has its own origin, signing secret, and backend API host.

- **Per-Application Dataset Storage**: Application-specific target values are configured at the dataset/test-suite level rather than pinned globally in the platform's `.env`.
- **Supported Configuration Keys**:
  - `VITE_API_URL`: Target application's API endpoint (e.g. `https://api.targetapp.com`), allowing tests to point to staging, dev, or production environments per suite.
  - `JWT_SECRET`: Dedicated HMAC/signing key for generating target-specific authentication tokens and verifying test sessions.
  - `CORS_ALLOWED_ORIGINS`: Origin allowlist (e.g. `https://app.targetapp.com`) used when validating cross-origin assertions.
- **Dataset Configurator UI**: `DatasetConfigurator.tsx` provides dedicated inputs for these target variables with inline validation and a one-click random cryptographic key generator for `JWT_SECRET`.
- **Runtime Template Substitution**: Test steps referencing `{{VITE_API_URL}}`, `{{JWT_SECRET}}`, or `{{CORS_ALLOWED_ORIGINS}}` dynamically resolve to the active application's configured dataset at execution time.

---

### 2. Hardened Site Crawler Completeness

The site crawler (`server/siteCrawler.ts`) extracts the structural, semantic, and interactive footprint of target web applications while strictly respecting SSRF guardrails and origin bounds.

- **Sitemap.xml Discovery & Index Traversal**:
  - Automatically fetches and parses `/sitemap.xml` at the target's root origin.
  - Recursively parses child sitemaps in `<sitemapindex>` containers (one level deep, up to 5 child sitemaps).
  - Seeds discovered URLs directly into the crawl queue at depth 0 alongside link-following for maximum coverage.
- **URL Deduplication & Normalization (`dedupKey`)**:
  - Strips marketing and analytics query parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `fbclid`, `gclid`, `msclkid`, `ref`, `referrer`, `source`, `_ga`).
  - Strips URL fragments (`#...`) to prevent duplicate page visits for client-side anchors.
  - Sorts retained functional query parameters to ensure canonical keys.
- **Accessible Label Extraction (`extractLabelFor`)**:
  - Resolves field labels via `<label for="[field_id]">`, wrapping `<label>` parent elements (cloned and stripped of child input text), and fallback `aria-label` attributes.
  - Enables intuitive test step descriptions and human-readable field prompts.
- **Enhanced Sensitivity Detection**:
  - Evaluates input `type`, `name`, and extracted `label` against `SENSITIVE_FIELD_PATTERN`.
  - Catches obfuscated fields (e.g. `name="field_001"` with label `"Your Secret PIN"`).
  - Preserves user safety: sensitive fields are never auto-filled and are always designated as requiring user-supplied test data.
- **Comprehensive Interactive Control Discovery**:
  - Discovers non-form controls across 5 distinct categories:
    1. **Buttons**: Native `<button>`, `[role="button"]`, `<input type="button">`, `<input type="submit">`.
    2. **JS-Driven Anchors**: Links with `href="#"` or `href="javascript:..."` acting as interactive triggers.
    3. **Onclick Handlers**: Bare elements with `[onclick]` attributes (e.g. custom clickable divs or list items).
    4. **ARIA Controls**: Rich interactive widgets like `[role="tab"]`, `[role="menuitem"]`, `[role="switch"]`, and `[role="checkbox"]`.
    5. **Native Disclosures**: Native `<details> > <summary>` accordion controls.

---

### 3. Robust Browser Test Generation

The test generator (`server/browserTestGenerator.ts`) transforms crawler output into executable Playwright-compatible browser test drafts.

- **Strict Form Scoping (`form:has([name="..."])`)**:
  - Solves the multi-form collision defect (where generic selectors like `form button[type="submit"]` click unrelated forms such as hidden locale switchers).
  - Scopes all input fills and submit clicks using Playwright `:has()` pseudo-class keyed to the form's first field.
- **Smart Named-Field Recognizers**:
  - Uses realistic, synthetic defaults for standard fields:
    - Names: `Jordan`, `Rivera`, `Jordan Rivera`
    - Locations: `Springfield`, `CA`, `94105`, `United States`
    - Company/Role: `Verity QA Testing Co.`, `QA Engineer`
    - Notes/Messages: Automated QA test submission disclaimer
  - Flags account/order identifiers (`order_id`, `account_number`) for manual dataset input.
- **Interactive Controls Test Suites**:
  - Automatically generates suites testing up to 15 non-form interactive controls per page with `continueOnFailure` and console error assertions.
- **Completeness Metrics**:
  - Generation endpoints and UI report `totalUrlsDiscovered`, `pagesCrawled`, `pagesSkipped`, `usedSitemap`, and `interactiveControlsFound`.

---

## Running Tests

Verify the entire test suite (unit, integration, crawler, and browser generator):

```bash
npx vitest run
```

Run targeted crawler and generator tests:

```bash
npx vitest run tests/siteCrawler.test.ts tests/browserTestGenerator.test.ts
```
