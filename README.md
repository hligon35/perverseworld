# Perverse World

Branded multi-page streetwear storefront, AlphaZoneLabs admin shell, Cloudflare Worker and Expo hybrid app.

## Public pages

| URL | Content |
| --- | --- |
| `/` | Brand hero, featured products, signature collection and newsletter |
| `/shop` | Complete product catalog, size selection and bag |
| `/collections` | Collection discovery and featured artwork |
| `/collections/tees` | Graphic tees |
| `/collections/hoodies` | Hoodies |
| `/collections/sets` | Sets and graphics |
| `/about` | Brand story |
| `/contact` | Contact form and social links |
| `/admin/` | Access-protected operations dashboard |

Pages share the original visual identity and original product photography, extracted into reusable image files. The WebView Expo app loads the same site. Page transitions and refreshes keep bag selections for the current browser session, including products added through the API. Existing id/size-only sessions are migrated.

## Development

```bash
npm ci --workspaces=false
npm run build
npm run db:local
npm run dev
```

`npm run build` generates eight complete HTML documents in `dist/`, copies shared assets and the protected admin UI, checks JavaScript and runs the test suite. It requires only Node.js; no frontend framework or browser rendering is needed. Product cards, navigation, titles and descriptions are present before JavaScript runs. Client code enhances catalog filtering, live products, the bag and verified forms; it never switches pages by hiding unrelated sections.

With the local Worker running and the local migration applied, `npm run smoke` checks direct URLs, trailing-slash redirects, 404 responses, protected admin/API paths and the seeded catalog. `npm run mobile:check` checks the retained Expo wrapper's syntax. Install the mobile workspace dependencies separately for an Expo simulator or device build; a native device build is not part of the static web build.

Cloudflare Workers Builds should use `npm ci --workspaces=false` as its install command and `npm run build` as its build command. Static output is `dist/`, as configured in `wrangler.toml`. Ordinary static hosting can also serve these generated files when configured to resolve `/shop` to `shop.html` and other extensionless paths similarly; API/admin security requires the Worker. Workers assets use `html_handling = "drop-trailing-slash"` and a genuine 404 document. There is no SPA fallback or index rewrite.

## Cloudflare setup

Deployment is intentionally blocked by `npm run deploy:verify` while configuration is incomplete. The repository currently contains an unconfigured D1 ID, Access issuer/audience, admin email allowlist and public Turnstile key. No remote configuration, domain binding or live verification is implied by a passing local build.

Before deployment, verify:

- Actual D1 database ID and applied production migrations.
- Cloudflare Access application/policy covering `/admin*` and `/api/admin/*`, matching JWT issuer/audience and admin email allowlist. Worker authentication remains required for all admin documents and assets, even on workers.dev.
- Turnstile public key, Worker secret `TURNSTILE_SECRET`, widget hostnames `perverseworld.com` and `www.perverseworld.com`, and both action names.
- Worker secret `RESEND_API_KEY`, verified outbound sender/domain, and inbound Email Routing to the Worker's email handler.
- Both custom domains/DNS bindings and the Workers Builds connection to **hligon35/perverseworld**, branch `main`.

Use `npm run deploy` as the connected deployment command. Wrangler's custom build also runs the guard when Cloudflare sets `WORKERS_CI=1`, blocking even the default Workers Builds deployment command until verification is acknowledged. The [Cloudflare build environment documentation](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables) describes this variable. Disable any other automatic release pipelines until configuration is verified. Direct local `wrangler deploy` bypasses the npm deployment guard and must not be used before verification. The acknowledgement below records the operator's remote verification; the guard itself does not inspect Cloudflare account state. Do not commit secrets.

```bash
npm run db:remote
# Only after the remote checks above (PowerShell):
$env:CLOUDFLARE_CONFIGURATION_VERIFIED = "true"
npm run deploy
```

Current shopping bag and checkout are a **demo**, not a payment-integrated commerce system. Confirm product prices and inventory before launch.

## Structure

- `src/site/layout.html` — shared document layout and asset imports
- `src/site/components/` — shared header, footer, bag, hero, catalog, story and newsletter
- `src/site/pages/` — actual content for each storefront page
- `src/site/routes.js` — route metadata used during generation
- `src/site/products.json` — preview catalog and original image references
- `scripts/build.mjs` — dependency-free static generator; `dist/` is ignored and rebuilt cleanly
- `public/assets/css/` — original design, page layouts and form styles
- `public/assets/js/` — catalog/bag behavior and live API/Turnstile integration
- `public/assets/images/` — seven deduplicated original logo/artwork/product files
- `public/brand-ui.js`, `public/brand-ui.css` — Material Symbols and studio attribution
- `public/admin/` — AlphaZoneLabs-style protected admin UI
- `src/worker.js` — public routes, protected APIs and email integration
- `migrations/` — D1 schema
- `apps/mobile/` — Expo shell

Official repository: **hligon35/perverseworld** (no dash).

## Cloudflare Turnstile

Turnstile is integrated into **newsletter subscriptions** and **contact submissions**. Each form renders its own challenge, with action names `newsletter` and `contact`; the Worker verifies every submitted token using Cloudflare's Siteverify endpoint, including success, hostname and expected action. Tokens are never trusted solely on the client. When the widget is unconfigured, the public forms fail closed.

1. In the Cloudflare dashboard, open **Turnstile**, create a managed widget for `perverseworld.com` (and `www.perverseworld.com` if used), then copy its **site key** and **secret key**.
2. Set `TURNSTILE_SITE_KEY` in the reviewed `wrangler.toml` to the **public site key** (a nonsecret variable). The variable is included in the public `/api/config` response. If managing variables in the dashboard instead, update the deployment guard to inspect that reviewed configuration and avoid overwriting it with blank file values.
3. Store the **secret key only as a Worker secret**:

   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```

4. For local development, set equivalent values in an untracked `.dev.vars` file. The API rejects unverified requests even when testing locally. The Worker compares the Siteverify hostname to `PUBLIC_BASE_URL`; if using a `localhost` testing widget, configure `TURNSTILE_ALLOW_LOCALHOST=true` only for development.
5. Deploy with `npm run deploy` and verify newsletter signup and contact submissions on the live domain. Avoid using real mailing-list addresses for test submissions.

**Security:** Do not place `TURNSTILE_SECRET` in `wrangler.toml`, `.env.example`, frontend code, or GitHub. The domain and secret must be configured in the actual Cloudflare account before the forms can accept submissions.
